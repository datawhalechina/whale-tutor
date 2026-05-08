import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [ROOT_ENV] }),
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
