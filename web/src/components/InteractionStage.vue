<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import type {
  CodeSandboxPromptForLearner,
  ConceptCheckPromptForLearner,
  FreeRecallPromptForLearner,
  InteractionInstance,
  ServedInteraction,
  SpotTheBugPromptForLearner,
} from '@whale-tutor/tutor-types';
import CodeSandboxCard from '@/components/patterns/CodeSandboxCard.vue';
import ConceptCheckCard from '@/components/patterns/ConceptCheckCard.vue';
import FreeRecallCard from '@/components/patterns/FreeRecallCard.vue';
import SpotTheBugCard from '@/components/patterns/SpotTheBugCard.vue';
import HintBar from '@/components/HintBar.vue';
import { useSessionStore } from '@/stores/session';

defineProps<{
  interaction: ServedInteraction;
}>();

const sessionStore = useSessionStore();
const { progress } = storeToRefs(sessionStore);

// 章末综合测试 phase 不显示 hint(综合考核应靠学习者自己判断,UI 隐藏求助按钮)
const hintKind = computed<'lo' | 'assessment'>(() =>
  progress.value?.chapter.phase === 'assessment' ? 'assessment' : 'lo',
);
</script>

<template>
  <div class="interaction-stage">
    <HintBar :kind="hintKind" />

    <ConceptCheckCard
      v-if="interaction.patternId === 'concept_check'"
      :interaction="(interaction as InteractionInstance<ConceptCheckPromptForLearner>)"
    />
    <FreeRecallCard
      v-else-if="interaction.patternId === 'free_recall'"
      :interaction="(interaction as InteractionInstance<FreeRecallPromptForLearner>)"
    />
    <SpotTheBugCard
      v-else-if="interaction.patternId === 'spot_the_bug'"
      :interaction="(interaction as InteractionInstance<SpotTheBugPromptForLearner>)"
    />
    <CodeSandboxCard
      v-else-if="interaction.patternId === 'code_sandbox'"
      :interaction="(interaction as InteractionInstance<CodeSandboxPromptForLearner>)"
    />
    <!-- 不写 v-else 兜底 — PatternId 是 4 元素 union,4 个分支已穷尽,TS 会把 v-else 收窄成 never。
         若新增 Pattern 而前端尚未实现卡片,TS 会在 union 加成员时立即报错,逼迫加分支 -->
  </div>
</template>

<style scoped>
.interaction-stage {
  max-width: 760px;
  margin: 0 auto;
}
</style>
