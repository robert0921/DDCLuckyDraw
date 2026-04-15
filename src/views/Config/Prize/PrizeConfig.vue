<script setup lang='ts'>
import { ref } from 'vue'
import { Grip } from 'lucide-vue-next'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import { HoverTip } from '@/components/index'
import EditSeparateDialog from '@/components/NumberSeparate/EditSeparateDialog.vue'
import PageHeader from '@/components/PageHeader/index.vue'
import { usePrizeConfig } from './usePrizeConfig'
import { usePrizeImportExport } from './usePrizeImportExport'

const { addPrize, resetDefault, delAll, delItem, prizeList, currentPrize, selectedPrize, submitData, changePrizePerson, changePrizeStatus, selectPrize, localImageList } = usePrizeConfig()
const { t } = useI18n()

const importFileRef = ref<HTMLInputElement>()
const { handleDownloadTemplate, handleFileChange, handleExport } = usePrizeImportExport(prizeList, importFileRef, localImageList)
</script>

<template>
  <div>
    <PageHeader :title="t('viewTitle.prizeManagement')">
      <template #buttons>
        <div class="flex w-full gap-3 flex-wrap">
          <button class="btn btn-info btn-sm" @click="addPrize">
            {{ t('button.add') }}
          </button>
          <button class="btn btn-info btn-sm" @click="resetDefault">
            {{ t('button.resetDefault') }}
          </button>
          <button class="btn btn-error btn-sm" @click="delAll">
            {{ t('button.allDelete') }}
          </button>
          <!-- 导入导出 -->
          <button class="btn btn-secondary btn-sm" @click="handleDownloadTemplate">
            下载模板
          </button>
          <label>
            <input
              ref="importFileRef"
              type="file"
              accept=".xlsx,.xls"
              style="display:none"
              @change="handleFileChange"
            >
            <span class="btn btn-primary btn-sm cursor-pointer">导入数据</span>
          </label>
          <button class="btn btn-accent btn-sm" @click="handleExport">
            导出结果
          </button>
        </div>
      </template>
      <template #alerts>
        <div role="alert" class="w-full my-4 alert alert-info">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-current shrink-0">
            <path
              stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{{ t('dialog.tipResetPrize') }}</span>
        </div>
      </template>
    </PageHeader>
    <VueDraggable
      v-model="prizeList"
      :animation="150"
      handle=".handle"
      class="p-0 m-0"
    >
      <div
        v-for="item in prizeList" :key="item.id" class="flex items-center justify-center gap-10 py-5"
        :class="currentPrize.id === item.id ? 'border border-dotted rounded-xl' : null"
      >
        <label class="flex items-center justify-center max-w-xs px-2 handle form-control">
          <Grip class="w-10 h-10 cursor-move handle" />
        </label>
        <label class="w-1/2 max-w-xs form-control">
          <div class="label">
            <span class="label-text">{{ t('table.prizeName') }}</span>
          </div>
          <input
            v-model="item.name" type="text" :placeholder="t('placeHolder.name')"
            class="w-full max-w-xs input-sm input input-bordered"
          >
        </label>
        <label class="w-1/2 max-w-xs form-control">
          <div class="label">
            <span class="label-text">奖品数</span>
          </div>
          <input
            v-model.number="item.count" type="number" min="1" placeholder="奖品数量"
            class="w-full max-w-xs input-sm input input-bordered"
          >
        </label>
        <label class="w-1/2 max-w-xs form-control">
          <div class="label">
            <span class="label-text">已抽取</span>
          </div>
          <input
            :value="item.isUsedCount" type="number" readonly
            class="w-full max-w-xs input-sm input input-bordered opacity-60 cursor-not-allowed"
          >
        </label>
        <label class="w-full max-w-xs form-control">
          <div class="label">
            <span class="label-text">{{ t('table.image') }}</span>
          </div>
          <select v-model="item.picture" class="truncate select select-warning select-sm">
            <option v-if="item.picture && item.picture.id" :value="{ id: '', name: '', url: '' }">❌</option>
            <!-- 如果当前 prize 来自导入且只有 name/url（无 id），展示该项以便下拉显示导入的图片名 -->
            <option v-else-if="item.picture && item.picture.name && !item.picture.id" :value="item.picture">{{ item.picture.name }}</option>
            <option disabled selected>{{ t('table.selectPicture') }}</option>
            <option v-for="picItem in localImageList" :key="picItem.id" :title="picItem.name" class="w-full max-w-full" :value="picItem">
              <span class="truncate w-option-xs">{{ picItem.name }}</span>
            </option>
          </select>
        </label>
        <!-- 单次抽取个数（separateCount）已移除 -->
        <label class="w-full max-w-xs form-control">
          <div class="label">
            <span class="label-text">{{ t('table.operation') }}</span>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-error btn-xs" @click="delItem(item)">{{ t('button.delete') }}</button>
          </div>
        </label>
      </div>
    </VueDraggable>
    <EditSeparateDialog
      :total-number="selectedPrize?.count" :separated-number="selectedPrize?.separateCount.countList"
      @submit-data="submitData"
    />
  </div>
</template>

<style lang='scss' scoped></style>
