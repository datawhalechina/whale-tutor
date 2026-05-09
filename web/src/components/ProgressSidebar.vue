<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session';
import type { ArchiveNodeKind, ChapterPhase, MasteryLevel } from '@whale-tutor/tutor-types';

const emit = defineEmits<{
  'view-recap': [loId: string];
  'view-archive': [kind: ArchiveNodeKind, id: string | number];
  'open-history': [];
}>();

const sessionStore = useSessionStore();
const { progress } = storeToRefs(sessionStore);

async function onSwitchChapter(chapterId: string): Promise<void> {
  await sessionStore.switchChapter(chapterId);
}

const masteryEmoji: Record<MasteryLevel, string> = {
  untouched: '⚪',
  exposed: '🔵',
  practicing: '🟡',
  mastered: '🟢',
  applied: '🌟',
};
const masteryLabel: Record<MasteryLevel, string> = {
  untouched: '未触',
  exposed: '初识',
  practicing: '练习中',
  mastered: '已掌握',
  applied: '已应用',
};
const phaseLabel: Record<ChapterPhase, string> = {
  learning: '学习中',
  assessment: '章末测试',
  completed: '已完成 🎉',
};
const phaseTagType: Record<ChapterPhase, 'info' | 'warning' | 'success'> = {
  learning: 'info',
  assessment: 'warning',
  completed: 'success',
};
</script>

<template>
  <aside v-if="progress" class="progress-sidebar">
    <div class="header">
      <div class="course-name">{{ progress.course.name }}</div>
      <div class="chapter-name">{{ progress.chapter.name }}</div>
      <el-tag :type="phaseTagType[progress.chapter.phase]" size="small" class="phase-tag">
        {{ phaseLabel[progress.chapter.phase] }}
      </el-tag>
    </div>

    <!-- v0.2 多 chapter:本课程全部章节概览,当前章高亮;点其他章可切换 focus -->
    <div v-if="progress.allChapters.length > 1" class="section">
      <div class="section-title">课程全部章节</div>
      <div class="chapter-outline">
        <button
          v-for="(ch, idx) in progress.allChapters"
          :key="ch.id"
          :class="[
            'chapter-row',
            {
              current: ch.isCurrent,
              completed: ch.phase === 'completed',
              'not-started': !ch.started && !ch.isCurrent,
            },
          ]"
          :disabled="ch.isCurrent"
          :title="ch.isCurrent ? '当前章节' : `点击切换到「${ch.name}」`"
          @click="onSwitchChapter(ch.id)"
        >
          <span class="chapter-idx">{{ idx + 1 }}.</span>
          <span class="chapter-row-name">{{ ch.name }}</span>
          <el-tag
            :type="ch.started || ch.isCurrent ? phaseTagType[ch.phase] : 'info'"
            size="small"
            class="chapter-row-phase"
          >
            {{ ch.started || ch.isCurrent ? phaseLabel[ch.phase] : '未开始' }}
          </el-tag>
        </button>
      </div>
    </div>

    <div class="section">
      <div class="section-title">学习目标(当前章)</div>
      <div class="lo-list">
        <div
          v-for="lo in progress.los"
          :key="lo.id"
          :class="[
            'lo-node',
            {
              current: lo.isCurrent,
              locked: !lo.prerequisitesSatisfied,
              completed: lo.mandatoryAllCompleted,
            },
          ]"
        >
          <div class="lo-row">
            <span class="mastery-dot">{{ masteryEmoji[lo.masteryLevel] }}</span>
            <span class="lo-name">{{ lo.name }}</span>
          </div>
          <div class="lo-meta">
            <span class="meta-item">{{ masteryLabel[lo.masteryLevel] }}</span>
            <span class="meta-dot">·</span>
            <span class="meta-item"
              >必做 {{ lo.mandatoryCompletedCount }}/{{ lo.requiredInteractionCount }}</span
            >
          </div>
          <div v-if="!lo.prerequisitesSatisfied" class="locked-hint">🔒 需先完成前置 LO</div>
          <div v-else class="lo-actions">
            <button class="link-btn" @click="emit('view-recap', lo.id)">📖 重看讲解</button>
            <button
              v-if="lo.mandatoryCompletedCount > 0"
              class="link-btn"
              @click="emit('view-archive', 'lo', lo.id)"
            >
              📋 我的档案
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">章末测试</div>
      <div
        :class="[
          'assessment-node',
          {
            active: progress.chapter.phase === 'assessment',
            done: progress.chapter.phase === 'completed',
          },
        ]"
      >
        <div class="assessment-row">
          <span class="mastery-dot">📝</span>
          <span class="assessment-name">综合检验</span>
        </div>
        <div class="lo-meta">
          <span class="meta-item">
            {{ progress.chapter.assessmentCompletedCount }}/{{
              progress.chapter.assessmentRequiredCount
            }}
            已通过
          </span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">个性化记录</div>
      <button class="history-btn" @click="emit('open-history')">
        <span>💬</span>
        <span>历史问答</span>
      </button>
      <!-- v0.2 留位置:adaptive 题历史 -->
    </div>
  </aside>

  <aside v-else class="progress-sidebar empty">
    <div class="empty-text">加载中…</div>
  </aside>
