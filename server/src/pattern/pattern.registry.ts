import { Injectable } from '@nestjs/common';
import type {
  CodeSandboxPrompt,
  CodeSandboxResponse,
  ConceptCheckPrompt,
  ConceptCheckResponse,
  EvaluationResult,
  FreeRecallPrompt,
  FreeRecallResponse,
  PatternId,
  SpotTheBugPrompt,
  SpotTheBugResponse,
} from '@whale-tutor/tutor-types';
import { CodeSandboxPattern } from './patterns/code-sandbox.pattern';
import { ConceptCheckPattern } from './patterns/concept-check.pattern';
import { FreeRecallPattern } from './patterns/free-recall.pattern';
import { SpotTheBugPattern } from './patterns/spot-the-bug.pattern';

export interface EvaluateContext {
  sessionId?: number;
}

/**
 * Pattern 注册表与分发器。
 * - toLearnerPrompt 是同步的(纯 sanitize)
 * - evaluate 是 async(free_recall / spot_the_bug 走 AI Gateway)
 *
 * 新增 Pattern:
 *   1. 实现 *.pattern.ts
 *   2. 此文件加 case
 *   3. pattern.module.ts 注册 provider
 *   4. packages/tutor-types/src/patterns.ts 加类型(已有)
 */
@Injectable()
export class PatternRegistry {
  constructor(
    public readonly conceptCheck: ConceptCheckPattern,
    public readonly freeRecall: FreeRecallPattern,
    public readonly spotTheBug: SpotTheBugPattern,
    public readonly codeSandbox: CodeSandboxPattern,
  ) {}

  toLearnerPrompt(patternId: PatternId, prompt: unknown): unknown {
    switch (patternId) {
      case 'concept_check':
        return this.conceptCheck.toLearnerPrompt(prompt as ConceptCheckPrompt);
      case 'free_recall':
        return this.freeRecall.toLearnerPrompt(prompt as FreeRecallPrompt);
      case 'spot_the_bug':
        return this.spotTheBug.toLearnerPrompt(prompt as SpotTheBugPrompt);
      case 'code_sandbox':
        return this.codeSandbox.toLearnerPrompt(prompt as CodeSandboxPrompt);
      default: {
        const _exhaustive: never = patternId;
        throw new Error(`Unknown pattern: ${String(_exhaustive)}`);
      }
    }
  }

  async evaluate(
    patternId: PatternId,
    prompt: unknown,
    response: unknown,
    context?: EvaluateContext,
  ): Promise<EvaluationResult> {
    switch (patternId) {
      case 'concept_check':
        return this.conceptCheck.evaluate(
          prompt as ConceptCheckPrompt,
          response as ConceptCheckResponse,
        );
      case 'free_recall':
        return this.freeRecall.evaluate(
          prompt as FreeRecallPrompt,
          response as FreeRecallResponse,
          context,
        );
      case 'spot_the_bug':
        return this.spotTheBug.evaluate(
          prompt as SpotTheBugPrompt,
          response as SpotTheBugResponse,
          context,
        );
      case 'code_sandbox':
        return this.codeSandbox.evaluate(
          prompt as CodeSandboxPrompt,
          response as CodeSandboxResponse,
        );
      default: {
        const _exhaustive: never = patternId;
        throw new Error(`Unknown pattern: ${String(_exhaustive)}`);
      }
    }
  }
}
