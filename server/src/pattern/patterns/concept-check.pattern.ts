import { Injectable, Logger } from '@nestjs/common';
import type {
  ConceptCheckPrompt,
  ConceptCheckPromptForLearner,
  ConceptCheckResponse,
  EvaluationResult,
  LearningObjectiveDefinition,
} from '@whale-tutor/tutor-types';
import { AiGatewayService } from '../../ai/ai-gateway.service';
import type { GenerateContext } from '../pattern.registry';

// AI 输出 — schema 由 prompt yaml 校验。fallback 时 question 为 null,触发 review_lo 兜底。
interface ConceptCheckGenerateOutput {
  explanationMd: string;
  question: {
    stem: string;
    options: string[];
    answerIndex: number;
    rationale: string;
  } | null;
}

@Injectable()
export class ConceptCheckPattern {
  private readonly logger = new Logger(ConceptCheckPattern.name);

  constructor(private readonly ai: AiGatewayService) {}

  /**
   * 把完整 prompt sanitize 成下发到前端的安全子集,去掉 answerIndex 和 rationale。
   * 这是 server-only → public 的关键转换点（见 CLAUDE.md "Pattern 安全边界"）。
   */
  toLearnerPrompt(prompt: ConceptCheckPrompt): ConceptCheckPromptForLearner {
    return {
      explanationMd: prompt.explanationMd,
      question: {
        stem: prompt.question.stem,
        options: prompt.question.options,
      },
    };
  }

  /**
   * 确定性评估:选项 index 匹配。
   * confidence 固定为 1（无 AI 不确定性）;feedback 直接用预置 rationale。
   */
  evaluate(
    prompt: ConceptCheckPrompt,
    response: ConceptCheckResponse,
  ): EvaluationResult {
    const correct = response.selectedIndex === prompt.question.answerIndex;
    return {
      correct,
      confidence: 1,
      feedbackMd: prompt.question.rationale,
      // mastery 状态机增量由 SessionService 应用,这里只产出"对/错"
      masteryDelta: {},
      hintLevelUsed: 0,
      evaluatorKind: 'deterministic',
    };
  }

  /**
   * v0.2:答错 concept_check 后,生成一道"换说法"的同 LO concept_check 题。
   * AI 失败 / fallback 时 output.question = null → 返 null,SessionService 落 review_lo 兜底。
   */
  async generate(
    originalPrompt: ConceptCheckPrompt,
    lo: LearningObjectiveDefinition,
    ctx: GenerateContext,
  ): Promise<ConceptCheckPrompt | null> {
    const optionsList = originalPrompt.question.options
      .map((opt, idx) => `  ${idx}. ${opt}`)
      .join('\n');

    const output = await this.ai.complete<ConceptCheckGenerateOutput>({
      templateId: 'pattern.regenerate.concept_check',
      variables: {
        subject: ctx.subject,
        loName: lo.name,
        loDescription: lo.description,
        commonMisconceptions:
          lo.commonMisconceptions.length > 0
            ? lo.commonMisconceptions.map((m) => `- ${m}`).join('\n')
            : '(无)',
        originalStem: originalPrompt.question.stem,
        originalOptionsList: optionsList,
        originalAnswerIndex: originalPrompt.question.answerIndex,
        originalRationale: originalPrompt.question.rationale,
        attemptIndex: ctx.attemptIndex,
      },
      sessionId: ctx.sessionId ?? null,
      callerTag: 'pattern.concept_check.regenerate',
    });

    if (!output.question) {
      this.logger.log(
        `concept_check.regenerate for LO ${lo.id} returned null question (fallback) — caller should fall back to review_lo`,
      );
      return null;
    }

    return {
      explanationMd: output.explanationMd ?? '',
      question: output.question,
    };
  }
}
