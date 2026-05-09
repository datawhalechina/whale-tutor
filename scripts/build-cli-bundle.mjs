// 构建 whale-tutor 分发包内嵌的 _bundle 资产 — 单 CLI(npm 包)。
//
// 流程:
//   1. clean — 清掉 packages/cli-node/_bundle/{server,web,db,templates}
//   2. pnpm build — 生成 server/dist + web/dist + tutor-types/dist
//   3. 准备 server bundle(中间产物 build/server-bundle/):
//      a. 复制 server/dist + server/package.json
//      b. 复制 packages/tutor-types(含 dist) 到 server-bundle/_local/tutor-types/
//      c. 改 server-bundle/package.json 的 workspace:* 为 file:./_local/tutor-types
//   4. cli-node:
//      - 复制 server-bundle 到 cli-node/_bundle/server/
//      - 不跑 npm install — 用户 npm install 时 cli-node/package.json 的 deps 会装 server runtime 依赖
//   5. _bundle/ 补 web / db/init / templates / MANIFEST.json
//
// 跑法:`pnpm build:cli-bundle` (root package.json 中的 script)
//
// 历史:v0.3 之前同时维护 cli-py(pip 包)与 cli-node(npm 包),共享同一个 server-bundle 中间产物。
// v0.3 删 cli-py:Node 反正必装(server 是 NestJS),pip 包多绕一层 subprocess + 包大 30+ MB
// (因为 pip 没法触发 npm,得 build 时 `npm install --omit=dev` 把 node_modules 一起 ship)+
// 双 CLI 每加一个命令(init/start/doctor/lint/build)都要写两份,维护税不划算。

import { execSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const BUNDLE_NODE = join(ROOT, 'packages/cli-node/_bundle');
const SERVER_BUNDLE_SRC = join(ROOT, 'build/server-bundle'); // 中间产物

const SUBDIRS = ['server', 'web', 'db', 'templates'];

function cleanBundle(bundleRoot) {
  for (const sub of SUBDIRS) {
    const p = join(bundleRoot, sub);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  const manifest = join(bundleRoot, 'MANIFEST.json');
  if (existsSync(manifest)) rmSync(manifest);
  mkdirSync(bundleRoot, { recursive: true });
}

function clean() {
  cleanBundle(BUNDLE_NODE);
  if (existsSync(SERVER_BUNDLE_SRC)) {
    rmSync(SERVER_BUNDLE_SRC, { recursive: true, force: true });
  }
  mkdirSync(SERVER_BUNDLE_SRC, { recursive: true });
}

function buildAll() {
  console.log('▸ pnpm build (types + server + web)…');
  execSync('pnpm build', { stdio: 'inherit', cwd: ROOT });
}

// 准备 server 中间产物(dist + _local/tutor-types + 改过的 package.json)。
// 中间产物保留是因为 v0.3 之前 cli-py 也消费它;现在只剩 cli-node,但拆出 server-bundle/
// 仍便于后续若要支持 docker image / standalone tarball 等额外分发形式时复用。
function prepareServerBundleSrc() {
  console.log('▸ assemble server bundle source…');

  // a. 复制 server/dist
  cpSync(join(ROOT, 'server/dist'), join(SERVER_BUNDLE_SRC, 'dist'), {
    recursive: true,
  });

  // b. 复制 tutor-types 到 _local/tutor-types(含 dist + package.json)
  const localTypesDir = join(SERVER_BUNDLE_SRC, '_local/tutor-types');
  mkdirSync(localTypesDir, { recursive: true });
  cpSync(
    join(ROOT, 'packages/tutor-types/dist'),
    join(localTypesDir, 'dist'),
    { recursive: true },
  );
  copyFileSync(
    join(ROOT, 'packages/tutor-types/package.json'),
    join(localTypesDir, 'package.json'),
  );

  // c. 准备 package.json:把 workspace:* 改为 file:./_local/tutor-types
  const serverPkg = JSON.parse(
    readFileSync(join(ROOT, 'server/package.json'), 'utf8'),
  );
  if (serverPkg.dependencies?.['@whale-tutor/tutor-types']) {
    serverPkg.dependencies['@whale-tutor/tutor-types'] =
      'file:./_local/tutor-types';
  }
  delete serverPkg.devDependencies;
  serverPkg.scripts = { start: 'node dist/main.js' };
  writeFileSync(
    join(SERVER_BUNDLE_SRC, 'package.json'),
    JSON.stringify(serverPkg, null, 2) + '\n',
  );
}

// cli-node 路线:仅复制源,不装 node_modules — 用户 npm install 时 cli-node 的 package.json
// 自己声明的 deps 会被 npm 装好,server runtime 依赖就齐了。
function deployServerForNode() {
  console.log('▸ cli-node: copy server bundle (no npm install)…');
  const target = join(BUNDLE_NODE, 'server');
  cpSync(SERVER_BUNDLE_SRC, target, { recursive: true });
}

function copyAssets(bundleRoot) {
  cpSync(join(ROOT, 'web/dist'), join(bundleRoot, 'web'), { recursive: true });
  cpSync(join(ROOT, 'db/init'), join(bundleRoot, 'db/init'), {
    recursive: true,
  });
  cpSync(
    join(ROOT, 'server/src/knowledge/data/python-basics'),
    join(bundleRoot, 'templates/python-basics'),
    { recursive: true },
  );
}

function writeManifest(bundleRoot, gitCommit) {
  const manifest = {
    builtAt: new Date().toISOString(),
    gitCommit: gitCommit || null,
    nodeVersion: process.version,
    platform: process.platform,
  };
  writeFileSync(
    join(bundleRoot, 'MANIFEST.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

function getGitCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return '';
  }
}

console.log('=== build whale-tutor cli-node bundle ===\n');
clean();
buildAll();
prepareServerBundleSrc();
deployServerForNode();

console.log('▸ copy web / db / templates → bundle…');
copyAssets(BUNDLE_NODE);

const commit = getGitCommit();
writeManifest(BUNDLE_NODE, commit);
console.log(
  `▸ MANIFEST.json — commit ${commit ? commit.slice(0, 7) : '(no git)'}`,
);

console.log('\n✓ Bundle built:', BUNDLE_NODE);
console.log('\nNext: cd packages/cli-node && npm install && npm link');
