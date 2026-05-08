<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ArchiveNodeKind } from '@whale-tutor/tutor-types';
import { getArchive } from '@/api/archive';
import { renderMarkdown } from '@/utils/markdown';

/**
 * 通用学习节点档案查看器 modal。
 * 父组件控制 visible 与 (kind, id, learnerId);本组件自己 fetch + 渲染 markdown。
 */
const props = defineProps<{
  visible: boolean;
  kind: ArchiveNodeKind | null;
  id: string | number | null;
  // lo / chapter / course 需要 learnerId;qa-thread / adaptive-interaction 不需要
  learnerId?: number | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const loading = ref(false);
const error = ref<string | null>(null);
const title = ref('');
const contentMd = ref('');
const copySuccess = ref(false);

const html = computed(() => renderMarkdown(contentMd.value));

async function load(): Promise<void> {
  if (
    !props.visible ||
    !props.kind ||
    props.id === null ||
    props.id === undefined
  )
    return;
  loading.value = true;
  error.value = null;
  contentMd.value = '';
  title.value = '';
  try {
    const data = await getArchive(
      props.kind,
      props.id,
      props.learnerId ?? undefined,
    );
    title.value = data.title;
    contentMd.value = data.contentMd;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.visible, props.kind, props.id, props.learnerId],
  () => {
    void load();
  },
  { immediate: true },
);

async function copyMarkdown(): Promise<void> {
  try {
    await navigator.clipboard.writeText(contentMd.value);
    copySuccess.value = true;
    setTimeout(() => {
      copySuccess.value = false;
    }, 1500);
  } catch (e) {
    error.value = '复制失败:' + (e as Error).message;
  }
}

function close(): void {
  emit('update:visible', false);
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="title || '学习档案'"
    width="760px"
    align-center
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div v-if="loading" v-loading="true" class="loading-area"></div>
    <el-alert
      v-else-if="error"
      type="error"
      :title="error"
      :closable="false"
      show-icon
    />
    <div v-else class="markdown-body archive-content" v-html="html"></div>

    <template #footer>
      <el-button plain :disabled="!contentMd || loading" @click="copyMarkdown">
        {{ copySuccess ? '✓ 已复制' : '复制 markdown' }}
      </el-button>
      <el-button @click="close">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.loading-area {
  min-height: 200px;
}
.archive-content {
  max-height: 60vh;
  overflow-y: auto;
  padding: 0 4px;
}
</style>
