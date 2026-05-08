<script setup lang="ts">
// StuckProtocol — 学习者卡题时的梯度提示。
//
// UI 流:
//   初始:   按钮 "💡 求提示"
//   点一次: 调 server,弹出 level 1 提示;按钮变 "💡 再来一级"
//   后续:   累加到 totalLevels 时禁用按钮(显示 "已是最详细提示")
//   切到下一题:state 全部清空(InteractionStage 一并切 key)
//
// 服务端在该 RI 没有 hints 时走 AI 兜底,前端无感知;只通过 totalLevels 判断按钮禁用时机。
// totalLevels=0 表示该 RI 完全没法生成 hint(adaptive 题等),按钮不显示,引导用 QA。

import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ElButton, ElMessage } from 'element-plus';
import { useSessionStore } from '@/stores/session';
import { renderMarkdown } from '@/utils/markdown';
import { requestHint } from '@/api/session';
import type { HintLevel } from '@whale-tutor/tutor-types';

defineProps<{
  // 'lo' = LO 内题目可求助;'assessment' = 章末综合测试,UI 直接不渲染按钮
  kind: 'lo' | 'assessment';
}>();

const sessionStore = useSessionStore();
const { sessionId, currentInteraction, showFeedback } = storeToRefs(sessionStore);

// 已经显示出来的 hint 文案(按 level 顺序)
const shownHints = ref<string[]>([]);
// 服务端首次响应才知道总级数;0 = 未知 / 该 RI 无 hint
const totalLevels = ref(0);
const loading = ref(false);
const noHintAvailable = ref(false);

// 切到新 interaction 立即 reset
watch(
  () => currentInteraction.value?.id,
  () => {
    shownHints.value = [];
    totalLevels.value = 0;
    noHintAvailable.value = false;
  },
);

const usedLevel = computed(() => shownHints.value.length);
const canRequestMore = computed(
  () =>
    !loading.value &&
    !noHintAvailable.value &&
    !showFeedback.value &&
    (totalLevels.value === 0 || usedLevel.value < totalLevels.value),
);

const buttonLabel = computed(() => {
  if (loading.value) return '正在生成…';
  if (noHintAvailable.value) return '本题无提示';
  if (usedLevel.value === 0) return '求提示';
  if (totalLevels.value > 0 && usedLevel.value >= totalLevels.value)
    return '已是最详细提示';
  return '再来一级';
});

async function fetchNextHint(): Promise<void> {
  if (!currentInteraction.value || !sessionId.value || !canRequestMore.value)
    return;
  loading.value = true;
  try {
    const next = (usedLevel.value + 1) as HintLevel;
    const resp = await requestHint(sessionId.value, {
      interactionId: currentInteraction.value.id,
      targetLevel: next,
    });
    if (resp.totalLevels === 0) {
      noHintAvailable.value = true;
      ElMessage.info('本题无静态提示。如卡住可右上角发起提问。');
      return;
    }
    totalLevels.value = resp.totalLevels;
    shownHints.value = [...shownHints.value, resp.hintMd];
    sessionStore.currentHintLevel = next;
  } catch (e) {
    ElMessage.error(`获取提示失败:${(e as Error).message}`);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div v-if="kind === 'lo'" class="hint-bar">
    <!-- 已展示的提示堆叠在按钮上方,level 1 在最上 -->
    <transition-group name="fade-stack" tag="div" class="hints-stack">
      <div
        v-for="(hint, idx) in shownHints"
        :key="idx"
        class="hint-block"
      >
        <div class="hint-header">
          <span class="hint-bulb">💡</span>
          <span class="hint-level-label">提示 {{ idx + 1 }}</span>
          <span
            v-if="idx + 1 === totalLevels && totalLevels > 0"
            class="hint-final-tag"
          >最详细</span>
        </div>
        <div class="markdown-body hint-content" v-html="renderMarkdown(hint)"></div>
      </div>
    </transition-group>

    <div class="actions">
      <el-button
        :type="usedLevel === 0 ? 'default' : 'primary'"
        :plain="usedLevel > 0"
        :disabled="!canRequestMore"
        :loading="loading"
        size="small"
        @click="fetchNextHint"
      >
        <span v-if="!loading" class="btn-bulb">💡</span>
        <span class="btn-text">{{ buttonLabel }}</span>
      </el-button>
      <span v-if="totalLevels > 0" class="level-progress">
        {{ usedLevel }} / {{ totalLevels }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.hint-bar {
  margin-bottom: 16px;
}
.hints-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.hint-block {
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 6px;
  padding: 12px 16px;
}
.hint-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #ad8b00;
  margin-bottom: 6px;
  font-size: 13px;
}
.hint-final-tag {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: #d48806;
  background: #fff1b8;
  padding: 1px 8px;
  border-radius: 999px;
}
.hint-content {
  color: #595959;
  font-size: 14px;
  line-height: 1.6;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-text {
  margin-left: 4px;
}
.level-progress {
  font-size: 12px;
  color: #909399;
}

.fade-stack-enter-active,
.fade-stack-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-stack-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.fade-stack-leave-to {
  opacity: 0;
}
</style>
