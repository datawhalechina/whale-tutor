<script setup lang="ts">
import { computed } from 'vue';
import type { QaMessage } from '@whale-tutor/tutor-types';
import { renderMarkdown } from '@/utils/markdown';

const props = defineProps<{
  message: QaMessage;
}>();

const html = computed(() => renderMarkdown(props.message.contentMd));
const isLearner = computed(() => props.message.role === 'learner');
</script>

<template>
  <div :class="['qa-message', isLearner ? 'learner' : 'assistant']">
    <div class="role">{{ isLearner ? '你' : '🐳 鲸鱼老师' }}</div>
    <div class="markdown-body content" v-html="html"></div>
  </div>
</template>

<style scoped>
.qa-message {
  margin-bottom: 16px;
}
.qa-message.learner {
  text-align: right;
}
.role {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}
.content {
  display: inline-block;
  text-align: left;
  max-width: 92%;
  padding: 10px 14px;
  border-radius: 8px;
  background: #f5f7fa;
  font-size: 14px;
  line-height: 1.6;
}
.qa-message.learner .content {
  background: #ecf5ff;
  border: 1px solid #d9ecff;
}
.qa-message.assistant .content {
  background: #fafafa;
  border: 1px solid #ebeef5;
}
</style>
