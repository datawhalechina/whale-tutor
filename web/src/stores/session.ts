import { defineStore } from 'pinia';
import { ref } from 'vue';
import type {
  EvaluationResult,
  GetSessionProgressResponse,
  LearnerLoState,
  LearningObjective,
  PathDecision,
  ServedInteraction,
  SubmitResponseBody,
} from '@whale-tutor/tutor-types';
import * as knowledgeApi from '@/api/knowledge';
import * as sessionApi from '@/api/session';

/**
 * 学习会话状态。
 *
 * UX 流(三阶状态机):
 *   1. 进入新 LO → showLoIntro=true,显示 LoIntroCard(LO 名称+核心讲解)
 *   2. 学习者点"开始练习" → acknowledge 该 LO → showLoIntro=false,显示题目卡片
 *   3. 学习者答 → submit() → server 返 evaluation + nextInteraction
 *   4. showFeedback=true,题目卡片切到反馈视图(pendingNextInteraction 暂存)
 *   5. 学习者点"下一题" → continueToNext()
 *      - 如果下一道在同 LO → 直接显示新题
 *      - 如果下一道切 LO → showLoIntro=true,显示新 LO 的 intro
 *
 * progress 字段:章节 + 所有 LO 的进度概览,给 ProgressSidebar 用。
 * 在 start() 与 submit() 后自动 refresh。
 */
