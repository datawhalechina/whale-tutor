import { Injectable } from '@nestjs/common';
import type {
  ConceptCheckPrompt,
  ConceptCheckPromptForLearner,
  ConceptCheckResponse,
  EvaluationResult,
} from '@whale-tutor/tutor-types';

@Injectable()
export class ConceptCheckPattern {
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
}
