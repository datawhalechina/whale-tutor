import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { EventModule } from '../event/event.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';

@Module({
  imports: [AiModule, EventModule, KnowledgeModule],
  controllers: [QaController],
  providers: [QaService],
})
export class QaModule {}
