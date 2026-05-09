import 'reflect-metadata';
import { promises as fs } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createConnection } from 'mysql2/promise';
import { AppModule } from './app.module';
import { BuildModule } from './build/build.module';
import { BuildService } from './build/build.service';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { KnowledgeService } from './knowledge/knowledge.service';

async function bootstrap() {
  // -1. validate-only 模式(`whale-tutor lint`):仅 boot KnowledgeModule 跑 yaml 解析 + ajv 校验,
  // 通过则 exit 0,失败抛错让 process 非零退出 + stderr 含具体错误。
  // 不需要 mysql / web / 任何其他模块。
  if (process.env.WHALE_TUTOR_VALIDATE_ONLY === '1') {
    await runValidateOnly();
    return;
  }

  // -2. build 模式(`whale-tutor build`):仅 boot BuildModule(无 DB / 无 web),
  // BuildService.buildCourse 负责调 AI Gateway + 写 yaml/md 文件。
  // 输入输出通过 env:WHALE_TUTOR_BUILD_INPUT / WHALE_TUTOR_BUILD_OUTPUT / WHALE_TUTOR_BUILD_FORCE
  if (process.env.WHALE_TUTOR_BUILD_MODE === '1') {
    await runBuild();
    return;
  }

  // 0. CLI 模式下 `whale-tutor` 在启动 node 之前已经 idempotent 探测 schema,但留 env trigger 双保险:
  // WHALE_TUTOR_BOOTSTRAP_SCHEMA=1 + WHALE_TUTOR_SCHEMA_FILE=/path/to/01-schema.sql
  // 让 server 自己也检测并应用。monorepo dev 模式不设这两个 env(docker-entrypoint-initdb.d 已搞定)。
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
 * lint 模式:用 createApplicationContext 启动最小依赖链(只 KnowledgeModule),
 * 触发 KnowledgeService.onModuleInit → 扫课程 + ajv 校验。
 * 校验失败时 KnowledgeService 抛 CourseValidationError(含 instancePath / message),
 * NestJS 让它逃出 → process 非零退出。
 *
 * stdout/stderr 由 NestJS 自己处理(KnowledgeService 用 Logger 打日志)。
 * CLI 侧解析 exit code + 收集 stderr 即可。
 */
async function runValidateOnly(): Promise<void> {
  const ctx = await NestFactory.createApplicationContext(KnowledgeModule, {
    logger: ['error', 'warn', 'log'],
  });
  // 显式取 service 确保 onModuleInit 执行完
  const knowledge = ctx.get(KnowledgeService);
  // touch 一下让 TS 知道 service 拿到了
  void knowledge;

  console.log('✓ 课程验证通过');
  await ctx.close();
  process.exit(0);
}

/**
 * build 模式:用 createApplicationContext 启动 BuildModule(只 ConfigModule + AiGateway + BuildService),
 * 不依赖 mysql / web。BuildService 调 4 阶段 AI prompt + 写文件。
 *
 * 失败时(AI 返 fallback / 输出已存在且未 --force / 等)抛错 → process 非零退出。
 * stdout/stderr 由 NestJS Logger 自己处理。
 */
async function runBuild(): Promise<void> {
  const inputDir = process.env.WHALE_TUTOR_BUILD_INPUT;
  const outputDir = process.env.WHALE_TUTOR_BUILD_OUTPUT;
  const force = process.env.WHALE_TUTOR_BUILD_FORCE === '1';
  if (!inputDir || !outputDir) {
    console.error(
      '[build] WHALE_TUTOR_BUILD_MODE=1 needs WHALE_TUTOR_BUILD_INPUT and WHALE_TUTOR_BUILD_OUTPUT',
    );
    process.exit(2);
  }
  const ctx = await NestFactory.createApplicationContext(BuildModule, {
    logger: ['error', 'warn', 'log'],
  });
  const buildService = ctx.get(BuildService);
  try {
    const summary = await buildService.buildCourse({ inputDir, outputDir, force });
    console.log('');
    console.log(
      `✓ Built course '${summary.courseId}' (${summary.subject}): ` +
        `${summary.chapterCount} chapter(s), ${summary.loCount} LO(s), ` +
        `${summary.riCount} LO RI(s), ${summary.assessmentRiCount} assessment RI(s)`,
    );
    console.log(`  output → ${summary.outputDir}`);
    await ctx.close();
    process.exit(0);
  } catch (err) {
    console.error(`[build] ${(err as Error).message}`);
    await ctx.close();
    process.exit(1);
  }
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
