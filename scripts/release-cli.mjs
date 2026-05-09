#!/usr/bin/env node
// 一键发布 cli-node 到 npm + 自动 bump version + commit + tag + push,全程原子。
//
// 用法:
//   pnpm release:cli                # bump patch (默认)
//   pnpm release:cli:minor          # bump minor
//   pnpm release:cli:major          # bump major
//   pnpm release:cli:dry-run        # 跑全流程但不真的 publish/push (本地预览)
//
// 流程(顺序敏感,失败 fail-fast):
//   1. 校验:git 工作区干净 + 在 main 分支 + 有 upstream
//   2. pnpm build:cli-bundle (重建 _bundle/)
//   3. npm install (在 cli-node,装 node_modules,不修改 tracked 文件)
//   4. 显式 bump version(只改 package.json,不让 npm 自己管 git)
//   5. 显式 git add + commit + tag(确定无 npm config 干扰)
//   6. git push --follow-tags(commit + tag 一次推上去)
//   7. npm publish --access public(只在 push 成功后才 publish,避免发布悬空)
//
// 为什么 push 在 publish 之前?
//   传统 npm 流程是 publish→push,如果 push 失败 npm 已发出去就回不来了,
//   user 得手动 git push 把 bump commit 补上(这就是上次踩到的坑)。
//   反过来 push→publish:push 失败可以重试,publish 失败可以重试,bump
//   commit 总是先入 git。代价:npm publish 失败时 GitHub 上有 tag 但 npm
//   上没有那个版本号 — 但这种悬空可以重跑 npm publish 修复,可见性比反过来高。
//
// 失败恢复:
//   - step 4-5 失败:本地 package.json 可能已 bump,git tag/commit 没创成。
//     `git checkout packages/cli-node/package.json` 撤回 bump,排查原因后重跑
//   - step 6 (push) 失败:本地 commit + tag 已创建。
//     先排查(常见:没 upstream / 没权限),修复后 `git push --follow-tags` 重试
//   - step 7 (publish) 失败:commit + tag 已在 GitHub,npm 上没有该版本。
//     修问题(常见:没 npm login)后 `cd packages/cli-node && npm publish --access public` 重试
//   - 想完全撤回(commit + tag 已 push,npm 已发布):上 npm unpublish (72 小时内可),
//     然后 `git push origin :refs/tags/vX.Y.Z` 删远端 tag + git revert 那个 commit
//
// 不做的事(故意):
//   - 不写 CHANGELOG (人工写或后续接 changesets)
//   - 不创 GitHub Release (人工跑 `gh release create vX.Y.Z --generate-notes`)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLI_DIR = resolve(ROOT, 'packages/cli-node');
const CLI_PKG = resolve(CLI_DIR, 'package.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bumpType = args.find((a) => ['patch', 'minor', 'major'].includes(a)) || 'patch';

function run(cmd, cwd = ROOT) {
  console.log(`\n→ ${cmd}${cwd !== ROOT ? `   (cwd: ${cwd.replace(ROOT, '.')})` : ''}`);
  if (dryRun && (cmd.startsWith('npm publish') || cmd.startsWith('git push'))) {
    console.log(`  [dry-run] skipped`);
    return;
  }
  execSync(cmd, { stdio: 'inherit', cwd });
}

function check(cmd, cwd = ROOT) {
  return execSync(cmd, { cwd }).toString().trim();
}

function readPkgVersion() {
  return JSON.parse(readFileSync(CLI_PKG, 'utf8')).version;
}

function fail(msg, hint) {
  console.error(`\n✗ ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

console.log(`=== release cli-node ===`);
console.log(`  bump:    ${bumpType}`);
console.log(`  current: v${readPkgVersion()}`);
console.log(`  dry-run: ${dryRun ? 'YES (skips npm publish + git push)' : 'NO'}`);

// === 1. 校验 git 状态 ===

const dirty = check('git status --porcelain');
if (dirty) {
  fail(
    '工作区不干净,先 commit / stash 再发版:\n' +
      dirty.split('\n').map((l) => '    ' + l).join('\n'),
  );
}

const branch = check('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  fail(
    `当前分支是 ${branch},不是 main。发版只在 main 上进行。`,
    '如需发预览版,手工跑 cd packages/cli-node && npm publish --tag <next/beta/...>',
  );
}

try {
  check('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
} catch {
  fail(
    '当前分支没有 upstream remote (无法 push)。',
    '先跑 git push -u origin main',
  );
}

// === 2. build bundle ===

run('pnpm build:cli-bundle');

// === 3. install cli-node deps ===
// 解析 file:./_bundle/... — 不会修改 tracked 文件(node_modules/ 和 package-lock.json
// 都被 cli-node/.gitignore 忽略),所以接下来 git 仍然干净
run('npm install --no-audit --no-fund', CLI_DIR);

// 二次确认 tree 还干净(防 npm install 意外动了 tracked 文件)
const dirtyAfterInstall = check('git status --porcelain');
if (dirtyAfterInstall) {
  fail(
    'npm install 后工作区变脏了,这不应该发生:\n' +
      dirtyAfterInstall.split('\n').map((l) => '    ' + l).join('\n'),
    '排查 cli-node/.gitignore 是不是漏了 package-lock.json 或 node_modules',
  );
}

// === 4. 显式 bump version (只改文件,不让 npm 管 git) ===
// `--no-git-tag-version` 让 npm version 只 bump package.json,不创 commit/tag。
// 我们在下面 step 5 自己显式 commit + tag,避免依赖用户 npm config 里的
// `git-tag-version` 设置(如果他们关了,npm version 就只 bump 不入 git,bug 难查)
const versionBefore = readPkgVersion();
run(`npm version ${bumpType} --no-git-tag-version`, CLI_DIR);
const versionAfter = readPkgVersion();

if (versionBefore === versionAfter) {
  fail(
    `npm version 没 bump 版本号(仍然是 v${versionBefore})`,
    '排查 cli-node/package.json 是否合法',
  );
}
console.log(`  ✓ Bumped v${versionBefore} → v${versionAfter}`);

const tagName = `v${versionAfter}`;
const commitMsg = `release(cli): ${tagName}`;

// === 5. 显式 commit + tag ===

run(`git add ${CLI_PKG.replace(ROOT + '\\', '').replace(ROOT + '/', '').replace(/\\/g, '/')}`);
run(`git commit -m "${commitMsg}"`);
run(`git tag -a ${tagName} -m "${tagName}"`);

const newCommit = check('git rev-parse HEAD');
console.log(`  ✓ Created commit ${newCommit.slice(0, 8)} + tag ${tagName}`);

// === 6. push 先 (commit + tag 一起) ===
// 故意把 push 放在 publish 之前 — push 失败可重试,publish 失败也可重试,
// 但 publish 成功后 push 失败就麻烦了(npm 上有版本,GitHub 上没 commit/tag)
try {
  run('git push --follow-tags');
} catch {
  fail(
    'git push 失败',
    '排查后(常见:网络/权限),重跑 git push --follow-tags;不需要重跑整个 release:cli',
  );
}

if (!dryRun) {
  // 验证远端真的拿到了
  const localHead = check('git rev-parse HEAD');
  const remoteHead = check('git rev-parse @{u}');
  if (localHead !== remoteHead) {
    fail(
      `push 完成但远端 HEAD 跟本地不一致`,
      `本地 ${localHead.slice(0, 8)} vs 远端 ${remoteHead.slice(0, 8)};手工 git push 排查`,
    );
  }
  console.log(`  ✓ Pushed to ${check('git rev-parse --abbrev-ref @{u}')}`);
}

// === 7. publish (只在 push 成功后才走) ===

try {
  run('npm publish --access public', CLI_DIR);
} catch {
  fail(
    `npm publish 失败,但 commit + tag ${tagName} 已经在 GitHub`,
    `修复后(常见:没 npm login),重跑 cd packages/cli-node && npm publish --access public`,
  );
}

// === 8. 收尾 ===

console.log(`\n${'='.repeat(60)}`);
console.log(`✓ Released whale-tutor ${tagName}`);
console.log(`${'='.repeat(60)}`);
console.log(`\n下一步(手工生成 release notes):`);
console.log(`  gh release create ${tagName} --generate-notes`);
console.log(`\n查看:`);
console.log(`  npm:  https://www.npmjs.com/package/whale-tutor/v/${versionAfter}`);
// 用两次单字段 format 拼接,避开 Windows shell 不剥单引号导致的 `'%s'` 被当路径的坑
const lastHash = check('git log -1 --format=%h');
const lastSubj = check('git log -1 --format=%s');
console.log(`  git:  ${lastHash} ${lastSubj}`);
