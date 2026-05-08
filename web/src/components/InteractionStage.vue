<script setup lang="ts">
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

defineProps<{
  interaction: ServedInteraction;
}>();
</script>

<template>
  <div class="interaction-stage">
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
    <el-alert
      v-else
      :title="`Pattern '${interaction.patternId}' 的 UI 组件尚未实现`"
      type="warning"
      :closable="false"
      show-icon
    />
  </div>
</template>

<style scoped>
.interaction-stage {
  max-width: 760px;
  margin: 0 auto;
}
</style>
