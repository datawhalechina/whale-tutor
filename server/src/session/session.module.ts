import { Module } from '@nestjs/common';
import { EventModule } from '../event/event.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LearnerModule } from '../learner/learner.module';
import { PatternModule } from '../pattern/pattern.module';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [EventModule, KnowledgeModule, LearnerModule, PatternModule],
  controllers: [SessionController],
  providers: [SessionService],
})
export class SessionModule {}
