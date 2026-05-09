import { Injectable, Logger } from '@nestjs/common';
import type {
  CodeSandboxPrompt,
  CodeSandboxPromptForLearner,
  CodeSandboxResponse,
  CodeTestCase,
  EvaluationResult,
  LearningObjectiveDefinition,
} from '@whale-tutor/tutor-types';
import { AiGatewayService } from '../../ai/ai-gateway.service';
import type { GenerateContext } from '../pattern.registry';

interface CodeSandboxGenerateOutput {
  promptMd: string;
  starterCode: string | null;
  testCases: CodeTestCase[];
}

@Injectable()
export class CodeSandboxPattern {
  private readonly logger = new Logger(CodeSandboxPattern.name);

  constructor(private readonly ai: AiGatewayService) {}

  toLearnerPrompt(prompt: CodeSandboxPrompt): CodeSandboxPromptForLearner {
    // hiddenTestCases 是 server-only,不下发(留作 v0.2 迁移性测试)
    return {
      promptMd: prompt.promptMd,
      starterCode: prompt.starterCode,
      testCases: prompt.testCases,
    };
  }

  /**
   * 确定性评估:server 信任前端 Pyodide 跑出来的 runResults。
   * v0 不做防作弊(理论上学习者可以伪造 runResults);
   * M3 末再考虑 server 端 docker sandbox re-run 校验。
   */
  evaluate(
    prompt: CodeSandboxPrompt,
    response: CodeSandboxResponse,
  ): EvaluationResult {
    const total = prompt.testCases.length;
    const runResults = response.runResults;
    const allPassed =
      runResults.length === total && runResults.every((r) => r.passed);
    const passedCount = runResults.filter((r) => r.passed).length;

    const parts: string[] = [];
    if (allPassed) {
      parts.push(`✓ 全部 ${total} 个测试用例通过。`);
    } else {
      parts.push(`通过 **${passedCount} / ${total}** 个测试。`);
      runResults.forEach((r, i) => {
        if (!r.passed) {
          const tc = prompt.testCases[i];
          const desc = tc?.description ? ` — ${tc.description}` : '';
          parts.push(
            [
              `**测试 ${i + 1}**${desc}`,
              `输入:\`${tc?.setupCode ?? ''}\``,
              `期望:\`${tc?.expectedOutput ?? ''}\``,
              `实际:\`${r.actualOutput || '(空)'}\`` +
                (r.error ? `\n\n错误:\n\n\`\`\`\n${r.error}\n\`\`\`` : ''),
            ].join('\n\n'),
          );
        }
      });
    }

    return {
      correct: allPassed,
      confidence: 1,
      feedbackMd: parts.join('\n\n'),
      masteryDelta: {},
      hintLevelUsed: 0,
      evaluatorKind: 'deterministic',
    };
  }

  /**
   * v0.2:答错后生成"换情境"的 code_sandbox 题。
   *
   * 出题门槛最高(starterCode + testCases 必须 e2e 可跑),server-side sanity check:
   *   - starterCode 非空且仅含代码(无 markdown fence 残留)
   *   - 每个 testCase.setupCode 含 `print(`,否则 expectedOutput 永远为空
   *   - expectedOutput 非空、trim 后非空
   * 任一失败 → 返 null → review_lo 兜底。
   *
   * 注:即使过 sanity check,starterCode 是否真能让学习者答对仍依赖 AI 题干和 testCase 是否对应,
   *     无法 100% 保证。这是 v0.2 的可接受风险(后续 v1 加 docker python sandbox 复跑 starter+test 才能严)。
   */
  async generate(
    originalPrompt: CodeSandboxPrompt,
    lo: LearningObjectiveDefinition,
    ctx: GenerateContext,
  ): Promise<CodeSandboxPrompt | null> {
    const tcSummary = originalPrompt.testCases
      .map((tc, i) => {
        const desc = tc.description ? ` — ${tc.description}` : '';
        return `${i + 1}.${desc}\n   setupCode: \`${tc.setupCode}\`\n   expectedOutput: \`${tc.expectedOutput}\``;
      })
      .join('\n');

    const output = await this.ai.complete<CodeSandboxGenerateOutput>({
      templateId: 'pattern.regenerate.code_sandbox',
      variables: {
        subject: ctx.subject,
        loName: lo.name,
        loDescription: lo.description,
        commonMisconceptions:
          lo.commonMisconceptions.length > 0
            ? lo.commonMisconceptions.map((m) => `- ${m}`).join('\n')
            : '(无)',
        originalPromptMd: originalPrompt.promptMd,
        originalStarterCode: originalPrompt.starterCode,
        originalTestCases: tcSummary,
        attemptIndex: ctx.attemptIndex,
      },
      sessionId: ctx.sessionId ?? null,
      callerTag: 'pattern.code_sandbox.regenerate',
    });

    if (!output.starterCode || output.testCases.length === 0) {
      this.logger.log(
        `code_sandbox.regenerate for LO ${lo.id}: AI fallback (null/empty) — review_lo`,
      );
      return null;
    }

    // Sanity check
    const starterClean = output.starterCode.trim();
    if (!starterClean || starterClean.startsWith('```')) {
      this.logger.warn(
        `code_sandbox.regenerate sanity: starterCode 含 markdown fence 或为空 — review_lo`,
      );
      return null;
    }
    const allTcValid = output.testCases.every((tc) => {
      const expectedClean = (tc.expectedOutput ?? '').trim();
      const setupClean = (tc.setupCode ?? '').trim();
      const hasPrint = /\bprint\s*\(/.test(setupClean);
      return setupClean.length > 0 && hasPrint && expectedClean.length > 0;
    });
    if (!allTcValid) {
      this.logger.warn(
        `code_sandbox.regenerate sanity: testCase 缺 print() 或 expectedOutput 空 — review_lo`,
      );
      return null;
    }

    return {
      promptMd: output.promptMd,
      starterCode: output.starterCode,
      testCases: output.testCases,
    };
  }
}
