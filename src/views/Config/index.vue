<script setup lang="ts">
import dayjs from 'dayjs'
import { ref } from 'vue'
import localforage from 'localforage'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { configRoutes } from '../../router'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const menuList = ref<any[]>(configRoutes.children)
const currentYear = dayjs().year()

/** 导出当前配置为 defaultConfig.json，放入 public/ 目录后重新打包即可将配置内置到发布包 */
async function exportDefaultConfig() {
  try {
    const prizeConfig = localStorage.getItem('prizeConfig')
    const globalConfig = localStorage.getItem('globalConfig')
    const config: Record<string, any> = {}
    if (prizeConfig) config.prizeConfig = JSON.parse(prizeConfig)
    if (globalConfig) config.globalConfig = JSON.parse(globalConfig)

    // Inline Storage assets (images/audio) from localforage if present
    const imageDbStore = localforage.createInstance({ name: 'imgStore' })
    const audioDbStore = localforage.createInstance({ name: 'audioStore' })

    async function blobToDataUrl(blob: Blob) {
      return await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }

    // helper to inline store items by id
    async function inlineIfStorage(item: any) {
      if (!item) return
      if (item.url === 'Storage' && item.id) {
        try {
          const stored: any = (await imageDbStore.getItem(item.id)) || (await audioDbStore.getItem(item.id))
          if (stored && stored.data) {
            const dataUrl = await blobToDataUrl(stored.data)
            if (dataUrl) item.url = dataUrl
            if (stored.fileName) item.name = stored.fileName
          }
        }
        catch (e) {
          // ignore individual failures
        }
      }
    }

    // inline global images and music
    if (config.globalConfig) {
      const g = config.globalConfig
      if (g.imageList && Array.isArray(g.imageList)) {
        await Promise.all(g.imageList.map((it: any) => inlineIfStorage(it)))
      }
      if (g.musicList && Array.isArray(g.musicList)) {
        await Promise.all(g.musicList.map((it: any) => inlineIfStorage(it)))
      }
    }

    // inline prize pictures
    if (config.prizeConfig && config.prizeConfig.prizeConfig) {
      const p = config.prizeConfig.prizeConfig
      if (p.prizeList && Array.isArray(p.prizeList)) {
        await Promise.all(p.prizeList.map((pr: any) => inlineIfStorage(pr.picture)))
      }
      if (p.currentPrize) await inlineIfStorage(p.currentPrize.picture)
    }

    const jsonText = JSON.stringify(config, null, 2)

    // 在 Tauri 打包版中使用文件保存对话框；在浏览器中使用 <a> 下载
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
    if (isTauri) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        const filePath = await save({
          defaultPath: 'defaultConfig.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
        if (filePath) {
          await writeTextFile(filePath, jsonText)
        }
      }
      catch (tauriErr) {
        // 若 Tauri 插件不可用则降级到 blob 下载
        console.warn('Tauri save dialog failed, falling back to blob download', tauriErr)
        const blob = new Blob([jsonText], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'defaultConfig.json'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    }
    else {
      const blob = new Blob([jsonText], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'defaultConfig.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }
  catch (e) {
    console.error('导出配置失败', e)
  }
}

function cleanMenuList(menu: any) {
    const newList = menu
    for (let i = 0; i < newList.length; i++) {
        if (newList[i].children) {
            cleanMenuList(newList[i].children)
        }
        if (!newList[i].meta) {
            newList.splice(i, 1)
            i--
        }
    }

    return newList
}

menuList.value = cleanMenuList(menuList.value)

function skip(path: string) {
    router.push(path)
}
</script>

<template>
  <div class="flex min-h-[calc(100%-280px)]">
    <ul class="w-56 m-0 mr-3 min-w-56 menu bg-base-200 pt-14">
      <li v-for="item in menuList" :key="item.name">
        <details v-if="item.children && !item.meta.hidden" open>
          <summary>{{ item.meta.title }}</summary>
          <ul>
            <li v-for="subItem in item.children" :key="subItem.name">
              <details v-if="subItem.children" open>
                <summary>{{ subItem.meta!.title }}</summary>
                <ul>
                  <li v-for="subSubItem in subItem.children" :key="subSubItem.name">
                    <a
                      :style="subSubItem.name === route.name ? 'background-color:rgba(12,12,12,0.2)' : ''"
                      @click="skip(subItem.path)"
                    >{{
                      subSubItem.meta!.title }}</a>
                  </li>
                </ul>
              </details>
              <a
                v-else :style="subItem.name === route.name ? 'background-color:rgba(12,12,12,0.2)' : ''"
                @click="skip(subItem.path)"
              >{{
                subItem.meta!.title }}</a>
            </li>
          </ul>
        </details>
        <a
          v-else-if="!item.meta.hidden" :style="item.name === route.name ? 'background-color:rgba(12,12,12,0.2)' : ''"
          @click="skip(item.path)"
        >{{ item.meta!.title }}</a>
        <div v-else />
      </li>
    </ul>
    <router-view class="flex-1 mt-5" />
  </div>
  <footer class="p-10 rounded footer footer-center bg-base-200 h-70 flex flex-col gap-4 text-base-content">
    <nav class="grid grid-flow-col gap-4">
      <a class="cursor-pointer link link-hover text-inherit" target="_blank" href="https://1kw20.fun">{{ t('footer.self-reflection') }}</a>
    </nav>
    <nav>
      <a class="cursor-pointer link link-hover text-inherit" target="_blank" href="https://1kw20.fun">{{ t('footer.thiefEasy') }}</a>
    </nav>
    <nav>
      <div class="grid grid-flow-col gap-4">
        <a href="https://github.com/robert0921/DDCLuckyDraw" target="_blank" class="cursor-pointer text-inherit">
          <svg-icon name="github" />
        </a>
      </div>
    </nav>
    <aside>
      <a class="p-0 m-0 hover:text-primary" href="https://beian.miit.gov.cn/" target="_blank">
      </a>
      <p>Copyright © {{ currentYear }} - All right reserved by <a class="link link-primary" href="https://github.com/robert0921" target="_blank">ChengLu</a></p>
      <button class="btn btn-sm btn-outline mt-2" @click="exportDefaultConfig" title="导出当前配置为 defaultConfig.json，放入 public/ 后重新打包可内置到发布版本">
        📦 导出默认配置（用于build打包）
      </button>
    </aside>
  </footer>
</template>

<style scoped></style>
