import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { QaMessage, QaThread } from '@whale-tutor/tutor-types';
import * as qaApi from '@/api/qa';

interface StartThreadInput {
  sessionId: number;
  loId: string | null;
  parentInteractionId: number | null;
  parentQaThreadId: number | null;
  question: string;
}

type QaTab = 'current' | 'history';

/**
 * QA 侧支状态。
 *
 * **当前对话(current tab)**:
 *   threadStack 是栈式的(top = 当前显示的 thread)。v0 UI 仅支持单层 + 追问;
 *   嵌套(parent_qa_thread_id)能力 store 已支持,UI 留到 v0.2 暴露。
 *
 * **历史会话(history tab)**:
 *   已结束 thread 的归档区。点击某 thread 展开其消息(只读),
 *   不能继续追问;可"导出 markdown"。
 */
export const useQaStore = defineStore('qa', () => {
  // ===== 当前对话 =====
  const threadStack = ref<QaThread[]>([]);
  const messagesByThread = ref<Record<number, QaMessage[]>>({});
  const isOpen = ref(false);
  const sending = ref(false);
  const error = ref<string | null>(null);

  // ===== UI tab =====
  const activeTab = ref<QaTab>('current');

  // ===== 历史会话 =====
  const historyThreads = ref<QaThread[]>([]);
  const historyMessagesByThread = ref<Record<number, QaMessage[]>>({});
  const selectedHistoryThreadId = ref<number | null>(null);
  const historyLoading = ref(false);

  // ===== Getters =====
  const currentThread = computed<QaThread | null>(
    () => threadStack.value[threadStack.value.length - 1] ?? null,
  );
  const currentMessages = computed<QaMessage[]>(() =>
    currentThread.value ? (messagesByThread.value[currentThread.value.id] ?? []) : [],
  );
  const selectedHistoryThread = computed<QaThread | null>(() => {
    const id = selectedHistoryThreadId.value;
    if (id === null) return null;
    return historyThreads.value.find((t) => t.id === id) ?? null;
  });
  const selectedHistoryMessages = computed<QaMessage[]>(() => {
    const id = selectedHistoryThreadId.value;
    if (id === null) return [];
    return historyMessagesByThread.value[id] ?? [];
  });

  // ===== 当前对话 actions =====
  function openPanel(): void {
    isOpen.value = true;
  }

  function closePanel(): void {
    isOpen.value = false;
  }

  function setTab(tab: QaTab): void {
    activeTab.value = tab;
  }

  async function startThread(input: StartThreadInput): Promise<void> {
    sending.value = true;
    error.value = null;
    try {
      const data = await qaApi.startQaThread(input.sessionId, {
        loId: input.loId,
        parentInteractionId: input.parentInteractionId,
        parentQaThreadId: input.parentQaThreadId,
        question: input.question,
      });
      threadStack.value.push(data.thread);
      messagesByThread.value[data.thread.id] = [data.learnerMessage, data.assistantMessage];
      activeTab.value = 'current';
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      sending.value = false;
    }
  }

  async function appendMessage(question: string): Promise<void> {
    if (!currentThread.value) return;
    const tid = currentThread.value.id;
    sending.value = true;
    error.value = null;
    try {
      const data = await qaApi.appendQaMessage(tid, { question });
      const existing = messagesByThread.value[tid] ?? [];
      messagesByThread.value[tid] = [...existing, data.learnerMessage, data.assistantMessage];
    } catch (e) {
      error.value = (e as Error).message;
      throw e;
    } finally {
      sending.value = false;
    }
  }

  async function endCurrentThread(): Promise<void> {
    const cur = currentThread.value;
    if (!cur) return;
    const tid = cur.id;
    let endedThread: QaThread | null = null;
    try {
      const data = await qaApi.endQaThread(tid);
      endedThread = data.thread;
    } catch {
      // server 端可能因 session 变更等已 ended,前端栈仍 pop
    }
    // 把 ended 的 thread 与其 messages 转入历史区(避免再次 fetch)
    if (endedThread !== null) {
      const msgs = messagesByThread.value[tid] ?? [];
      const idx = historyThreads.value.findIndex((t) => t.id === tid);
      if (idx === -1) historyThreads.value.push(endedThread);
      else historyThreads.value[idx] = endedThread;
      historyMessagesByThread.value[tid] = msgs;
    }
    threadStack.value.pop();
    delete messagesByThread.value[tid];
    if (threadStack.value.length === 0) {
      isOpen.value = false;
      activeTab.value = 'current';
    }
  }

  // ===== 历史会话 actions =====
  async function loadHistory(sessionId: number): Promise<void> {
    historyLoading.value = true;
    try {
      const data = await qaApi.listAllQaThreads(sessionId);
      // 只展示 ended 的(active 在 current tab);按结束时间倒序
      historyThreads.value = data.threads
        .filter((t) => t.status === 'ended')
        .sort((a, b) => {
          const aT = a.endedAt ?? a.startedAt;
          const bT = b.endedAt ?? b.startedAt;
          return bT.localeCompare(aT);
        });
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      historyLoading.value = false;
    }
  }

  async function selectHistoryThread(threadId: number): Promise<void> {
    selectedHistoryThreadId.value = threadId;
    if (historyMessagesByThread.value[threadId]) return; // 已缓存
    try {
      const data = await qaApi.getQaThread(threadId);
      historyMessagesByThread.value[threadId] = data.messages;
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  function clearHistorySelection(): void {
    selectedHistoryThreadId.value = null;
  }

  function reset(): void {
    threadStack.value = [];
    messagesByThread.value = {};
    isOpen.value = false;
    sending.value = false;
    error.value = null;
    activeTab.value = 'current';
    historyThreads.value = [];
    historyMessagesByThread.value = {};
    selectedHistoryThreadId.value = null;
    historyLoading.value = false;
  }

  return {
    // 当前对话 state
    threadStack,
    messagesByThread,
    isOpen,
    sending,
    error,
    // tab
    activeTab,
    // 历史 state
    historyThreads,
    historyMessagesByThread,
    selectedHistoryThreadId,
    historyLoading,
    // getters
    currentThread,
    currentMessages,
    selectedHistoryThread,
    selectedHistoryMessages,
    // actions
    openPanel,
    closePanel,
    setTab,
    startThread,
    appendMessage,
    endCurrentThread,
    loadHistory,
    selectHistoryThread,
    clearHistorySelection,
    reset,
  };
});
