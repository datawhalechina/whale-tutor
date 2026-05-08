import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PatternRegistry } from './pattern.registry';
import { CodeSandboxPattern } from './patterns/code-sandbox.pattern';
import { ConceptCheckPattern } from './patterns/concept-check.pattern';
import { FreeRecallPattern } from './patterns/free-recall.pattern';
import { SpotTheBugPattern } from './patterns/spot-the-bug.pattern';

@Module({
  imports: [AiModule],
  providers: [
    PatternRegistry,
    ConceptCheckPattern,
    FreeRecallPattern,
    SpotTheBugPattern,
    CodeSandboxPattern,
  ],
  exports: [PatternRegistry],
})
export class PatternModule {}
