// HintCacheService — 静态梯度提示的提供者。
//
// 输入是 RequiredInteraction(可能含 hints 字段),输出某 level 的具体 hint 文案 + 总级数。
//
// 两条路径:
//   作者路径:RI.hints 存在 → 直接 hints[level-1],totalLevels = hints.length
//   AI 兜底:RI.hints 缺省 → 调 AI Gateway 一次性生成 3 级,按 RI id in-memory 缓存
//
// 缓存策略:
//   - Map<riId, Promise<string[]>>
//   - 用 Promise 而非 string[] 让并发请求 await 同一个 in-flight 调用,避免重复消耗 token
//   - 进程重启即丢(可接受 — AI Gateway 同 prompt 输出很接近,首次重生成成本一次性)

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { HintLevel, RequiredInteraction } from '@whale-tutor/tutor-types';
import { AiGatewayService } from '../ai/ai-gateway.service';

interface HintGenerateContext {
  subject: string;
  loName: string;
  commonMisconceptions: string[]; // 章末测试 RI 没有 owning LO,传 []
  sessionId?: number | null;
}

interface AiHintOutput {
  hints: string[];
}

@Injectable()
export class HintCacheService {
  private readonly logger = new Logger(HintCacheService.name);
  // RI id → 3 级 hints 的 Promise(用 Promise 防并发重复生成)
  private readonly cache = new Map<string, Promise<string[]>>();

  constructor(@Inject(AiGatewayService) private readonly ai: AiGatewayService) {}

  /**
   * 取某 RI 的某级 hint。
   *
   * @returns hintMd  — 给学习者看的 markdown
   * @returns totalLevels — 该 RI 共有多少级,前端用于决定"再来一级"按钮何时 disable
   * @throws  level 越界返 null(controller 转 400)
   */
  async getHint(
    ri: RequiredInteraction,
    ctx: HintGenerateContext,
    level: HintLevel,
  ): Promise<{ hintMd: string; totalLevels: number } | null> {
    if (level < 1) return null;

    // 作者路径
    if (ri.hints && ri.hints.length > 0) {
      if (level > ri.hints.length) return null;
      return {
        hintMd: ri.hints[level - 1],
        totalLevels: ri.hints.length,
      };
    }

    // AI 兜底路径(3 级固定)
    if (level > 3) return null;
    const aiHints = await this.getOrGenerateAiHints(ri, ctx);
    return {
      hintMd: aiHints[level - 1],
      totalLevels: 3,
    };
  }

  private getOrGenerateAiHints(
    ri: RequiredInteraction,
    ctx: HintGenerateContext,
  ): Promise<string[]> {
    const cached = this.cache.get(ri.id);
    if (cached) return cached;

    const promise = this.generate(ri, ctx).catch((err) => {
      // 失败的话从 cache 里删掉,下次重新生成(避免错误结果一直 cached)
      this.cache.delete(ri.id);
      throw err;
    });
    this.cache.set(ri.id, promise);
    return promise;
  }

  private async generate(
    ri: RequiredInteraction,
    ctx: HintGenerateContext,
  ): Promise<string[]> {
    const startedAt = Date.now();
    const output = await this.ai.complete<AiHintOutput>({
      templateId: 'pattern.hint',
      variables: {
        subject: ctx.subject,
        patternId: ri.patternId,
        loName: ctx.loName,
        promptJson: JSON.stringify(ri.prompt, null, 2),
        commonMisconceptions:
          ctx.commonMisconceptions.length > 0
            ? ctx.commonMisconceptions.map((m) => `- ${m}`).join('\n')
            : '(无)',
      },
      sessionId: ctx.sessionId ?? null,
      callerTag: `hint.generate.${ri.patternId}`,
    });

    if (!output.hints || output.hints.length !== 3) {
      throw new Error(
        `AI hint output for ${ri.id} has ${output.hints?.length ?? 0} levels,expected 3`,
      );
    }
    this.logger.log(
      `Generated AI hints for ${ri.id} in ${Date.now() - startedAt}ms (cached)`,
    );
    return output.hints;
  }
}
