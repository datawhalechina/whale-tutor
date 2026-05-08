<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type {
  CodeRunOutcome,
  CodeSandboxPromptForLearner,
  InteractionInstance,
} from '@whale-tutor/tutor-types';
import { useSessionStore } from '@/stores/session';
import { usePyodideStore } from '@/stores/pyodide';
import { renderMarkdown } from '@/utils/markdown';
import FeedbackArea from '@/components/FeedbackArea.vue';

const props = defineProps<{
  interaction: InteractionInstance<CodeSandboxPromptForLearner>;
}>();

const sessionStore = useSessionStore();
const { lastEvaluation, showFeedback, pendingNextInteraction, loading } =
  storeToRefs(sessionStore);
const pyodideStore = usePyodideStore();
const { status: pyodideStatus, errorMessage: pyodideError } =
  storeToRefs(pyodideStore);

// 学习者代码,初始 = starterCode
const code = ref('');
const runResults = ref<CodeRunOutcome[]>([]);
const running = ref(false);

watch(
  () => props.interaction.id,
  () => {
    code.value = props.interaction.prompt.starterCode;
    runResults.value = [];
  },
  { immediate: true },
);

const promptHtml = computed(() =>
  renderMarkdown(props.interaction.prompt.promptMd),
);

const totalTests = computed(() => props.interaction.prompt.testCases.length);
const passedCount = computed(
  () => runResults.value.filter((r) => r.passed).length,
);
const allPassed = computed(
  () =>
    runResults.value.length === totalTests.value &&
    runResults.value.every((r) => r.passed),
);

const isLastInChapter = computed(
  () => showFeedback.value && pendingNextInteraction.value === null,
);
const isRetrySameRi = computed(
  () => showFeedback.value && lastEvaluation.value?.correct === false,
);
const continueButtonLabel = computed(() => {
  if (isRetrySameRi.value) return '再试一次';
  if (isLastInChapter.value) return '查看结果';
  return '下一题';
});

async function runTests(): Promise<void> {
  if (pyodideStatus.value !== 'ready') {
    await pyodideStore.preload();
    if (pyodideStatus.value !== 'ready') return;
  }
  running.value = true;
  runResults.value = [];
  try {
    const collected: CodeRunOutcome[] = [];
    for (let i = 0; i < props.interaction.prompt.testCases.length; i++) {
      const tc = props.interaction.prompt.testCases[i];
      const out = await pyodideStore.runCode(code.value, tc.setupCode);
      const actualOutput = out.stdout.trim();
      const expected = tc.expectedOutput.trim();
      const passed = !out.error && actualOutput === expected;
      const result: CodeRunOutcome = {
        testIndex: i,
        passed,
        actualOutput,
      };
      if (out.error) result.error = out.error;
      else if (out.stderr) result.error = out.stderr;
      collected.push(result);
    }
    runResults.value = collected;
  } finally {
    running.value = false;
  }
}

async function submit(): Promise<void> {
  if (!allPassed.value) return;
  await sessionStore.submit({
    interactionId: props.interaction.id,
    patternId: 'code_sandbox',
    response: { code: code.value, runResults: runResults.value },
  });
}

function continueToNext(): void {
  void sessionStore.continueToNext();
}
</script>

