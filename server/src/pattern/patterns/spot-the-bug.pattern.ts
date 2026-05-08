import { Injectable } from '@nestjs/common';
import type {
  EvaluationResult,
  SpotTheBugPrompt,
  SpotTheBugPromptForLearner,
  SpotTheBugResponse,
} from '@whale-tutor/tutor-types';
import { AiGatewayService } from '../../ai/ai-gateway.service';

interface SpotBugAiOutput {
  explanationQuality: 'good' | 'partial' | 'wrong';
  confidence: number;
  feedbackMd: string;
}

@Injectable()
export class SpotTheBugPattern {
  constructor(private readonly ai: AiGatewayService) {}

  toLearnerPrompt(prompt: SpotTheBugPrompt): SpotTheBugPromptForLearner {
    // bugLocations / correctExplanation 是 server-only,不下发
    const result: SpotTheBugPromptForLearner = { buggyCode: prompt.buggyCode };
    if (prompt.hintMd !== undefined) result.hintMd = prompt.hintMd;
    return result;
  }

  /**
   * Hybrid 评估:
   *   - 确定性:学习者选行是否完全等于 bugLocations 的行号集合(不多不少)
   *   - AI:评估学习者解释是否抓住 bug 核心机制
   *
   * 最终 correct = 选行对 AND explanation 不为 'wrong'。
   * AI 失败 / 无 key → fallback explanationQuality='partial' → 选行对就算通过(宽松)。
   */
  async evaluate(
    prompt: SpotTheBugPrompt,
    response: SpotTheBugResponse,
    context?: { sessionId?: number },
  ): Promise<EvaluationResult> {
    // Phase 1: 确定性行号匹配
    const expectedLines = new Set(prompt.bugLocations.map((loc) => loc.line));
    const selectedLines = new Set(response.selectedLines);
    const allExpectedSelected = [...expectedLines].every((l) => selectedLines.has(l));
    const noExtraSelected = [...selectedLines].every((l) => expectedLines.has(l));
    const linesCorrect = allExpectedSelected && noExtraSelected;

    // Phase 2: AI 评估解释质量(即使行错也跑,以提供更友好反馈)
    const bugKindList = prompt.bugLocations
      .map((loc) => `- 第 ${loc.line} 行: ${loc.kind}`)
      .join('\n');
    const aiOutput = await this.ai.complete<SpotBugAiOutput>({
      templateId: 'spot_the_bug.evaluate_explanation',
      variables: {
        buggyCode: prompt.buggyCode,
        bugKindList,
        correctExplanation: prompt.correctExplanation,
        learnerExplanation: response.explanation,
        linesSelected:
          response.selectedLines.length > 0
            ? response.selectedLines.join(', ')
            : '(未选)',
        linesAreCorrect: linesCorrect ? '正确' : '不正确',
      },
      sessionId: context?.sessionId ?? null,
      callerTag: 'pattern.spot_the_bug.evaluate_explanation',
    });

    // 综合判定
    const explanationGood = aiOutput.explanationQuality !== 'wrong';
    const correct = linesCorrect && explanationGood;

    // 装配 feedback：行错时显式说明 + AI 反馈拼接 + 附正确解析
    const parts: string[] = [];
    if (!linesCorrect) {
      const expected = [...expectedLines].sort((a, b) => a - b).join(', ');
      const selected = response.selectedLines.length > 0
        ? response.selectedLines.join(', ')
        : '(未选)';
      parts.push(`**选行不完全正确**。bug 在第 ${expected} 行,你选了 ${selected}。`);
    }
    parts.push(aiOutput.feedbackMd);
    if (correct) {
      // 通过时也附带完整解析,便于学习者深化
      parts.push(`---\n\n${prompt.correctExplanation}`);
    } else {
      parts.push(`---\n\n参考解析:\n\n${prompt.correctExplanation}`);
    }

    return {
      correct,
      // 行号是确定性的,所以行错时 confidence 高(我们确信"不对");行对时由 AI confidence 决定
      confidence: linesCorrect ? aiOutput.confidence : 0.95,
      feedbackMd: parts.join('\n\n'),
      masteryDelta: {},
      hintLevelUsed: 0,
      evaluatorKind: 'hybrid',
    };
  }
}