export const useSessionStore = defineStore('session', () => {
  const sessionId = ref<number | null>(null);
  const currentInteraction = ref<ServedInteraction | null>(null);
  const currentDecision = ref<PathDecision | null>(null);
  const lastEvaluation = ref<EvaluationResult | null>(null);
  const lastLoState = ref<LearnerLoState | null>(null);
  const pendingNextInteraction = ref<ServedInteraction | null>(null);
  const showFeedback = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // LO 元信息缓存(每个 LO 只 fetch 一次)
  const loMetaCache = ref<Record<string, LearningObjective>>({});
  // 学习者已确认看过 intro 的 LO 集合(切换到新 LO 才再显示 intro)
  const acknowledgedLoIds = ref<Set<string>>(new Set());
  // 是否当前需要显示 LO intro 而非题目
  const showLoIntro = ref(false);

  // 章节 + LO 整体进度概览(ProgressSidebar 显示)
  const progress = ref<GetSessionProgressResponse | null>(null);
  // demo learner id,从 start() 入参记录,后续 archive endpoint 等需要
  const learnerId = ref<number | null>(null);

  // StuckProtocol:当前 interaction 上学习者已用过的最高 hint 级别。
  // submit 时自动加进 body.hintLevelUsed,让 server 写入 responses.hint_level。
  // 切到下一题(continueToNext)/ start / end 时清零。
  const currentHintLevel = ref(0);

  // v0.2 PathOrchestrator:server 返 review_lo decision 时,前端进入"重看讲解 + 兜底"模式。
  // 此期间隐藏题目卡片,展示 LoIntroCard recap 全屏覆盖。学习者点"我看完了" → acknowledgeReviewLo。
  // 来源:start() / submit() / acknowledgeReviewLo() 自身后续仍可触发(理论上链不长但有兜底)
  const reviewLoActive = ref(false);
  const reviewLoReason = ref<string | null>(null);

  async function ensureLoMeta(loId: string): Promise<LearningObjective> {
    if (loMetaCache.value[loId]) return loMetaCache.value[loId];
    const meta = await knowledgeApi.getLearningObjective(loId);
    loMetaCache.value[loId] = meta;
    return meta;
  }

  async function refreshLoIntroFlag(): Promise<void> {
    if (!currentInteraction.value) {
      showLoIntro.value = false;
      return;
    }
    const loId = currentInteraction.value.loId;
    await ensureLoMeta(loId);
    showLoIntro.value = !acknowledgedLoIds.value.has(loId);
  }

  async function refreshProgress(): Promise<void> {
    if (!sessionId.value) return;
    try {
      progress.value = await sessionApi.getSessionProgress(sessionId.value);
    } catch (e) {
      // 进度 fetch 失败不阻塞主流(sidebar 缺数据但其他可继续)
       
      console.warn('[session] refreshProgress failed:', (e as Error).message);
    }
  }

  function acknowledgeCurrentLo(): void {
    if (currentInteraction.value) {
      acknowledgedLoIds.value.add(currentInteraction.value.loId);
      showLoIntro.value = false;
    }
  }

  // review_lo 模式开关:从 PathDecision 推导。decision.primary.type === 'review_lo' →
  // 进入 reviewLo 模式,前端隐藏题目区域、展示 LoIntroCard recap。
  function applyReviewLoFromDecision(decision: PathDecision | null): void {
    if (decision && decision.primary.type === 'review_lo') {
      reviewLoActive.value = true;
      reviewLoReason.value = decision.primary.reason ?? null;
    } else {
      reviewLoActive.value = false;
      reviewLoReason.value = null;
    }
  }

  async function start(lid: number, courseId: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const data = await sessionApi.startSession({
        learnerId: lid,
        courseId,
      });
      sessionId.value = data.sessionId;
      learnerId.value = lid;
      currentInteraction.value = data.interaction;
      currentDecision.value = data.decision;
      lastEvaluation.value = null;
      lastLoState.value = null;
      pendingNextInteraction.value = null;
      showFeedback.value = false;
      acknowledgedLoIds.value = new Set();
      currentHintLevel.value = 0;
      applyReviewLoFromDecision(data.decision);
      await refreshLoIntroFlag();
      await refreshProgress();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function submit(body: SubmitResponseBody): Promise<void> {
    if (!sessionId.value) throw new Error('no active session');
    loading.value = true;
    error.value = null;
    try {
      // 自动把 currentHintLevel 注入 submit body — pattern cards 不需要感知
      const enriched = {
        ...body,
        hintLevelUsed: (currentHintLevel.value as 0 | 1 | 2 | 3 | 4) ?? 0,
      } as SubmitResponseBody;
      const data = await sessionApi.submitResponse(sessionId.value, enriched);
      lastEvaluation.value = data.evaluation;
      lastLoState.value = data.updatedLoState;
      currentDecision.value = data.nextDecision;
      pendingNextInteraction.value = data.nextInteraction;
      showFeedback.value = true;
      // review_lo 在 continueToNext 时再激活(否则反馈视图被立刻覆盖,学习者看不到结果)
      // 提交后刷新进度(mastery / 必做完成数 / chapter phase 都可能变)
      void refreshProgress();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function continueToNext(): Promise<void> {
    currentInteraction.value = pendingNextInteraction.value;
    pendingNextInteraction.value = null;
    lastEvaluation.value = null;
    showFeedback.value = false;
    currentHintLevel.value = 0;
    applyReviewLoFromDecision(currentDecision.value);
    await refreshLoIntroFlag();
    void refreshProgress();
  }

  /**
   * v0.2 多 chapter:从 sidebar 点其他章节,server 把 session.current_lo_id 切到该章首 LO,
   * 重算 decideNext + 服务下一题。不影响 mastery / mandatory 状态。
   */
  async function switchChapter(chapterId: string): Promise<void> {
    if (!sessionId.value) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await sessionApi.switchChapter(sessionId.value, { chapterId });
      currentInteraction.value = data.interaction;
      currentDecision.value = data.decision;
      pendingNextInteraction.value = null;
      lastEvaluation.value = null;
      showFeedback.value = false;
      currentHintLevel.value = 0;
      // 切到不同 LO → 默认显示 LO intro(让学习者看清新章节内容)
      acknowledgedLoIds.value = new Set();
      applyReviewLoFromDecision(data.decision);
      await refreshLoIntroFlag();
      void refreshProgress();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * v0.2:从 LO recap 兜底回来 → 调 server 清 retry 状态,服务端再 decideNext + 服务下一题。
   * 通常会得到原 RI 的 static 题。失败的话 server 仍可能再返 review_lo,前端继续展示。
   */
  async function acknowledgeReviewLo(): Promise<void> {
    if (!sessionId.value) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await sessionApi.acknowledgeReviewLo(sessionId.value);
      currentInteraction.value = data.interaction;
      currentDecision.value = data.decision;
      pendingNextInteraction.value = null;
      lastEvaluation.value = null;
      showFeedback.value = false;
      currentHintLevel.value = 0;
      applyReviewLoFromDecision(data.decision);
      await refreshLoIntroFlag();
      void refreshProgress();
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function end(): Promise<void> {
    if (!sessionId.value) return;
    try {
      await sessionApi.endSession(sessionId.value);
    } finally {
      sessionId.value = null;
      learnerId.value = null;
      currentInteraction.value = null;
      currentDecision.value = null;
      lastEvaluation.value = null;
      lastLoState.value = null;
      pendingNextInteraction.value = null;
      showFeedback.value = false;
      acknowledgedLoIds.value = new Set();
      showLoIntro.value = false;
      progress.value = null;
      currentHintLevel.value = 0;
      reviewLoActive.value = false;
      reviewLoReason.value = null;
    }
  }

  return {
    // state
    sessionId,
    learnerId,
    currentInteraction,
    currentDecision,
    lastEvaluation,
    lastLoState,
    pendingNextInteraction,
    showFeedback,
    reviewLoActive,
    reviewLoReason,
    loading,
    error,
    loMetaCache,
    acknowledgedLoIds,
    showLoIntro,
    progress,
    currentHintLevel,
    // actions
    start,
    submit,
    continueToNext,
    acknowledgeCurrentLo,
    acknowledgeReviewLo,
    switchChapter,
    refreshProgress,
    ensureLoMeta,
    end,
  };
});
