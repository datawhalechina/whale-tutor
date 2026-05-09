// MySQL 连接 + schema 探测/应用。CLI 在启动 node server 之前 idempotently 应用 schema。

import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import kleur from 'kleur';

// 连特定数据库
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

// 连 server(不指定数据库),用来 CREATE DATABASE
async function connectServer(cfg) {
  return mysql.createConnection({
    host: cfg.database.host,
    port: cfg.database.port,
    user: cfg.database.user,
    password: cfg.database.password,
    multipleStatements: true,
    connectTimeout: 5000,
  });
}

// 验证数据库名只含合法字符(防 SQL 注入,因为我们要把 db 名插进 CREATE DATABASE 拼字符串里)。
// MySQL identifier 允许字母数字 + 下划线 + 美元符,首字符不能纯数字。
function assertSafeDbName(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]{0,63}$/.test(name)) {
    throw new Error(
      `不合法的数据库名 "${name}"。只允许字母数字下划线,首字符非数字,长度 ≤ 64。` +
        `若你的需求里数据库名含连字符等特殊字符(如 "whale-tutor"),请改 whale-tutor.config.yaml ` +
        `里的 database 字段(推荐改为 "whale_tutor")。`,
    );
  }
}

// 测连通性。返回 { ok: bool, error?: string, code?: string }。
export async function ping(cfg) {
  try {
    const conn = await connect(cfg);
    await conn.end();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message, code: e.code };
  }
}

// 测 server 级连通(不指定库)。doctor 用来判断"server 通但库不存在"和"server 都连不上"
export async function pingServer(cfg) {
  try {
    const conn = await connectServer(cfg);
    await conn.end();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message, code: e.code };
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

// 创建数据库(若不存在)。用 utf8mb4 兼容 emoji / 中文 4 字节字符。
async function createDatabaseIfMissing(cfg) {
  assertSafeDbName(cfg.database.database);
  const conn = await connectServer(cfg);
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database.database}\` ` +
        `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

// 检测 + 应用(如缺失)。CLI start 前调用。
//
// 兼容三种初始状态:
//   1. 数据库已存在 + schema 已应用    → 跳过
//   2. 数据库已存在 + 缺 schema       → 跑 01-schema.sql
//   3. 数据库不存在                    → 自动 CREATE DATABASE + 跑 01-schema.sql
//
// 错误传上去,start 命令会捕获并打印友好提示(连不上 mysql / 用户名密码错 / 等)。
export async function ensureSchema(cfg, schemaFile) {
  // 先试连指定库 — 成功则进 has-schema 检测,失败若是 "Unknown database" 则跳到创建分支
  let dbExists = true;
  try {
    const conn = await connect(cfg);
    await conn.end();
  } catch (e) {
    if (e.code === 'ER_BAD_DB_ERROR') {
      dbExists = false;
    } else {
      throw e;
    }
  }

  if (!dbExists) {
    console.log(kleur.yellow(`→ 数据库 \`${cfg.database.database}\` 不存在,自动创建(utf8mb4)…`));
    await createDatabaseIfMissing(cfg);
    console.log(kleur.green('✓ 数据库已创建'));
  }

  if (await hasSchema(cfg)) {
    console.log(kleur.dim('✓ schema 已就绪,跳过初始化'));
    return;
  }
  console.log(kleur.yellow(`→ 检测到缺少 schema,应用 ${schemaFile}…`));
  await applySchema(cfg, schemaFile);
  console.log(kleur.green('✓ schema 已应用'));
}
