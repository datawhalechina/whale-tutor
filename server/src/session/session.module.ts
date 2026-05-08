import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { EventModule } from '../event/event.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LearnerModule } from '../learner/learner.module';
import { PatternModule } from '../pattern/pattern.module';
import { HintCacheService } from './hint-cache.service';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [AiModule, EventModule, KnowledgeModule, LearnerModule, PatternModule],
  controllers: [SessionController],
  providers: [SessionService, HintCacheService],
})
export class SessionModule {}
