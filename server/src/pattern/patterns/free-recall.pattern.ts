import { Injectable } from '@nestjs/common';
import type {
  EvaluationResult,
  FreeRecallPrompt,
  FreeRecallPromptForLearner,
  FreeRecallResponse,
} from '@whale-tutor/tutor-types';
import { AiGatewayService } from '../../ai/ai-gateway.service';

// AI Gateway 输出的 schema(与 server/src/ai/prompts/free_recall.evaluate.yaml 对齐)
interface FreeRecallAiOutput {
  correct: boolean;
  confidence: number;
  feedbackMd: string;
  rubricCoverage: Array<{ point: string; covered: boolean }>;
}

@Injectable()
export class FreeRecallPattern {
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
    context?: { sessionId?: number },
  ): Promise<EvaluationResult> {
    const aiOutput = await this.ai.complete<FreeRecallAiOutput>({
      templateId: 'free_recall.evaluate',
      variables: {
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
}
