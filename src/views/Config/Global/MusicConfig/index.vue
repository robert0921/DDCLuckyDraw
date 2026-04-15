<script setup lang='ts'>
import type { IMusic } from '@/types/storeType'
import localforage from 'localforage'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Volume2, VolumeX } from 'lucide-vue-next'
import PageHeader from '@/components/PageHeader/index.vue'
import useStore from '@/store'
import UploadDialog from './components/UploadDialog.vue'

const { t } = useI18n()
const audioDbStore = localforage.createInstance({
    name: 'audioStore',
})
const globalConfig = useStore().globalConfig

const { getMusicList: localMusicList, getMusicVolume: storeVolume } = storeToRefs(globalConfig)
const localMusicListValue = ref(localMusicList)
const uploadVisible = ref(false)

// 音量：0-100 整数用于滑块，存储时转换为 0-1
const volumePercent = computed({
    get: () => Math.round((storeVolume.value ?? 1) * 100),
    set: (v: number) => globalConfig.setMusicVolume(v / 100),
})

// 静音前记录音量，用于恢复
const prevVolume = ref(100)
function toggleMute() {
    if (volumePercent.value > 0) {
        prevVolume.value = volumePercent.value
        volumePercent.value = 0
    }
    else {
        volumePercent.value = prevVolume.value || 50
    }
}

async function play(item: IMusic) {
    globalConfig.setCurrentMusic(item, false)
}

function deleteMusic(item: IMusic) {
    globalConfig.removeMusic(item.id)
    audioDbStore.removeItem(item.id)
}
function resetMusic() {
    globalConfig.resetMusicList()
    audioDbStore.clear()
}
function deleteAll() {
    globalConfig.clearMusicList()
    audioDbStore.clear()
}
</script>

<template>
  <UploadDialog v-model:visible="uploadVisible" />
  <div>
    <PageHeader :title="t('sidebar.musicManagement')">
      <template #buttons>
        <div class="flex gap-3">
          <button class="btn btn-primary btn-sm" @click="resetMusic">
            {{ t('button.reset') }}
          </button>
          <label for="explore">
            <span class="btn btn-primary btn-sm" @click="uploadVisible = true">{{ t('button.upload') }}</span>
          </label>
          <button class="btn btn-error btn-sm" @click="deleteAll">
            {{ t('button.allDelete') }}
          </button>
        </div>
      </template>
    </PageHeader>

    <!-- 音量控制 -->
    <div class="flex items-center gap-4 mb-5 p-4 rounded-xl bg-base-200">
      <Volume2 v-if="volumePercent > 0" class="w-5 h-5 shrink-0 cursor-pointer transition-opacity hover:opacity-100 opacity-70" @click="toggleMute" />
      <VolumeX v-else class="w-5 h-5 shrink-0 cursor-pointer text-error opacity-80 hover:opacity-100" @click="toggleMute" />
      <span class="text-sm opacity-70 shrink-0">{{ t('table.musicVolume') }}</span>
      <input
        v-model.number="volumePercent"
        type="range"
        min="0"
        max="100"
        step="1"
        class="range range-primary range-sm flex-1"
      >
      <span class="text-sm w-10 text-right tabular-nums opacity-70">{{ volumePercent }}%</span>
    </div>

    <div>
      <ul class="p-0">
        <li v-for="item in localMusicListValue" :key="item.id" class="flex items-center gap-6 pb-2 mb-3">
          <div class="mr-12 overflow-hidden w-72 whitespace-nowrap text-ellipsis" :title="item.name">
            <a class="link hover:text-primary">{{ item.name }}</a>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-primary btn-xs" @click="play(item)">
              {{ t('button.play') }}
            </button>
            <button class="btn btn-error btn-xs" @click="deleteMusic(item)">
              {{ t('button.delete') }}
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style lang='scss' scoped></style>
