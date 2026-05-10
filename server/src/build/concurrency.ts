// 简单的并发限流器 — 给 build / generate 的多章 / 多 LO AI 调用并行用。
//
// 为什么不直接 Promise.all?DeepSeek 有 RPM 限制,无脑全部并发会被限流;
// 同时一次性 spawn N 个长 HTTP 连接也会让 stdout 日志乱成一锅。
//
// 为什么不引入 p-limit 之类的依赖?只用一处的轻量并发场景,30 行内就能写完。

/**
 * 用 limit 个 worker 并行跑 fn 处理 items,返回**按输入顺序**的结果数组。
 *
 * 行为:
 * - 至多 limit 个 fn 同时在跑
 * - 任何 fn 抛错不会立即中断其他正在跑的(避免 1 章错导致已经在跑的几章白费)
 * - 全部跑完后,如果有任何错,聚合后抛单个 Error,messages 列出哪几个失败
 *
 * @param limit  并发上限(建议 3-5,DeepSeek RPM 60 + 单调用 30-60s 时此值偏稳)
 * @param items  输入数组
 * @param fn     async (item, index) => result
 */
export async function mapWithLimit<T, R>(
  limit: number,
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results: R[] = new Array(items.length);
  const errors: Array<{ index: number; error: Error }> = [];
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (e) {
        errors.push({ index: idx, error: e as Error });
      }
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));

  if (errors.length > 0) {
    const summary = errors
      .sort((a, b) => a.index - b.index)
      .map(({ index, error }) => `  - item[${index}]: ${error.message}`)
      .join('\n');
    throw new Error(`${errors.length}/${items.length} 个并行任务失败:\n${summary}`);
  }
  return results;
}

/**
 * 默认并发上限。DeepSeek 实测 5-8 并发不会触发限流,且日志可读。
 * 通过 env 覆盖:`WHALE_TUTOR_AI_CONCURRENCY=10`(给有更高 RPM 配额的用户用)。
 */
export const DEFAULT_AI_CONCURRENCY = (() => {
  const env = process.env.WHALE_TUTOR_AI_CONCURRENCY;
  const n = env ? parseInt(env, 10) : 5;
  return Number.isFinite(n) && n > 0 ? n : 5;
})();
