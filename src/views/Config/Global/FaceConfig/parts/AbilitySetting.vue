<script setup lang='ts'>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const definiteTime = defineModel<number | null>('definiteTime', { required: true })
const winMusic = defineModel<boolean>('winMusic', { required: true })
</script>

<template>
  <fieldset class="p-4 border text-setting fieldset bg-base-200 border-base-300 rounded-box w-xs pb-10">
    <legend class="fieldset-legend">
      {{ t('table.abilitySetting') }}
    </legend>
    <div class="flex items-center justify-between w-full max-w-xs gap-2 mb-3 form-control">
      <div class="label">
        <span class="label-text">{{ t('table.playWinMusic') }}</span>
      </div>
      <input
        type="checkbox" :checked="winMusic" class="border-solid checkbox checkbox-secondary border"
        @change="winMusic = !winMusic"
      >
    </div>
  </fieldset>
</template>

<style scoped>

</style>
