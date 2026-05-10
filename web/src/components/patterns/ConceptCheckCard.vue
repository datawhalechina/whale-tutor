<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { ConceptCheckPromptForLearner, InteractionInstance } from '@whale-tutor/tutor-types';
import { useSessionStore } from '@/stores/session';
import { renderMarkdown } from '@/utils/markdown';
import FeedbackArea from '@/components/FeedbackArea.vue';

const props = defineProps<{
  interaction: InteractionInstance<ConceptCheckPromptForLearner>;
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

// el-radio-group 的 v-model 类型不接 null,所以用 undefined 表示"未选"
const selected = ref<number | undefined>(undefined);

// 切换到新 interaction 时清空选项(答错重做同 ri 也是新 interaction id)
watch(
  () => props.interaction.id,
  () => {
    selected.value = undefined;
  },
);

const explanationHtml = computed(() => renderMarkdown(props.interaction.prompt.explanationMd));
const stemHtml = computed(() => renderMarkdown(props.interaction.prompt.question.stem));

// 只在 fetch 真完成 + pending 确认为 null 时才算章末 — hasFetchedNext 守门
const isLastInChapter = computed(
  () => showFeedback.value && hasFetchedNext.value && pendingNextInteraction.value === null,
);

// 答错 — 反馈区显示 warning 色,按钮也变 warning
const isRetrySameRi = computed(() => showFeedback.value && lastEvaluation.value?.correct === false);
// 连错 ≥ 3 次:server 在下次 fetch 时会返 review_lo decision。
// 这里用 server 写回的 lastLoState.consecutiveWrong 来判定,前端立即显示提示 banner
// + "去看讲解"按钮(点了 → continueToNext → fetch → review_lo overlay)
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

async function submit(): Promise<void> {
  if (selected.value === undefined) return;
  await sessionStore.submit({
    interactionId: props.interaction.id,
    patternId: 'concept_check',
    response: { selectedIndex: selected.value },
  });
}

function continueToNext(): void {
  void sessionStore.continueToNext();
}

// 答错后选择"再试一次"(同题重答 — 不切到 AI 换说法题)。
// 详见 store.clearFeedback 注释:UI 重置,server 历史里那次错的 response 仍保留。
function retryAnswer(): void {
  selected.value = undefined;
  sessionStore.clearFeedback();
}
</script>

<template>
  <el-card class="concept-check-card" shadow="never">
    <!-- 题前引子 -->
    <div class="markdown-body explanation" v-html="explanationHtml"></div>
    <el-divider />

    <!-- 题干 -->
    <h3 class="section-title">问题</h3>
    <div class="markdown-body stem" v-html="stemHtml"></div>

    <!-- 选项 -->
    <el-radio-group v-model="selected" :disabled="showFeedback" class="options">
      <el-radio
        v-for="(opt, idx) in interaction.prompt.question.options"
        :key="idx"
        :value="idx"
        class="option"
      >
        <span class="option-label">{{ String.fromCharCode(65 + idx) }}.</span>
        <span class="option-text">{{ opt }}</span>
      </el-radio>
    </el-radio-group>

    <!-- 反馈区 -->
    <transition name="fade">
      <FeedbackArea
        v-if="showFeedback && lastEvaluation"
        :evaluation="lastEvaluation"
        :is-retry-same-ri="isRetrySameRi"
      />
    </transition>

    <!-- 连错 ≥ 3 次的"建议看讲解"提示 -->
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

    <!-- 操作按钮 -->
    <div class="actions">
      <template v-if="!showFeedback">
        <el-button
          type="primary"
          :disabled="selected === undefined"
          :loading="loading"
          @click="submit"
        >
          提交答案
        </el-button>
      </template>
      <template v-else>
        <!-- 答错路径:再试一次 + (cw≥3 时)去看讲解 -->
        <el-button v-if="isRetrySameRi" plain @click="retryAnswer"> 🔁 再试一次 </el-button>
        <el-button
          v-if="shouldSuggestReview && !isReviewLoNext"
          type="warning"
          :loading="loadingNext"
          @click="continueToNext"
        >
          📖 去看讲解
        </el-button>
        <!-- 答对路径 / review_lo 路径:正常的 advance 按钮 -->
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
.concept-check-card {
  border: 1px solid #ebeef5;
}
.section-title {
  margin: 16px 0 12px;
  font-size: 16px;
  color: #303133;
}
.options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}
.option {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin: 0;
  width: 100%;
  /* box-sizing: 把 padding + border 算进 width:100%,否则会撑出父容器右侧 */
  box-sizing: border-box;
  height: auto;
  white-space: normal;
  line-height: 1.5;
  /* 防止超长 inline code / 不可断的标识符撑宽 */
  min-width: 0;
}
.option :deep(.el-radio__label) {
  /* el-radio 内部 label 默认 white-space:nowrap,长选项文字会一行不换。
     option-text 已经有 white-space:normal,但要让 el-radio 自己也允许换行 */
  white-space: normal;
  word-break: break-word;
  line-height: 1.5;
}
.option:hover {
  border-color: #409eff;
  background: #f5faff;
}
.option-label {
  font-weight: 600;
  margin-right: 8px;
  color: #606266;
}
.option-text {
  flex: 1;
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
