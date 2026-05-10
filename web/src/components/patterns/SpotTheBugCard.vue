<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { InteractionInstance, SpotTheBugPromptForLearner } from '@whale-tutor/tutor-types';
import { useSessionStore } from '@/stores/session';
import { renderMarkdown } from '@/utils/markdown';
import FeedbackArea from '@/components/FeedbackArea.vue';

const props = defineProps<{
  interaction: InteractionInstance<SpotTheBugPromptForLearner>;
}>();

const sessionStore = useSessionStore();
const {
  lastEvaluation,
  lastLoState,
  showFeedback,
  pendingNextInteraction,
  currentDecision,
  loading,
  loadingNext,
  hasFetchedNext,
} = storeToRefs(sessionStore);

// 行号从 1 开始(与 server bugLocations.line 一致)
const selectedLines = ref<Set<number>>(new Set());
const explanation = ref('');

watch(
  () => props.interaction.id,
  () => {
    selectedLines.value = new Set();
    explanation.value = '';
  },
);

const codeLines = computed(() => props.interaction.prompt.buggyCode.replace(/\n$/, '').split('\n'));
const hintHtml = computed(() =>
  props.interaction.prompt.hintMd ? renderMarkdown(props.interaction.prompt.hintMd) : '',
);

// 只在 fetch 真完成 + pending 确认为 null 时才算章末 — hasFetchedNext 守门
const isLastInChapter = computed(
  () => showFeedback.value && hasFetchedNext.value && pendingNextInteraction.value === null,
);
const isRetrySameRi = computed(() => showFeedback.value && lastEvaluation.value?.correct === false);
const shouldSuggestReview = computed(
  () => showFeedback.value && (lastLoState.value?.consecutiveWrong ?? 0) >= 3,
);
const isReviewLoNext = computed(
  () => showFeedback.value && currentDecision.value?.primary.type === 'review_lo',
);
const continueButtonLabel = computed(() => {
  if (isReviewLoNext.value) return '去看讲解';
  if (isLastInChapter.value) return '查看结果';
  return '下一题';
});

const sortedSelected = computed(() => [...selectedLines.value].sort((a, b) => a - b));

const trimmedExplanation = computed(() => explanation.value.trim());
const canSubmit = computed(
  () => selectedLines.value.size > 0 && trimmedExplanation.value.length > 0,
);

function toggleLine(line: number): void {
  if (showFeedback.value) return;
  const next = new Set(selectedLines.value);
  if (next.has(line)) next.delete(line);
  else next.add(line);
  selectedLines.value = next;
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  await sessionStore.submit({
    interactionId: props.interaction.id,
    patternId: 'spot_the_bug',
    response: {
      selectedLines: sortedSelected.value,
      explanation: trimmedExplanation.value,
    },
  });
}

function continueToNext(): void {
  void sessionStore.continueToNext();
}

function retryAnswer(): void {
  // 同 ConceptCheckCard.retryAnswer:UI 重置;explanation 留着供用户改后再交,
  // selectedLines 清掉(让用户重新点)
  selectedLines.value = new Set();
  sessionStore.clearFeedback();
}
</script>

<template>
  <el-card class="spot-the-bug-card" shadow="never">
    <h3 class="section-title">找 bug</h3>
    <p class="instruction">
      阅读下方代码,**点击**你认为有 bug 的行(可多选),然后在下面写下你的理解。
    </p>

    <div class="code-block">
      <div
        v-for="(line, idx) in codeLines"
        :key="idx"
        :class="[
          'code-line',
          { selected: selectedLines.has(idx + 1), 'is-disabled': showFeedback },
        ]"
        @click="toggleLine(idx + 1)"
      >
        <span class="line-no">{{ idx + 1 }}</span>
        <span class="line-content">{{ line || ' ' }}</span>
      </div>
    </div>

    <div v-if="selectedLines.size > 0 && !showFeedback" class="selected-info">
      已选 {{ selectedLines.size }} 行:{{ sortedSelected.join(', ') }}
    </div>

    <div v-if="hintHtml" class="hint markdown-body" v-html="hintHtml"></div>

    <h4 class="section-subtitle">解释这个 bug</h4>
    <el-input
      v-model="explanation"
      type="textarea"
      :rows="4"
      :disabled="showFeedback"
      placeholder="说明这段代码有什么问题、为什么是 bug、应该怎么改..."
      class="textarea"
    />

    <transition name="fade">
      <FeedbackArea
        v-if="showFeedback && lastEvaluation"
        :evaluation="lastEvaluation"
        :is-retry-same-ri="isRetrySameRi"
      />
    </transition>

    <el-alert
      v-if="shouldSuggestReview"
      type="warning"
      show-icon
      :closable="false"
      class="stuck-banner"
    >
      <template #title>
        <strong>已连续答错 {{ lastLoState?.consecutiveWrong }} 次</strong>
      </template>
      继续重试可能不是最佳选择 — 回到 LO 讲解再来一次会更有帮助。
    </el-alert>

    <div class="actions">
      <template v-if="!showFeedback">
        <el-button type="primary" :disabled="!canSubmit" :loading="loading" @click="submit">
          提交
        </el-button>
      </template>
      <template v-else>
        <el-button v-if="isRetrySameRi" plain @click="retryAnswer"> 🔁 再试一次 </el-button>
        <el-button
          v-if="shouldSuggestReview && !isReviewLoNext"
          type="warning"
          :loading="loadingNext"
          @click="continueToNext"
        >
          📖 去看讲解
        </el-button>
        <el-button
          v-if="!isRetrySameRi || isReviewLoNext"
          type="primary"
          :loading="loadingNext"
          @click="continueToNext"
        >
          {{ continueButtonLabel }}
        </el-button>
      </template>
    </div>
  </el-card>
</template>

<style scoped>
.spot-the-bug-card {
  border: 1px solid #ebeef5;
}
.section-title {
  margin: 0 0 8px;
  font-size: 16px;
  color: #303133;
}
.section-subtitle {
  margin: 16px 0 8px;
  font-size: 14px;
  color: #303133;
}
.instruction {
  color: #606266;
  font-size: 13px;
  margin-bottom: 12px;
}
.code-block {
  background: #f6f8fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
  font-size: 13px;
  overflow-x: auto;
  user-select: none;
}
.code-line {
  display: flex;
  cursor: pointer;
  padding: 2px 0;
  transition: background 0.15s;
  border-left: 3px solid transparent;
}
.code-line:hover:not(.is-disabled) {
  background: #e9ecef;
}
.code-line.selected {
  background: #fff7e6;
  border-left-color: #f59e0b;
}
.code-line.is-disabled {
  cursor: default;
}
.line-no {
  display: inline-block;
  min-width: 36px;
  flex-shrink: 0;
  text-align: right;
  padding-right: 12px;
  color: #909399;
  border-right: 1px solid #e9ecef;
}
.line-content {
  padding-left: 12px;
  white-space: pre;
  flex: 1;
  color: #24292e;
}
.selected-info {
  margin-top: 8px;
  font-size: 13px;
  color: #d97706;
}
.hint {
  margin: 12px 0;
  padding: 12px 16px;
  background: #fffbe6;
  border-left: 3px solid #f59e0b;
  border-radius: 0 4px 4px 0;
  font-size: 13px;
}
.textarea {
  margin-top: 8px;
}
.actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.stuck-banner {
  margin-top: 16px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