<template>
  <el-card class="code-sandbox-card" shadow="never">
    <h3 class="section-title">编程题</h3>
    <div class="markdown-body prompt" v-html="promptHtml"></div>

    <!-- Pyodide 状态提示 -->
    <el-alert
      v-if="pyodideStatus === 'loading'"
      type="info"
      :closable="false"
      show-icon
      title="Python 运行环境加载中"
      description="首次加载约 ~6MB / 5-10 秒,之后缓存复用"
      class="pyodide-status"
    />
    <el-alert
      v-else-if="pyodideStatus === 'error'"
      type="error"
      :closable="false"
      show-icon
      :title="`Python 运行环境加载失败: ${pyodideError}`"
      class="pyodide-status"
    />

    <!-- 代码编辑器(简化版,v0 用 textarea + 等宽字体;v0.2 可换 codemirror) -->
    <div class="code-editor-wrap">
      <div class="editor-label">你的代码</div>
      <el-input
        v-model="code"
        type="textarea"
        :rows="10"
        :disabled="showFeedback"
        class="code-editor"
        spellcheck="false"
        :input-style="{
          fontFamily: 'JetBrains Mono, Consolas, monospace',
          fontSize: '13px',
          lineHeight: '1.6',
        }"
      />
    </div>

    <!-- 运行测试 -->
    <div class="run-area">
      <el-button
        type="primary"
        plain
        :loading="running || pyodideStatus === 'loading'"
        :disabled="showFeedback || pyodideStatus === 'error'"
        @click="runTests"
      >
        {{ pyodideStatus === 'loading' ? '加载 Python 中…' : '运行测试' }}
      </el-button>
      <span
        v-if="runResults.length > 0"
        class="run-summary"
        :class="{ 'all-passed': allPassed }"
      >
        {{ passedCount }} / {{ totalTests }} 通过
      </span>
    </div>

    <!-- 测试结果 -->
    <div v-if="runResults.length > 0" class="test-results">
      <div
        v-for="(r, i) in runResults"
        :key="i"
        :class="['test-result', r.passed ? 'passed' : 'failed']"
      >
        <div class="test-header">
          <span class="test-icon">{{ r.passed ? '✓' : '✗' }}</span>
          <span class="test-name">
            测试 {{ i + 1 }}<template v-if="interaction.prompt.testCases[i]?.description"> — {{ interaction.prompt.testCases[i].description }}</template>
          </span>
        </div>
        <div v-if="!r.passed" class="test-detail">
          <div class="detail-row">
            <span class="detail-label">输入</span>
            <code class="detail-code">{{ interaction.prompt.testCases[i]?.setupCode }}</code>
          </div>
          <div class="detail-row">
            <span class="detail-label">期望</span>
            <code class="detail-code">{{ interaction.prompt.testCases[i]?.expectedOutput }}</code>
          </div>
          <div class="detail-row">
            <span class="detail-label">实际</span>
            <code class="detail-code">{{ r.actualOutput || '(空)' }}</code>
          </div>
          <pre v-if="r.error" class="test-error">{{ r.error }}</pre>
        </div>
      </div>
    </div>

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
          type="success"
          :disabled="!allPassed"
          :loading="loading"
          @click="submit"
        >
          {{ allPassed ? '提交答案' : '通过全部测试再提交' }}
        </el-button>
      </template>
      <template v-else>
        <el-button
          :type="isRetrySameRi ? 'warning' : 'primary'"
          @click="continueToNext"
        >
          {{ continueButtonLabel }}
        </el-button>
      </template>
    </div>
  </el-card>
</template>

<style scoped>
.code-sandbox-card {
  border: 1px solid #ebeef5;
}
.section-title {
  margin: 0 0 12px;
  font-size: 16px;
  color: #303133;
}
.prompt {
  margin-bottom: 16px;
}
.pyodide-status {
  margin: 12px 0;
}
.code-editor-wrap {
  margin-top: 16px;
}
.editor-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 6px;
}
.code-editor :deep(.el-textarea__inner) {
  background: #fafafa;
}
.run-area {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.run-summary {
  font-size: 13px;
  color: #f59e0b;
  font-weight: 600;
}
.run-summary.all-passed {
  color: #67c23a;
}
.test-results {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.test-result {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 13px;
}
.test-result.passed {
  background: #f0f9eb;
  border-color: #c2e7b0;
}
.test-result.failed {
  background: #fef0f0;
  border-color: #fbc4c4;
}
.test-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.test-icon {
  font-weight: 700;
  font-size: 15px;
}
.test-result.passed .test-icon {
  color: #67c23a;
}
.test-result.failed .test-icon {
  color: #f56c6c;
}
.test-name {
  color: #303133;
}
.test-detail {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}
.detail-label {
  flex-shrink: 0;
  width: 36px;
  color: #909399;
}
.detail-code {
  background: white;
  border: 1px solid #ebeef5;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 12px;
  word-break: break-all;
}
.test-error {
  margin: 6px 0 0;
  padding: 8px 12px;
  background: white;
  border: 1px solid #fbc4c4;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: #f56c6c;
  white-space: pre-wrap;
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
