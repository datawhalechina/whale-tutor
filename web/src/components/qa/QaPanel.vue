<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { ArchiveNodeKind } from '@whale-tutor/tutor-types';
import { useQaStore } from '@/stores/qa';
import { useSessionStore } from '@/stores/session';
import QaMessage from './QaMessage.vue';

const emit = defineEmits<{
  'view-archive': [kind: ArchiveNodeKind, id: number];
}>();

const qaStore = useQaStore();
const {
  isOpen,
  activeTab,
  currentThread,
  currentMessages,
  sending,
  error,
  historyThreads,
  selectedHistoryThread,
  selectedHistoryMessages,
  historyLoading,
} = storeToRefs(qaStore);
const sessionStore = useSessionStore();

const input = ref('');
const messageList = ref<HTMLElement | null>(null);
const historyMessageList = ref<HTMLElement | null>(null);

// 新消息追加后自动滚到底部(当前对话)
watch(
  () => currentMessages.value.length,
  async () => {
    await nextTick();
    if (messageList.value) {
      messageList.value.scrollTop = messageList.value.scrollHeight;
    }
  },
);

// 选中历史 thread 后滚到顶
watch(
  () => selectedHistoryThread.value?.id,
  async () => {
    await nextTick();
    if (historyMessageList.value) historyMessageList.value.scrollTop = 0;
  },
);

const placeholder = computed(() =>
  currentThread.value
    ? '继续追问…(Ctrl+Enter 发送)'
    : '提一个关于当前内容的问题…(Ctrl+Enter 发送)',
);
const canSend = computed(
  () => input.value.trim().length > 0 && !sending.value,
);
const headerSubtitle = computed(() => {
  if (!currentThread.value) return '';
  const lo = currentThread.value.loId;
  const parts: string[] = [];
  if (lo) parts.push(`在 ${lo} 上提问`);
  if (currentThread.value.parentInteractionId !== null) {
    parts.push(`与第 ${currentThread.value.parentInteractionId} 题相关`);
  }
  return parts.join(' · ');
});

async function handleSend(): Promise<void> {
  const q = input.value.trim();
  if (!q) return;

  if (currentThread.value) {
    await qaStore.appendMessage(q);
  } else {
    if (!sessionStore.sessionId) return;
    await qaStore.startThread({
      sessionId: sessionStore.sessionId,
      loId: sessionStore.currentInteraction?.loId ?? null,
      parentInteractionId: sessionStore.currentInteraction?.id ?? null,
      parentQaThreadId: null,
      question: q,
    });
  }
  input.value = '';
}

async function handleEnd(): Promise<void> {
  await qaStore.endCurrentThread();
}

function handleClose(): void {
  qaStore.closePanel();
}

async function onTabChange(tab: string | number): Promise<void> {
  qaStore.setTab(tab as 'current' | 'history');
  if (tab === 'history' && sessionStore.sessionId) {
    await qaStore.loadHistory(sessionStore.sessionId);
  }
}

async function selectHistoryThread(threadId: number): Promise<void> {
  await qaStore.selectHistoryThread(threadId);
}

function backToHistoryList(): void {
  qaStore.clearHistorySelection();
}

function exportHistoryThread(threadId: number, evt?: Event): void {
  if (evt) evt.stopPropagation();
  emit('view-archive', 'qa-thread', threadId);
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  // 简短显示 'YYYY-MM-DD HH:MM'
  return iso.slice(0, 16).replace('T', ' ');
}

function summarize(text: string, n = 40): string {
  const cleaned = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > n ? cleaned.slice(0, n) + '…' : cleaned;
}
</script>

