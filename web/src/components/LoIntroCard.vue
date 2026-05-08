<script setup lang="ts">
import { computed } from 'vue';
import type { LearningObjective } from '@whale-tutor/tutor-types';
import { renderMarkdown } from '@/utils/markdown';

const props = withDefaults(
  defineProps<{
    loMeta: LearningObjective;
    // 'first-time': 进入新 LO 时的首次介绍页;按钮"开始练习" emit start
    // 'recap':     从侧边栏点"重看讲解"调起的回看模式;按钮"返回" emit close
    mode?: 'first-time' | 'recap';
  }>(),
  { mode: 'first-time' },
);

defineEmits<{
  start: [];
  close: [];
}>();

const isRecap = computed(() => props.mode === 'recap');

const explanationHtml = computed(() =>
  renderMarkdown(props.loMeta.coreExplanationMd),
);

const difficultyLabel: Record<string, string> = {
  beginner: '入门',
  intermediate: '中级',
  advanced: '进阶',
};
</script>

<template>
  <el-card class="lo-intro-card" shadow="never">
    <div class="header">
      <div class="lo-name">{{ loMeta.name }}</div>
      <div class="lo-desc">{{ loMeta.description }}</div>
      <div class="meta">
        <el-tag type="info" size="small">
          {{ difficultyLabel[loMeta.difficultyBand] || loMeta.difficultyBand }}
        </el-tag>
        <el-tag size="small">≈ {{ loMeta.estimatedDurationMin }} 分钟</el-tag>
        <el-tag type="warning" size="small">
          {{ loMeta.requiredInteractionCount }} 道必做题
        </el-tag>
      </div>
    </div>

    <el-divider />

    <div class="markdown-body explanation" v-html="explanationHtml"></div>

    <el-divider />

    <div class="mastery-criteria">
      <span class="criteria-label">本节通过标准</span>
      <span class="criteria-text">{{ loMeta.masteryCriteria }}</span>
    </div>

    <div class="actions">
      <el-button v-if="isRecap" size="large" @click="$emit('close')">
        返回
      </el-button>
      <el-button v-else type="primary" size="large" @click="$emit('start')">
        开始练习
      </el-button>
    </div>
  </el-card>
</template>

<style scoped>
.lo-intro-card {
  border: 1px solid #ebeef5;
}
.header {
  text-align: center;
  padding: 8px 0 16px;
}
.lo-name {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}
.lo-desc {
  color: #606266;
  margin-bottom: 16px;
}
.meta {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.explanation {
  padding: 8px 0;
}
.mastery-criteria {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 6px;
  font-size: 14px;
}
.criteria-label {
  flex-shrink: 0;
  font-weight: 600;
  color: #909399;
}
.criteria-text {
  color: #606266;
  line-height: 1.6;
}
.actions {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}
</style>
