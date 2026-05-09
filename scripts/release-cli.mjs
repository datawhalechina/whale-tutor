#!/usr/bin/env node
// 一键发布 cli-node 到 npm + 自动打 tag + push。
//
// 用法:
//   pnpm release:cli                # bump patch (默认)
//   pnpm release:cli:minor          # bump minor
//   pnpm release:cli:major          # bump major
//   pnpm release:cli -- --dry-run   # 跑全流程但不真的 publish/push (本地试)
//
// 流程(顺序敏感,某步失败会中断):
//   1. 校验 git 工作区干净 + 在 main 分支
//   2. pnpm build:cli-bundle (重建 _bundle/)
//   3. cd packages/cli-node && npm install (解析 file:./_bundle 依赖)
//   4. npm version <type>  →  改 package.json + 创建 git commit + tag (本地)
//   5. npm publish --access public  →  推到 npm registry
//   6. git push --follow-tags  →  推 commit + tag 到 GitHub
//
// 失败恢复(常见):
//   - publish 失败(网络 / 未登录):本地已有 commit + tag,先 `npm login`,
//     然后 cd packages/cli-node && npm publish --access public 重试;成功后
//     再 git push --follow-tags
//   - 想完全撤回 step 4:
//       cd packages/cli-node && git tag -d vX.Y.Z && git reset --hard HEAD~1
//
// 不做的事(故意):
//   - 不写 CHANGELOG (人工写或后续接 changesets)
//   - 不创 GitHub Release (人工跑 `gh release create vX.Y.Z`,生成 release notes)
//   - 不发 PR / 不开 issue 等远程动作

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLI_DIR = resolve(ROOT, 'packages/cli-node');

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
  return JSON.parse(readFileSync(resolve(CLI_DIR, 'package.json'), 'utf8')).version;
}

console.log(`=== release cli-node ===`);
console.log(`  bump:    ${bumpType}`);
console.log(`  current: v${readPkgVersion()}`);
console.log(`  dry-run: ${dryRun ? 'YES (skips npm publish + git push)' : 'NO'}`);

// === 1. 校验 git 状态 ===
const dirty = check('git status --porcelain');
if (dirty) {
  console.error('\n✗ 工作区不干净,先 commit / stash 再发版:');
  console.error(dirty.split('\n').map((l) => '  ' + l).join('\n'));
  process.exit(1);
}

const branch = check('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') {
  console.error(`\n✗ 当前分支是 ${branch},不是 main。发版只在 main 上进行。`);
  console.error('  如需在其他分支发预览版,请手工跑 npm publish --tag <next/beta/...>');
  process.exit(1);
}

// 校验有上游 remote
try {
  check('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
} catch {
  console.error('\n✗ 当前分支没有 upstream remote (无法 push)。先 `git push -u origin main`。');
  process.exit(1);
}

// === 2-6. 流水线 ===
run('pnpm build:cli-bundle');
run('npm install --no-audit --no-fund', CLI_DIR);

// npm version 会改 package.json + git add + git commit -m "release(cli): vX.Y.Z" + git tag vX.Y.Z
// 默认 tag 前缀就是 'v',跟 GitHub Release 习惯一致。
run(`npm version ${bumpType} -m "release(cli): v%s"`, CLI_DIR);

const newVersion = readPkgVersion();
console.log(`\n  → 已 bump 到 v${newVersion}`);

run('npm publish --access public', CLI_DIR);
run('git push --follow-tags');

console.log(`\n${'='.repeat(50)}`);
console.log(`✓ Released whale-tutor v${newVersion}`);
console.log(`${'='.repeat(50)}`);
console.log(`\n下一步(手工):`);
console.log(`  npm:  https://www.npmjs.com/package/whale-tutor/v/${newVersion}`);
console.log(`  GitHub Release(写 release notes):`);
console.log(`    gh release create v${newVersion} --generate-notes`);
