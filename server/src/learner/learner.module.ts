import { Module } from '@nestjs/common';
import { LearnerService } from './learner.service';

@Module({
  providers: [LearnerService],
  exports: [LearnerService],
})
export class LearnerModule {}