<template>
  <el-drawer
    v-model="isOpen"
    direction="rtl"
    size="480px"
    :show-close="true"
    :before-close="
      (done: any) => {
        handleClose();
        done();
      }
    "
  >
    <template #header>
      <div class="drawer-header">
        <h3>问问题</h3>
        <span v-if="activeTab === 'current' && headerSubtitle" class="subtitle">
          {{ headerSubtitle }}
        </span>
      </div>
    </template>

    <div class="qa-panel">
      <el-tabs
        :model-value="activeTab"
        class="qa-tabs"
        @update:model-value="onTabChange"
      >
        <el-tab-pane label="当前对话" name="current" />
        <el-tab-pane label="历史会话" name="history" />
      </el-tabs>

      <!-- ========================
           当前对话 tab
           ======================== -->
      <div v-if="activeTab === 'current'" class="tab-content">
        <div ref="messageList" class="message-list">
          <div
            v-if="!currentThread && currentMessages.length === 0"
            class="empty-hint"
          >
            <p class="hint-title">有疑问随时来问</p>
            <p class="hint-desc">
              QA 是侧支,不会影响你的答题进度。结束此次提问后回到原来的题。
              已结束的会话可在"历史会话"标签查看。
            </p>
          </div>

          <QaMessage
            v-for="msg in currentMessages"
            :key="msg.id"
            :message="msg"
          />

          <div v-if="sending" class="sending-indicator">
            <span class="dot-anim">…</span> AI 思考中
          </div>
        </div>

        <el-alert
          v-if="error"
          :title="error"
          type="error"
          :closable="false"
          show-icon
          class="error-alert"
        />

        <div class="input-area">
          <el-input
            v-model="input"
            type="textarea"
            :rows="3"
            :placeholder="placeholder"
            :disabled="sending"
            @keydown.ctrl.enter.prevent="handleSend"
            @keydown.meta.enter.prevent="handleSend"
          />
          <div class="actions">
            <el-button
              v-if="currentThread"
              plain
              size="small"
              @click="handleEnd"
            >
              结束此次提问
            </el-button>
            <div style="flex: 1"></div>
            <el-button
              type="primary"
              :loading="sending"
              :disabled="!canSend"
              @click="handleSend"
            >
              发送
            </el-button>
          </div>
        </div>
      </div>

      <!-- ========================
           历史会话 tab
           ======================== -->
      <div v-else class="tab-content">
        <div v-if="historyLoading" v-loading="true" class="loading-area"></div>

        <!-- 列表视图 -->
        <div
          v-else-if="!selectedHistoryThread"
          class="history-list"
        >
          <div v-if="historyThreads.length === 0" class="empty-hint">
            <p class="hint-title">暂无历史会话</p>
            <p class="hint-desc">结束当前对话后,会话会出现在这里供你回看。</p>
          </div>
          <div
            v-for="t in historyThreads"
            :key="t.id"
            class="history-item"
            @click="selectHistoryThread(t.id)"
          >
            <div class="item-row">
              <span class="item-id">#{{ t.id }}</span>
              <span class="item-time">{{ formatTime(t.endedAt || t.startedAt) }}</span>
              <button
                class="export-btn"
                title="导出 markdown"
                @click.stop="exportHistoryThread(t.id, $event)"
              >
                📋
              </button>
            </div>
            <div class="item-summary">
              {{
                qaStore.historyMessagesByThread[t.id]?.find((m) => m.role === 'learner')
                  ? summarize(qaStore.historyMessagesByThread[t.id].find((m) => m.role === 'learner')!.contentMd)
                  : `(thread #${t.id})`
              }}
            </div>
            <div class="item-meta">
              <span v-if="t.loId">{{ t.loId }}</span>
              <span v-if="t.parentInteractionId !== null">
                · 第 {{ t.parentInteractionId }} 题
              </span>
            </div>
          </div>
        </div>

        <!-- 详情视图(只读) -->
        <div v-else class="history-detail">
          <div class="detail-header">
            <el-button text size="small" @click="backToHistoryList">
              ← 返回列表
            </el-button>
            <button
              class="export-btn"
              title="导出 markdown"
              @click="exportHistoryThread(selectedHistoryThread.id)"
            >
              📋 导出
            </button>
          </div>
          <div ref="historyMessageList" class="history-messages">
            <QaMessage
              v-for="msg in selectedHistoryMessages"
              :key="msg.id"
              :message="msg"
            />
          </div>
          <div class="readonly-hint">
            🔒 此次提问已结束,无法继续追问。如需再问,可在主页面的"💬 问问题"开新会话。
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.drawer-header h3 {
  margin: 0;
}
.subtitle {
  font-size: 12px;
  color: #909399;
}
.qa-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.qa-tabs {
  flex-shrink: 0;
  margin-bottom: 8px;
}
.qa-tabs :deep(.el-tabs__nav-wrap)::after {
  height: 1px;
}
.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 4px 16px;
  min-height: 0;
}
.empty-hint {
  margin: 60px auto;
  text-align: center;
  max-width: 320px;
}
.hint-title {
  font-size: 18px;
  color: #303133;
  margin-bottom: 8px;
}
.hint-desc {
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}
.sending-indicator {
  font-size: 13px;
  color: #909399;
  padding: 8px 14px;
  margin-top: 4px;
}
.dot-anim {
  display: inline-block;
  animation: blink 1.4s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.error-alert {
  margin-bottom: 8px;
}
.input-area {
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
  flex-shrink: 0;
}
.actions {
  display: flex;
  align-items: center;
  margin-top: 8px;
}
.loading-area {
  min-height: 200px;
}
.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}
.history-item {
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.history-item:hover {
  border-color: #409eff;
  background: #fafafa;
}
.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.item-id {
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}
.item-time {
  flex: 1;
  font-size: 12px;
  color: #909399;
}
.export-btn {
  background: transparent;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
  color: #606266;
}
.export-btn:hover {
  border-color: #409eff;
  color: #409eff;
}
.item-summary {
  font-size: 14px;
  color: #303133;
  line-height: 1.5;
  margin-bottom: 4px;
}
.item-meta {
  font-size: 12px;
  color: #909399;
}
.history-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.detail-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0 8px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 12px;
}
.history-messages {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  min-height: 0;
}
.readonly-hint {
  flex-shrink: 0;
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}
</style>
