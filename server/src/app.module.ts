import * as path from 'node:path';
import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { ArchiveModule } from './archive/archive.module';
import { DatabaseModule } from './database/database.module';
import { EventModule } from './event/event.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { LearnerModule } from './learner/learner.module';
import { PatternModule } from './pattern/pattern.module';
import { QaModule } from './qa/qa.module';
import { SessionModule } from './session/session.module';
import { UsersModule } from './users/users.module';

// .env 在 monorepo 根。无论 cwd 是 server/ 还是别的,都从 __dirname 出发定位。
//   src/app.module.ts → ../../.env  = monorepo/.env
//   dist/app.module.js → ../../.env = monorepo/.env
const ROOT_ENV = path.resolve(__dirname, '..', '..', '.env');

// pip 包模式下 Python CLI 通过 WHALE_TUTOR_WEB_DIR 传 web/dist 路径,server 兼任静态文件分发;
// monorepo dev 模式不设此环境变量,vite dev server 自己处理静态 + /api 反代到这里。
const WEB_DIR = process.env.WHALE_TUTOR_WEB_DIR;
const staticImports: DynamicModule[] = WEB_DIR
  ? [
      ServeStaticModule.forRoot({
        rootPath: path.resolve(WEB_DIR),
        // /api/* 走 NestJS controller,不被静态文件拦截
        exclude: ['/api/(.*)'],
        serveStaticOptions: { fallthrough: true },
      }),
    ]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [ROOT_ENV] }),
    ...staticImports,
    DatabaseModule,
    AiModule,
    ArchiveModule,
    EventModule,
    KnowledgeModule,
    LearnerModule,
    PatternModule,
    QaModule,
    SessionModule,
    UsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
