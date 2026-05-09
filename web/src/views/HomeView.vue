<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElCard, ElButton, ElAlert, ElTag, ElEmpty } from 'element-plus';
import type { CourseSummary } from '@whale-tutor/tutor-types';
import * as knowledgeApi from '@/api/knowledge';
import { useSessionStore } from '@/stores/session';
import { usePyodideStore } from '@/stores/pyodide';

const router = useRouter();
const sessionStore = useSessionStore();
const pyodideStore = usePyodideStore();

// v0:demo learner id=1(无认证、无诊断)
const DEMO_LEARNER_ID = 1;

const courses = ref<CourseSummary[]>([]);
const loading = ref(false);
const startingCourseId = ref<string | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  // 后台预热 Pyodide(~6MB),Python 课才用得到,但提前热一份开销不大
  void pyodideStore.preload();

  loading.value = true;
  try {
    courses.value = await knowledgeApi.listCourses();
  } catch (e) {
    error.value = `获取课程列表失败:${(e as Error).message}`;
  } finally {
    loading.value = false;
  }
});

async function startCourse(courseId: string): Promise<void> {
  startingCourseId.value = courseId;
  error.value = null;
  try {
    await sessionStore.start(DEMO_LEARNER_ID, courseId);
    router.push({ name: 'learn' });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    startingCourseId.value = null;
  }
}
</script>

<template>
  <el-container class="home">
    <el-main>
      <div class="hero">
        <h1>Whale Tutor</h1>
        <p class="subtitle">AI 驱动的交互式学习</p>
      </div>

      <div class="courses-section">
        <h2 class="section-title">选一门课开始</h2>

        <div v-if="loading" v-loading="true" class="loading-area"></div>

        <el-empty
          v-else-if="courses.length === 0"
          description="还没有可用的课程。check 一下 courses_dir 配置。"
        />

        <div v-else class="course-grid">
          <el-card v-for="course in courses" :key="course.id" class="course-card" shadow="hover">
            <div class="course-header">
              <h3 class="course-name">{{ course.name }}</h3>
              <div class="course-meta">
                <el-tag size="small" type="info"> {{ course.chapterCount }} 章 </el-tag>
                <el-tag size="small"> {{ course.loCount }} 个学习目标 </el-tag>
              </div>
            </div>
            <p class="course-desc">{{ course.description }}</p>
            <div class="course-actions">
              <el-button
                type="primary"
                :loading="startingCourseId === course.id"
                :disabled="startingCourseId !== null && startingCourseId !== course.id"
                @click="startCourse(course.id)"
              >
                开始学习
              </el-button>
            </div>
          </el-card>
        </div>

        <el-alert
          v-if="error"
          :title="error"
          type="error"
          show-icon
          :closable="false"
          style="margin-top: 16px"
        />
      </div>
    </el-main>
  </el-container>
</template>

<style scoped>
.home {
  height: 100vh;
  overflow-y: auto;
}
.hero {
  max-width: 720px;
  margin: 60px auto 24px;
  text-align: center;
}
.hero h1 {
  font-size: 36px;
  margin: 0;
}
.subtitle {
  color: #606266;
  font-size: 18px;
  margin: 12px 0;
}
.courses-section {
  max-width: 960px;
  margin: 32px auto 64px;
  padding: 0 24px;
}
.section-title {
  text-align: center;
  font-size: 20px;
  color: #303133;
  margin-bottom: 24px;
}
.loading-area {
  min-height: 200px;
}
.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.course-card {
  border: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
}
.course-header {
  margin-bottom: 12px;
}
.course-name {
  margin: 0 0 8px;
  color: #303133;
}
.course-meta {
  display: flex;
  gap: 6px;
}
.course-desc {
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 16px;
  /* 限 4 行,长描述 ellipsis */
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.course-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
