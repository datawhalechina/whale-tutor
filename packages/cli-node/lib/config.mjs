// 读 whale-tutor.config.yaml + 环境变量 override → 转 dict 给 node 子进程 env。

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import yaml from 'js-yaml';

export const CONFIG_FILENAME = 'whale-tutor.config.yaml';

// 从 startDir 向上找配置文件;找不到抛 Error。
export function findConfig(startDir = process.cwd()) {
  let cur = resolve(startDir);
  while (true) {
    const candidate = resolve(cur, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cur);
    if (parent === cur) {
      throw new Error(
        `找不到 ${CONFIG_FILENAME}。请在课程根目录运行,或先跑 \`whale-tutor init\`。`,
      );
    }
    cur = parent;
  }
}

// 读 yaml + 解析路径 + env override。返回 { coursesDir, database, ai, server, configPath }。
export function loadConfig(configPath) {
  const raw = yaml.load(readFileSync(configPath, 'utf8')) ?? {};
  const configDir = dirname(configPath);

  const coursesDirRaw = raw.courses_dir ?? './courses';
  const coursesDir = isAbsolute(coursesDirRaw) ? coursesDirRaw : resolve(configDir, coursesDirRaw);

  const dbRaw = raw.database ?? {};
  const database = {
    host: String(process.env.DATABASE_HOST ?? dbRaw.host ?? 'localhost'),
    port: Number(process.env.DATABASE_PORT ?? dbRaw.port ?? 3306),
    // user 和 password 强制 String:yaml 里 `password: 12121212`(无引号)会被 parse 成 number,
    // mysql2 拿到非 string 直接抛 "first argument must be of type string..."。这里兜底 coerce。
    user: String(process.env.DATABASE_USER ?? dbRaw.user ?? 'root'),
    password: String(process.env.DATABASE_PASSWORD ?? dbRaw.password ?? ''),
    database: String(process.env.DATABASE_NAME ?? dbRaw.database ?? 'whale_tutor'),
  };

  const aiRaw = raw.ai ?? {};
  const ai = {
    deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? aiRaw.deepseek_api_key ?? '',
    deepseekApiBaseUrl:
      process.env.DEEPSEEK_API_BASE_URL ??
      aiRaw.deepseek_api_base_url ??
      'https://api.deepseek.com',
  };

  const serverRaw = raw.server ?? {};
  const server = {
    port: Number(process.env.SERVER_PORT ?? serverRaw.port ?? 3000),
  };

  return { coursesDir, database, ai, server, configPath: resolve(configPath) };
}

// 配置 → 环境变量字典(给 spawn 的子进程用)。
export function toEnv(cfg, { webDir, schemaFile }) {
  return {
    DATABASE_HOST: cfg.database.host,
    DATABASE_PORT: String(cfg.database.port),
    DATABASE_USER: cfg.database.user,
    DATABASE_PASSWORD: cfg.database.password,
    DATABASE_NAME: cfg.database.database,
    DEEPSEEK_API_KEY: cfg.ai.deepseekApiKey,
    DEEPSEEK_API_BASE_URL: cfg.ai.deepseekApiBaseUrl,
    SERVER_PORT: String(cfg.server.port),
    WHALE_TUTOR_COURSES_DIR: cfg.coursesDir,
    WHALE_TUTOR_WEB_DIR: webDir,
    WHALE_TUTOR_SCHEMA_FILE: schemaFile,
    WHALE_TUTOR_BOOTSTRAP_SCHEMA: '0',
  };
}
