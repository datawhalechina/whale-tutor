import { Injectable } from '@nestjs/common';
import type {
  CodeSandboxPrompt,
  CodeSandboxPromptForLearner,
  CodeSandboxResponse,
  EvaluationResult,
} from '@whale-tutor/tutor-types';

@Injectable()
export class CodeSandboxPattern {
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
}
