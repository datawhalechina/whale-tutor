<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import type { ArchiveNodeKind, LearningObjective } from '@whale-tutor/tutor-types';
import { useSessionStore } from '@/stores/session';
import { useQaStore } from '@/stores/qa';
import ArchiveViewer from '@/components/ArchiveViewer.vue';
import InteractionStage from '@/components/InteractionStage.vue';
import LoIntroCard from '@/components/LoIntroCard.vue';
import ProgressSidebar from '@/components/ProgressSidebar.vue';
import QaPanel from '@/components/qa/QaPanel.vue';

const router = useRouter();
const sessionStore = useSessionStore();
const qaStore = useQaStore();
const {
  sessionId,
  learnerId,
  currentInteraction,
  currentDecision,
  lastLoState,
  loading,
  showLoIntro,
  loMetaCache,
  reviewLoActive,
  reviewLoReason,
} = storeToRefs(sessionStore);

const currentLoMeta = computed<LearningObjective | null>(() => {
  if (!currentInteraction.value) return null;
  return loMetaCache.value[currentInteraction.value.loId] ?? null;
});

// review_lo 模式下的 LO meta — 从 decision.primary.loId 取。
// 没缓存就按需 fetch(理论上 currentInteraction 之前已经触发缓存,这里是兜底)
const reviewLoMeta = computed<LearningObjective | null>(() => {
  const action = currentDecision.value?.primary;
  if (action?.type !== 'review_lo') return null;
  const cached = loMetaCache.value[action.loId];
  if (!cached) {
    void sessionStore.ensureLoMeta(action.loId);
    return null;
  }
  return cached;
});

async function onAcknowledgeReviewLo(): Promise<void> {
  await sessionStore.acknowledgeReviewLo();
}

// === Recap overlay state ===
const recapVisible = ref(false);
const recapLoMeta = ref<LearningObjective | null>(null);

// === Archive viewer state ===
const archiveVisible = ref(false);
const archiveKind = ref<ArchiveNodeKind | null>(null);
const archiveId = ref<string | number | null>(null);

onMounted(() => {
  if (!sessionId.value) {
    router.replace({ name: 'home' });
    return;
  }
  qaStore.reset();
});

const masteryLabel: Record<string, string> = {
  untouched: '未触',
  exposed: '初识',
  practicing: '练习中',
  mastered: '已掌握',
  applied: '已应用',
};

const finalActionLabel = computed(() => {
  const action = currentDecision.value?.primary;
  if (!action) return null;
  switch (action.type) {
    case 'chapter_complete':
      return '🎉 章节完成';
    case 'request_break':
      return `建议休息:${action.reason}`;
    default:
      return null;
  }
});

function backHome(): void {
  qaStore.reset();
  void sessionStore.end();
  router.push({ name: 'home' });
}

function openQa(): void {
  qaStore.setTab('current');
  qaStore.openPanel();
}

// === Sidebar event handlers ===
async function onViewRecap(loId: string): Promise<void> {
  const meta = await sessionStore.ensureLoMeta(loId);
  recapLoMeta.value = meta;
  recapVisible.value = true;
}

function onViewArchive(kind: ArchiveNodeKind, id: string | number): void {
  archiveKind.value = kind;
  archiveId.value = id;
  archiveVisible.value = true;
}

async function onOpenHistory(): Promise<void> {
  if (!sessionId.value) return;
  qaStore.setTab('history');
  qaStore.openPanel();
  await qaStore.loadHistory(sessionId.value);
}
</script>

