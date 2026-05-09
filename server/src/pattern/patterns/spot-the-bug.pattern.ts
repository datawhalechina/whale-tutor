import { Injectable, Logger } from '@nestjs/common';
import type {
  BugLocation,
  EvaluationResult,
  LearningObjectiveDefinition,
  SpotTheBugPrompt,
  SpotTheBugPromptForLearner,
  SpotTheBugResponse,
} from '@whale-tutor/tutor-types';
import { AiGatewayService } from '../../ai/ai-gateway.service';
import type { GenerateContext } from '../pattern.registry';

interface SpotBugAiOutput {
  explanationQuality: 'good' | 'partial' | 'wrong';
  confidence: number;
  feedbackMd: string;
}

interface SpotBugGenerateOutput {
  buggyCode: string | null;
  bugLocations: BugLocation[];
  correctExplanation: string;
  hintMd?: string;
}

@Injectable()
export class SpotTheBugPattern {
  private readonly logger = new Logger(SpotTheBugPattern.name);

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
    context: { sessionId?: number; subject: string },
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
        subject: context.subject,
        buggyCode: prompt.buggyCode,
        bugKindList,
        correctExplanation: prompt.correctExplanation,
        learnerExplanation: response.explanation,
        linesSelected:
          response.selectedLines.length > 0 ? response.selectedLines.join(', ') : '(未选)',
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
      const selected =
        response.selectedLines.length > 0 ? response.selectedLines.join(', ') : '(未选)';
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

  /**
   * v0.2:答错后生成"换情境"的 spot_the_bug 题。
   *
   * 出题门槛高(行号必须精确对应代码,代码必须真有 bug),所以除 AI 输出 schema 校验外,
   * 还要过 server-side sanity check:bugLocations.line 必须在 1..buggyCode 行数 范围内。
   * 任一失败 → 返 null → SessionService 落 review_lo。
   */
  async generate(
    originalPrompt: SpotTheBugPrompt,
    lo: LearningObjectiveDefinition,
    ctx: GenerateContext,
  ): Promise<SpotTheBugPrompt | null> {
    const output = await this.ai.complete<SpotBugGenerateOutput>({
      templateId: 'pattern.regenerate.spot_the_bug',
      variables: {
        subject: ctx.subject,
        loName: lo.name,
        loDescription: lo.description,
        commonMisconceptions:
          lo.commonMisconceptions.length > 0
            ? lo.commonMisconceptions.map((m) => `- ${m}`).join('\n')
            : '(无)',
        originalBuggyCode: originalPrompt.buggyCode,
        originalBugLocations: originalPrompt.bugLocations
          .map((b) => `- 第 ${b.line} 行: ${b.kind}`)
          .join('\n'),
        originalCorrectExplanation: originalPrompt.correctExplanation,
        attemptIndex: ctx.attemptIndex,
      },
      sessionId: ctx.sessionId ?? null,
      callerTag: 'pattern.spot_the_bug.regenerate',
    });

    if (!output.buggyCode || output.bugLocations.length === 0) {
      this.logger.log(
        `spot_the_bug.regenerate for LO ${lo.id}: AI fallback (null/empty) — review_lo`,
      );
      return null;
    }

    // Sanity check:每个 bug line 必须落在代码行数范围内
    const lineCount = output.buggyCode.replace(/\n$/, '').split('\n').length;
    const allLinesValid = output.bugLocations.every(
      (b) => b.line >= 1 && b.line <= lineCount && b.kind.trim().length > 0,
    );
    if (!allLinesValid) {
      this.logger.warn(
        `spot_the_bug.regenerate sanity check failed: bugLocations out of [1..${lineCount}] for LO ${lo.id} — review_lo`,
      );
      return null;
    }

    const result: SpotTheBugPrompt = {
      buggyCode: output.buggyCode,
      bugLocations: output.bugLocations,
      correctExplanation: output.correctExplanation,
    };
    if (output.hintMd) result.hintMd = output.hintMd;
    return result;
  }
}
