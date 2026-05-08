import 'reflect-metadata';
import { promises as fs } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createConnection } from 'mysql2/promise';
import { AppModule } from './app.module';

async function bootstrap() {
  // 0. pip 包模式下 Python CLI 在启动 node 之前不一定能确认 mysql 已经初始化 schema。
  // 通过 WHALE_TUTOR_BOOTSTRAP_SCHEMA=1 + WHALE_TUTOR_SCHEMA_FILE=/path/to/01-schema.sql
  // 让 server 自己检测并应用。monorepo dev 模式不设这两个 env(docker-entrypoint-initdb.d 已搞定)。
  if (process.env.WHALE_TUTOR_BOOTSTRAP_SCHEMA === '1') {
    await applySchemaIfMissing();
  }

  const app = await NestFactory.create(AppModule, { cors: true });
  // 所有 controller 加 /api 前缀,server 同时承担 API + 静态前端时路径不冲突
  app.setGlobalPrefix('api');
  const config = app.get(ConfigService);
  const port = config.get<number>('SERVER_PORT', 3000);
  await app.listen(port);
   
  console.log(`Server listening on http://localhost:${port}`);
}

/**
 * 检测目标 mysql 是否已有核心表(events),没有则跑 WHALE_TUTOR_SCHEMA_FILE 指向的 SQL 文件。
 * idempotent:已有 events 表则跳过。
 * 在 NestJS bootstrap 之前跑,避免 Kysely pool 在表不存在时直接异常。
 */
async function applySchemaIfMissing(): Promise<void> {
  const schemaFile = process.env.WHALE_TUTOR_SCHEMA_FILE;
  if (!schemaFile) {
    throw new Error(
      'WHALE_TUTOR_BOOTSTRAP_SCHEMA=1 but WHALE_TUTOR_SCHEMA_FILE not set',
    );
  }
  const host = process.env.DATABASE_HOST || 'localhost';
  const port = Number(process.env.DATABASE_PORT || 3306);
  const user = process.env.DATABASE_USER || 'tutor';
  const password = process.env.DATABASE_PASSWORD || 'tutor';
  const database = process.env.DATABASE_NAME || 'whale_tutor';

   
  console.log(
    `[bootstrap] checking schema in ${user}@${host}:${port}/${database}…`,
  );

  const conn = await createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
  });
  try {
    const [rows] = await conn.query("SHOW TABLES LIKE 'events'");
    const hasEvents = Array.isArray(rows) && (rows as unknown[]).length > 0;
    if (hasEvents) {
       
      console.log('[bootstrap] schema already present, skipping.');
      return;
    }
     
    console.log(`[bootstrap] applying schema from ${schemaFile}…`);
    const sql = await fs.readFile(schemaFile, 'utf8');
    await conn.query(sql);
     
    console.log('[bootstrap] schema applied successfully.');
  } finally {
    await conn.end();
  }
}

void bootstrap();
