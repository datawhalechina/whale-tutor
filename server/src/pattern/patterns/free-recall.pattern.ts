import { Injectable, Logger } from '@nestjs/common';
import type {
  EvaluationResult,
  FreeRecallPrompt,
  FreeRecallPromptForLearner,
  FreeRecallResponse,
  LearningObjectiveDefinition,
} from '@whale-tutor/tutor-types';
import { AiGatewayService } from '../../ai/ai-gateway.service';
import type { GenerateContext } from '../pattern.registry';

// AI Gateway 输出的 schema(与 server/src/ai/prompts/free_recall.evaluate.yaml 对齐)
interface FreeRecallAiOutput {
  correct: boolean;
  confidence: number;
  feedbackMd: string;
  rubricCoverage: Array<{ point: string; covered: boolean }>;
}

interface FreeRecallGenerateOutput {
  promptMd: string | null;
  rubricKeyPoints: string[];
}

@Injectable()
export class FreeRecallPattern {
  private readonly logger = new Logger(FreeRecallPattern.name);

  constructor(private readonly ai: AiGatewayService) {}

  toLearnerPrompt(prompt: FreeRecallPrompt): FreeRecallPromptForLearner {
    // rubricKeyPoints 是 server-only 的评估 rubric,不下发
    return { promptMd: prompt.promptMd };
  }

  /**
   * AI 评估学习者的自由回忆。
   * 失败/无 key 时 AI Gateway 返回 fallback 文案,这里直接转发(confidence 较低,前端可标"AI 评估暂不可用")。
   */
  async evaluate(
    prompt: FreeRecallPrompt,
    response: FreeRecallResponse,
    context: { sessionId?: number; subject: string },
  ): Promise<EvaluationResult> {
    const aiOutput = await this.ai.complete<FreeRecallAiOutput>({
      templateId: 'free_recall.evaluate',
      variables: {
        subject: context.subject,
        promptMd: prompt.promptMd,
        rubricKeyPointsList: prompt.rubricKeyPoints.map((p) => `- ${p}`).join('\n'),
        response: response.text,
      },
      sessionId: context?.sessionId ?? null,
      callerTag: 'pattern.free_recall.evaluate',
    });

    return {
      correct: aiOutput.correct,
      confidence: aiOutput.confidence,
      feedbackMd: aiOutput.feedbackMd,
      // mastery 状态机增量由 SessionService 应用
      masteryDelta: {},
      hintLevelUsed: 0,
      evaluatorKind: 'ai',
    };
  }

  /**
   * v0.2:答错 free_recall 后,生成一道"换角度"的同 LO free_recall 题。
   * AI 失败 → output.promptMd = null → 返 null,SessionService 落 review_lo 兜底。
   */
  async generate(
    originalPrompt: FreeRecallPrompt,
    lo: LearningObjectiveDefinition,
    ctx: GenerateContext,
  ): Promise<FreeRecallPrompt | null> {
    const output = await this.ai.complete<FreeRecallGenerateOutput>({
      templateId: 'pattern.regenerate.free_recall',
      variables: {
        subject: ctx.subject,
        loName: lo.name,
        loDescription: lo.description,
        commonMisconceptions:
          lo.commonMisconceptions.length > 0
            ? lo.commonMisconceptions.map((m) => `- ${m}`).join('\n')
            : '(无)',
        originalPromptMd: originalPrompt.promptMd,
        originalRubricList: originalPrompt.rubricKeyPoints.map((p) => `- ${p}`).join('\n'),
        attemptIndex: ctx.attemptIndex,
      },
      sessionId: ctx.sessionId ?? null,
      callerTag: 'pattern.free_recall.regenerate',
    });

    if (!output.promptMd || output.rubricKeyPoints.length === 0) {
      this.logger.log(
        `free_recall.regenerate for LO ${lo.id} returned null prompt (fallback) — caller falls back to review_lo`,
      );
      return null;
    }
    return {
      promptMd: output.promptMd,
      rubricKeyPoints: output.rubricKeyPoints,
    };
  }
}
