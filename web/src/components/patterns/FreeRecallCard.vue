<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { FreeRecallPromptForLearner, InteractionInstance } from '@whale-tutor/tutor-types';
import { useSessionStore } from '@/stores/session';
import { renderMarkdown } from '@/utils/markdown';
import FeedbackArea from '@/components/FeedbackArea.vue';

const props = defineProps<{
  interaction: InteractionInstance<FreeRecallPromptForLearner>;
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

const text = ref('');

watch(
  () => props.interaction.id,
  () => {
    text.value = '';
  },
);

const promptHtml = computed(() => renderMarkdown(props.interaction.prompt.promptMd));

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

const trimmed = computed(() => text.value.trim());

async function submit(): Promise<void> {
  if (!trimmed.value) return;
  await sessionStore.submit({
    interactionId: props.interaction.id,
    patternId: 'free_recall',
    response: { text: trimmed.value },
  });
}

function continueToNext(): void {
  void sessionStore.continueToNext();
}

function retryAnswer(): void {
  // 同 ConceptCheckCard.retryAnswer:UI 重置;text 留着供用户改后再交
  sessionStore.clearFeedback();
}
</script>

<template>
  <el-card class="free-recall-card" shadow="never">
    <h3 class="section-title">自由回忆</h3>
    <div class="markdown-body prompt" v-html="promptHtml"></div>

    <el-input
      v-model="text"
      type="textarea"
      :rows="6"
      :disabled="showFeedback"
      placeholder="用自己的话写下你的理解(不需要写代码)..."
      class="textarea"
    />
    <div class="char-count">{{ text.length }} 字</div>

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
        <el-button type="primary" :disabled="!trimmed" :loading="loading" @click="submit">
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
.free-recall-card {
  border: 1px solid #ebeef5;
}
.section-title {
  margin: 0 0 12px;
  font-size: 16px;
  color: #303133;
}
.prompt {
  margin-bottom: 12px;
}
.textarea {
  margin-top: 12px;
}
.char-count {
  margin-top: 4px;
  text-align: right;
  font-size: 12px;
  color: #909399;
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
