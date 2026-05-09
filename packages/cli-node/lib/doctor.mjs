// `whale-tutor doctor` — 健康检查:node 版本 / bundle 资源 / mysql 连通 / API key 设了没。

import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import kleur from 'kleur';
import { ping as dbPing } from './db.mjs';

function checkNode() {
  const v = process.versions.node;
  const major = Number(v.split('.')[0]);
  if (major < 22) {
    return { ok: false, detail: `node 版本 ${v} 太低,需要 ≥ 22` };
  }
  return { ok: true, detail: `v${v}` };
}

function checkBundle(bundleRoot) {
  const required = [
    join(bundleRoot, 'server', 'dist', 'main.js'),
    join(bundleRoot, 'web', 'index.html'),
    join(bundleRoot, 'db', 'init', '01-schema.sql'),
  ];
  const missing = required.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    return {
      ok: false,
      detail: `bundle 资源缺失:${missing.map((p) => relative(bundleRoot, p)).join(', ')}`,
    };
  }
  return { ok: true, detail: 'server / web / schema 都在' };
}

// MySQL 检查分两层:先 ping 整库,失败再 ping server(不指定库),区分:
//   (a) server 都连不上(MySQL 没装 / 没启 / 端口错 / 密码错)— 致命
//   (b) server 通但库不存在 — 不致命,whale-tutor start 会自动建库
function explainMysqlError(code, msg) {
  if (code === 'ECONNREFUSED') return '连不上 MySQL — 检查是否启动 + 端口对(默认 3306)';
  if (code === 'ETIMEDOUT' || code === 'ENOTFOUND')
    return '连接超时 / 找不到 host — 检查 host 字段';
  if (code === 'ER_ACCESS_DENIED_ERROR') return '用户名 / 密码错';
  if (msg && msg.includes('Received type number')) {
    return '密码被 yaml parse 成了数字。纯数字密码必须加引号:password: "12121212"';
  }
  return msg;
}

async function checkMysql(cfg) {
  const dbResult = await dbPing(cfg);
  if (dbResult.ok) {
    return {
      ok: true,
      detail: `${cfg.database.user}@${cfg.database.host}:${cfg.database.port}/${cfg.database.database}`,
    };
  }

  // 库连不上 — 区分 "数据库不存在"(可自愈)vs "server 整体连不上"(致命)
  if (dbResult.code === 'ER_BAD_DB_ERROR') {
    // server 通,只是库还没建 — whale-tutor start 会自动 CREATE DATABASE。算 OK 但标黄。
    return {
      ok: true,
      warn: true,
      detail:
        `${cfg.database.user}@${cfg.database.host}:${cfg.database.port} ✓ ` +
        `(库 \`${cfg.database.database}\` 暂不存在,start 时自动创建)`,
    };
  }

  return {
    ok: false,
    detail: explainMysqlError(dbResult.code, dbResult.error),
  };
}

function checkApiKey(cfg) {
  const key = cfg.ai.deepseekApiKey;
  if (!key) {
    return {
      ok: false,
      detail: 'DEEPSEEK_API_KEY 未设(AI 调用会走 fallback 文案)',
    };
  }
  if (!key.startsWith('sk-')) {
    return { ok: false, detail: `API key 格式异常(不是 sk- 开头):${key.slice(0, 10)}…` };
  }
  return { ok: true, detail: `已设(${key.slice(0, 8)}…,长度 ${key.length})` };
}

function row(name, { ok, warn, detail }) {
  const mark = !ok ? kleur.red('✗') : warn ? kleur.yellow('!') : kleur.green('✓');
  return `  ${mark}  ${kleur.cyan(name.padEnd(18))}  ${detail}`;
}

export async function runDoctor(cfg, bundleRoot) {
  console.log(kleur.bold('Whale Tutor 健康检查'));
  console.log();

  const node = checkNode();
  const bundle = checkBundle(bundleRoot);
  const mysqlCheck = await checkMysql(cfg);
  const apiKey = checkApiKey(cfg);

  console.log(row('Node.js', node));
  console.log(row('Bundle 资源', bundle));
  console.log(row('MySQL 连接', mysqlCheck));
  console.log(row('DeepSeek API key', apiKey));
  console.log();

  // API key 不设不算致命(可走 fallback)
  const allOk = node.ok && bundle.ok && mysqlCheck.ok;
  if (allOk) {
    console.log(kleur.green().bold('全部就绪,可以 `whale-tutor start` 了。'));
  } else {
    console.log(kleur.yellow().bold('有项目不通过。修复后再试 `whale-tutor start`。'));
  }
}
