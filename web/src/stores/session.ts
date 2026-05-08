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
      // eslint-disable-next-line no-console
      console.warn('[session] refreshProgress failed:', (e as Error).message);
    }
  }

  function acknowledgeCurrentLo(): void {
    if (currentInteraction.value) {
      acknowledgedLoIds.value.add(currentInteraction.value.loId);
      showLoIntro.value = false;
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
      const data = await sessionApi.submitResponse(sessionId.value, body);
      lastEvaluation.value = data.evaluation;
      lastLoState.value = data.updatedLoState;
      currentDecision.value = data.nextDecision;
      pendingNextInteraction.value = data.nextInteraction;
      showFeedback.value = true;
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
    await refreshLoIntroFlag();
    void refreshProgress();
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
    loading,
    error,
    loMetaCache,
    acknowledgedLoIds,
    showLoIntro,
    progress,
    // actions
    start,
    submit,
    continueToNext,
    acknowledgeCurrentLo,
    refreshProgress,
    ensureLoMeta,
    end,
  };
});
