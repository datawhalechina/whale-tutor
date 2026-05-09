import { Injectable } from '@nestjs/common';
import type {
  CodeSandboxPrompt,
  CodeSandboxResponse,
  ConceptCheckPrompt,
  ConceptCheckResponse,
  EvaluationResult,
  FreeRecallPrompt,
  FreeRecallResponse,
  LearningObjectiveDefinition,
  PatternId,
  RequiredInteraction,
  SpotTheBugPrompt,
  SpotTheBugResponse,
} from '@whale-tutor/tutor-types';
import { CodeSandboxPattern } from './patterns/code-sandbox.pattern';
import { ConceptCheckPattern } from './patterns/concept-check.pattern';
import { FreeRecallPattern } from './patterns/free-recall.pattern';
import { SpotTheBugPattern } from './patterns/spot-the-bug.pattern';

// 评估上下文 — 让 evaluator 拿到调用方的 sessionId(写 ai_calls)+ subject(prompt 变量)。
// subject 必填,从课程定义解析(KnowledgeService.getSubjectByLoId)。
export interface EvaluateContext {
  sessionId?: number;
  subject: string;
}

// 生成 adaptive 题(answer-wrong 时换说法)的上下文。
// attemptIndex:该 RI 的第几次 retry(从 1 开始,让 AI 知道学习者已经卡了几次)。
export interface GenerateContext {
  sessionId?: number;
  subject: string;
  attemptIndex: number;
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
    context: EvaluateContext,
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

  /**
   * 生成 adaptive "换说法"题。原 RI 的 prompt 完整传入(含答案),AI 用作出题灵感。
   * 返 null → 该 pattern 不支持 generate(或 AI 全部失败),由调用方落 review_lo 兜底。
   */
  async generate(
    originalRi: RequiredInteraction,
    lo: LearningObjectiveDefinition,
    context: GenerateContext,
  ): Promise<unknown | null> {
    switch (originalRi.patternId) {
      case 'concept_check':
        return this.conceptCheck.generate(
          originalRi.prompt as ConceptCheckPrompt,
          lo,
          context,
        );
      case 'free_recall':
        return this.freeRecall.generate(
          originalRi.prompt as FreeRecallPrompt,
          lo,
          context,
        );
      case 'spot_the_bug':
        return this.spotTheBug.generate(
          originalRi.prompt as SpotTheBugPrompt,
          lo,
          context,
        );
      case 'code_sandbox':
        return this.codeSandbox.generate(
          originalRi.prompt as CodeSandboxPrompt,
          lo,
          context,
        );
    }
    // 4 PatternId 已穷尽,这里 unreachable;若 PatternId 加新成员,TS 会逼迫上面 switch 加分支
    return null;
  }
}
