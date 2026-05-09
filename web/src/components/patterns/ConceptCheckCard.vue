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
const { lastEvaluation, showFeedback, pendingNextInteraction, currentDecision, loading } =
  storeToRefs(sessionStore);

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

const isLastInChapter = computed(() => showFeedback.value && pendingNextInteraction.value === null);

// 答错(任何类型) — 反馈区显示 warning 色,按钮也变 warning。
//   v0:复发同 RI;v0.2:server 改成发 adaptive 换说法题 / review_lo 兜底
// 保留同名,语义改成"上一道题答错"。
const isRetrySameRi = computed(() => showFeedback.value && lastEvaluation.value?.correct === false);
// v0.2 细分按钮文案:
const isAdaptiveRetry = computed(
  () => isRetrySameRi.value && pendingNextInteraction.value?.source === 'adaptive',
);
const isReviewLoNext = computed(
  () => showFeedback.value && currentDecision.value?.primary.type === 'review_lo',
);

const continueButtonLabel = computed(() => {
  if (isReviewLoNext.value) return '去看讲解';
  if (isAdaptiveRetry.value) return '换种说法再试一道';
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
        <el-button :type="isRetrySameRi ? 'warning' : 'primary'" @click="continueToNext">
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
