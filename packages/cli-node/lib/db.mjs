// MySQL 连接 + schema 探测/应用。CLI 在启动 node server 之前 idempotently 应用 schema。

import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import kleur from 'kleur';

async function connect(cfg) {
  return mysql.createConnection({
    host: cfg.database.host,
    port: cfg.database.port,
    user: cfg.database.user,
    password: cfg.database.password,
    database: cfg.database.database,
    multipleStatements: true,
    connectTimeout: 5000,
  });
}

// 测连通性。返回 { ok: bool, error?: string }。
export async function ping(cfg) {
  try {
    const conn = await connect(cfg);
    await conn.end();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// 检测 events 表(核心事实表)是否存在。
export async function hasSchema(cfg) {
  const conn = await connect(cfg);
  try {
    const [rows] = await conn.query("SHOW TABLES LIKE 'events'");
    return rows.length > 0;
  } finally {
    await conn.end();
  }
}

// 跑 schemaFile 中所有 SQL。idempotent — 调用方应先 hasSchema。
export async function applySchema(cfg, schemaFile) {
  const sql = readFileSync(schemaFile, 'utf8');
  const conn = await connect(cfg);
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

// 检测 + 应用(如缺失)。CLI start 前调用。
export async function ensureSchema(cfg, schemaFile) {
  if (await hasSchema(cfg)) {
    console.log(kleur.dim('✓ schema 已就绪,跳过初始化'));
    return;
  }
  console.log(
    kleur.yellow(`→ 检测到 mysql 中缺少 schema,正在应用 ${schemaFile}…`),
  );
  await applySchema(cfg, schemaFile);
  console.log(kleur.green('✓ schema 已应用'));
}