<template>
  <el-container class="learn-view" direction="horizontal">
    <ProgressSidebar
      @view-recap="onViewRecap"
      @view-archive="onViewArchive"
      @open-history="onOpenHistory"
    />

    <el-container direction="vertical" class="main-container">
      <el-header class="learn-header">
        <div class="header-left">
          <h2>学习中</h2>
          <div v-if="lastLoState" class="lo-state">
            <el-tag type="info" size="small">
              {{ lastLoState.loId }}
            </el-tag>
            <el-tag
              :type="lastLoState.masteryLevel === 'mastered' ? 'success' : 'primary'"
              size="small"
            >
              {{ masteryLabel[lastLoState.masteryLevel] || lastLoState.masteryLevel }}
            </el-tag>
            <el-tag v-if="!lastLoState.mandatoryAllCompleted" type="warning" size="small">
              必做 {{ lastLoState.mandatoryCompletedIds.length }} 题已完成
            </el-tag>
            <el-tag v-else type="success" size="small">必做全部完成</el-tag>
          </div>
        </div>
        <div class="header-right">
          <el-button v-if="currentInteraction" plain @click="openQa"> 💬 问问题 </el-button>
          <el-button @click="backHome">返回首页</el-button>
        </div>
      </el-header>

      <el-main v-loading="loading" class="learn-main" element-loading-text="加载中…">
        <div
          v-if="loading && !currentInteraction && !reviewLoActive"
          v-loading="true"
          style="min-height: 200px"
        ></div>

        <!-- v0.2:review_lo 兜底,优先级最高(其他视图都隐藏) -->
        <div v-if="reviewLoActive" class="review-lo-wrapper">
          <el-alert type="warning" :closable="false" show-icon class="review-lo-banner">
            <template #title>
              <strong>先回到讲解再来</strong>
            </template>
            <span v-if="reviewLoReason">{{ reviewLoReason }}</span>
          </el-alert>
          <LoIntroCard
            v-if="reviewLoMeta"
            :lo-meta="reviewLoMeta"
            mode="review-lo"
            @close="onAcknowledgeReviewLo"
          />
          <div v-else v-loading="true" style="min-height: 200px"></div>
        </div>

        <LoIntroCard
          v-else-if="currentInteraction && showLoIntro && currentLoMeta"
          :lo-meta="currentLoMeta"
          mode="first-time"
          @start="sessionStore.acknowledgeCurrentLo()"
        />
        <InteractionStage v-else-if="currentInteraction" :interaction="currentInteraction" />

        <div v-else-if="finalActionLabel" class="final-state">
          <el-result :title="finalActionLabel" icon="success">
            <template #extra>
              <el-button type="primary" @click="backHome">返回首页</el-button>
            </template>
          </el-result>
        </div>

        <el-empty v-else-if="!loading" description="尚未开始学习" />
      </el-main>
    </el-container>

    <!-- Recap overlay:从 Sidebar 点"重看讲解"时打开 -->
    <el-dialog
      v-model="recapVisible"
      :title="recapLoMeta?.name || '重看讲解'"
      width="760px"
      align-center
      destroy-on-close
    >
      <LoIntroCard
        v-if="recapLoMeta"
        :lo-meta="recapLoMeta"
        mode="recap"
        @close="recapVisible = false"
      />
    </el-dialog>

    <!-- Archive viewer modal -->
    <ArchiveViewer
      :id="archiveId"
      :visible="archiveVisible"
      :kind="archiveKind"
      :learner-id="learnerId"
      @update:visible="archiveVisible = $event"
    />

    <QaPanel @view-archive="onViewArchive" />
  </el-container>
</template>

<style scoped>
.learn-view {
  /* 严格 = 100vh,el-main 内部 overflow:auto 处理内容滚动,避免触发浏览器外层 scrollbar */
  height: 100vh;
  background: #fafafa;
}
.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.learn-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #ebeef5;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.header-left h2 {
  margin: 0;
}
.header-right {
  display: flex;
  gap: 8px;
}
.review-lo-wrapper {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.review-lo-banner {
  /* 让 banner 横铺,el-alert 默认 inline-block 偶尔会撑得不齐 */
  width: 100%;
}
.lo-state {
  display: flex;
  gap: 6px;
}
.learn-main {
  padding: 24px;
}
.final-state {
  max-width: 640px;
  margin: 80px auto;
}
</style>
