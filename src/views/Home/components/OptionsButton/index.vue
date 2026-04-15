<script setup lang='ts'>
import { toRefs } from 'vue'
import { useI18n } from 'vue-i18n'
import { LuckydrawStatus } from '@/views/Home/type'

interface Props {
    currentStatus: LuckydrawStatus
    tableData: any[]
    enterLuckydraw: () => void
    startLuckydraw: () => void
    stopLuckydraw: () => void
    continueLuckydraw: () => void
    quitLuckydraw: () => void
}
const props = defineProps<Props>()

const { currentStatus, tableData, enterLuckydraw, startLuckydraw, stopLuckydraw, continueLuckydraw, quitLuckydraw } = toRefs(props)
const { t } = useI18n()
</script>

<template>
  <div id="menu">
    <button v-if="currentStatus === LuckydrawStatus.init && tableData.length > 0" class="btn-neon" @click="enterLuckydraw">
      {{ t('button.enterLuckydraw') }}
    </button>

    <div v-if="currentStatus === LuckydrawStatus.ready" class="start">
      <button class="btn-stars" @click="startLuckydraw">
        <strong>{{ t('button.start') }}</strong>
        <div id="container-stars">
          <div id="stars" />
        </div>

        <div id="glow">
          <div class="circle" />
          <div class="circle" />
        </div>
      </button>
    </div>

    <button v-if="currentStatus === LuckydrawStatus.running" class="btn-neon btn glass btn-lg" @click="stopLuckydraw">
      {{ t('button.selectLucky') }}
    </button>

    <div v-if="currentStatus === LuckydrawStatus.end" class="flex justify-center gap-6 enStop">
      <div class="start">
        <button class="btn-stars" @click="continueLuckydraw">
          <strong>{{ t('button.continue') }}</strong>
          <div id="container-stars">
            <div id="stars" />
          </div>

          <div id="glow">
            <div class="circle" />
            <div class="circle" />
          </div>
        </button>
      </div>

      <div class="start">
        <button class="btn-stars btn-cancel" @click="quitLuckydraw">
          <strong>{{ t('button.cancel') }}</strong>
          <div id="container-stars">
            <div id="stars" />
          </div>

          <div id="glow">
            <div class="circle" />
            <div class="circle" />
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './index.scss'
</style>
