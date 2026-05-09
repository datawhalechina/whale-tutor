<script setup lang="ts">
import { computed } from 'vue';
import type { EvaluationResult } from '@whale-tutor/tutor-types';
import { renderMarkdown } from '@/utils/markdown';

const props = defineProps<{
  evaluation: EvaluationResult;
  // 答错且 server 让重做同一道题时,显示"再看一次"提示
  isRetrySameRi?: boolean;
}>();

const feedbackHtml = computed(() => renderMarkdown(props.evaluation.feedbackMd));

const evaluatorKindLabel: Record<string, string> = {
  deterministic: '系统判定',
  ai: 'AI 评估',
  hybrid: '系统判定 + AI 评估',
};
</script>

<template>
  <div class="feedback-area">
    <el-alert
      :type="evaluation.correct ? 'success' : 'error'"
      :title="evaluation.correct ? '答对了' : '还不对,再来一次'"
      :closable="false"
      show-icon
    >
      <template #default>
        <div class="feedback-meta">
          <span>{{
            evaluatorKindLabel[evaluation.evaluatorKind] || evaluation.evaluatorKind
          }}</span>
          <span class="dot">·</span>
          <span>置信度 {{ evaluation.confidence.toFixed(2) }}</span>
        </div>
        <div v-if="isRetrySameRi" class="retry-hint">先看下方解析,理解后再做一次。</div>
      </template>
    </el-alert>
    <div class="markdown-body feedback-md" v-html="feedbackHtml"></div>
  </div>
</template>

<style scoped>
.feedback-area {
  margin-top: 24px;
}
.feedback-meta {
  font-size: 12px;
  color: #909399;
}
.dot {
  margin: 0 6px;
}
.retry-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}
.feedback-md {
  margin-top: 12px;
  padding: 16px;
  background: #fafafa;
  border-radius: 6px;
}
</style>
