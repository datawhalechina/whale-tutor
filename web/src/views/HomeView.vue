<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionStore } from '@/stores/session';
import { usePyodideStore } from '@/stores/pyodide';

const router = useRouter();
const sessionStore = useSessionStore();
const pyodideStore = usePyodideStore();
const starting = ref(false);
const error = ref<string | null>(null);

// v0:demo learner id=1,course=python-basics(无认证、无诊断)
const DEMO_LEARNER_ID = 1;
const DEMO_COURSE_ID = 'python-basics';

// 进入 Home 时后台预热 Pyodide(~6MB),避免 LearnView 第一次跑 code_sandbox 时等
onMounted(() => {
  void pyodideStore.preload();
});

async function startLearning(): Promise<void> {
  starting.value = true;
  error.value = null;
  try {
    await sessionStore.start(DEMO_LEARNER_ID, DEMO_COURSE_ID);
    router.push({ name: 'learn' });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <el-container class="home">
    <el-main>
      <div class="hero">
        <h1>Whale Tutor</h1>
        <p class="subtitle">AI 驱动的 Python 交互式学习</p>
        <p class="course-label">当前课程:Python 基础 ·「列表与迭代」一章</p>
        <el-button
          type="primary"
          size="large"
          :loading="starting"
          @click="startLearning"
        >
          开始学习
        </el-button>
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
.home { min-height: 100vh; }
.hero {
  max-width: 640px;
  margin: 80px auto;
  text-align: center;
}
.hero h1 {
  font-size: 36px;
  margin: 0;
}
.subtitle {
  color: #606266;
  font-size: 18px;
  margin: 12px 0 8px;
}
.course-label {
  color: #909399;
  margin: 8px 0 32px;
}
</style>