</template>

<style scoped>
.progress-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: white;
  border-right: 1px solid #ebeef5;
  padding: 20px 16px;
  /* ★ box-sizing: 把 padding 算进 height:100vh,否则实际 = 100vh + 40px,底部被视口剪 */
  box-sizing: border-box;
  overflow-y: auto;
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.progress-sidebar.empty {
  align-items: center;
  justify-content: center;
}
.empty-text {
  color: #909399;
  font-size: 13px;
}
.header {
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}
.course-name {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}
.chapter-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}
.phase-tag {
  margin-top: 4px;
}
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}
.chapter-outline {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.chapter-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #606266;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.chapter-row:hover:not(:disabled) {
  background: #fafafa;
  border-color: #ebeef5;
}
.chapter-row.current {
  background: #ecf5ff;
  border-color: #b3d8ff;
  color: #303133;
  font-weight: 600;
  cursor: default;
}
.chapter-row.completed:not(.current) {
  color: #909399;
}
.chapter-row.not-started:not(.current) {
  color: #909399;
}
.chapter-row:disabled {
  cursor: default;
}
.chapter-idx {
  flex-shrink: 0;
  font-size: 12px;
  color: #909399;
}
.chapter-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chapter-row-phase {
  flex-shrink: 0;
}
.lo-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lo-node {
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: background 0.15s;
}
.lo-node:hover {
  background: #fafafa;
}
.lo-node.current {
  background: #ecf5ff;
  border-color: #b3d8ff;
}
.lo-node.locked {
  opacity: 0.6;
}
.lo-node.completed .lo-name {
  color: #67c23a;
}
.lo-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.mastery-dot {
  flex-shrink: 0;
  font-size: 12px;
}
.lo-name {
  font-weight: 500;
  color: #303133;
}
.lo-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 22px;
}
.meta-dot {
  opacity: 0.5;
}
.locked-hint {
  margin-top: 6px;
  padding-left: 22px;
  font-size: 11px;
  color: #909399;
}
.lo-actions {
  margin-top: 6px;
  padding-left: 18px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.link-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
  color: #409eff;
  border-radius: 3px;
}
.link-btn:hover {
  background: #ecf5ff;
}
.assessment-node {
  padding: 10px 12px;
  border-radius: 6px;
  background: #fafafa;
}
.assessment-node.active {
  background: #fdf6ec;
  border: 1px solid #faecd8;
}
.assessment-node.done {
  background: #f0f9eb;
  border: 1px solid #c2e7b0;
}
.assessment-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.assessment-name {
  font-weight: 500;
}
.history-btn {
  width: 100%;
  background: transparent;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s;
}
.history-btn:hover {
  border-color: #409eff;
  color: #409eff;
  background: #ecf5ff;
}
</style>
