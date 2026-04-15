// pinia
import { createPinia } from 'pinia'
// pinia持久化
import piniaPluginPersist from 'pinia-plugin-persist'
import localforage from 'localforage'
import * as THREE from 'three'
import { createApp } from 'vue'
import VueDOMPurifyHTML from 'vue-dompurify-html'
import svgIcon from '@/components/SvgIcon/index.vue'
import i18n from '@/locales/i18n'
// svg全局组件// 路由
import router from '@/router'
import defaultConfigData from '../public/defaultConfig.json'
import App from './App.vue'
import './style.css'
import './style/markdown.css'
import './style/style.scss'
// 全局svg组件
import 'virtual:svg-icons-register'

// 在应用初始化时尽早设置主题和字体，避免页面加载时的闪烁
;(function initializeThemeAndFont() {
    try {
        const globalConfigStr = localStorage.getItem('globalConfig')
        if (globalConfigStr) {
            const storageData = JSON.parse(globalConfigStr)
            const globalConfig = storageData.globalConfig || storageData
            if (globalConfig.theme?.name)
                document.documentElement.setAttribute('data-theme', globalConfig.theme.name)
            if (globalConfig.theme?.font)
                document.documentElement.style.setProperty('--app-font-family', `"${globalConfig.theme.font}", -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`)
        }
    }
    catch (e) {
        console.warn('Failed to set initial theme and font:', e)
    }
})()

function getStringHash(input: string) {
    let hash = 5381
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
    }
    return (hash >>> 0).toString(16)
}

/** 将 base64 data URL 转换为 Blob，避免依赖 fetch('data:...') */
function dataUrlToBlob(dataUrl: string): Blob | null {
    try {
        const [header, b64] = dataUrl.split(',')
        const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream'
        const binary = atob(b64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return new Blob([bytes], { type: mime })
    }
    catch { return null }
}

// 从 public/defaultConfig.json 加载默认配置（构建时内联，避免 WebView 缓存问题）。
// 规则：
// 1. 首次启动且本地没有配置时导入。
// 2. 若内置配置内容发生变化（hash 不同），则覆盖导入一次，确保重新打包后的 app.exe 使用新内置配置。
// 3. 若内置文件未变化，则保留用户在本地运行过程中修改过的配置。
//
// 注意：使用 top-level await，保证配置写入 localStorage 后再挂载 Vue，
// Pinia stores 初始化时即可读到正确数据，无需 window.location.reload()。
await (async function tryLoadDefaultConfig() {
    try {
        const embeddedConfigHashKey = 'embeddedDefaultConfigHash'
        const hasPrize = !!localStorage.getItem('prizeConfig')
        const hasGlobal = !!localStorage.getItem('globalConfig')
        const rawConfig = JSON.stringify(defaultConfigData)
        const embeddedHash = getStringHash(rawConfig)
        const appliedHash = localStorage.getItem(embeddedConfigHashKey)
        const shouldApplyEmbeddedConfig = !hasPrize || !hasGlobal || appliedHash !== embeddedHash
        if (!shouldApplyEmbeddedConfig) return

        // 深拷贝，后续会修改 url 字段
        const config = JSON.parse(rawConfig) as Record<string, any>

        // 将 base64 data URL 的图片/音频存入 localforage（与正常上传路径一致），
        // localStorage 中只保留 { id, name, url: 'Storage' } 引用，避免超出 5MB 配额。
        const imageDbStore = localforage.createInstance({ name: 'imgStore' })
        const audioDbStore = localforage.createInstance({ name: 'audioStore' })

        async function externalizeAsset(item: any) {
            if (!item || typeof item.url !== 'string' || !item.url.startsWith('data:')) return
            const blob = dataUrlToBlob(item.url)
            if (!blob) return
            const id: string = item.id || crypto.randomUUID()
            // 按 MIME 类型分流：音频存 audioStore，其余存 imgStore
            const store = blob.type.startsWith('audio/') ? audioDbStore : imageDbStore
            await store.setItem(id, { fileName: item.name || '', data: blob })
            item.url = 'Storage'
            item.id = id
        }

        // 处理奖品图片
        if (config.prizeConfig?.prizeConfig) {
            const pc = config.prizeConfig.prizeConfig
            if (Array.isArray(pc.prizeList))
                await Promise.all(pc.prizeList.map((pr: any) => externalizeAsset(pr.picture)))
            if (pc.currentPrize?.picture) await externalizeAsset(pc.currentPrize.picture)
            if (pc.temporaryPrize?.picture) await externalizeAsset(pc.temporaryPrize.picture)
        }

        // 处理全局背景图片和音乐
        if (config.globalConfig?.globalConfig) {
            const gc = config.globalConfig.globalConfig
            if (Array.isArray(gc.imageList))
                await Promise.all(gc.imageList.map((img: any) => externalizeAsset(img)))
            if (Array.isArray(gc.musicList))
                await Promise.all(gc.musicList.map((mus: any) => externalizeAsset(mus)))
        }

        let changed = false
        if (config.prizeConfig) {
            localStorage.setItem('prizeConfig', JSON.stringify(config.prizeConfig))
            changed = true
        }
        if (config.globalConfig) {
            localStorage.setItem('globalConfig', JSON.stringify(config.globalConfig))
            changed = true
        }
        if (changed)
            localStorage.setItem(embeddedConfigHashKey, embeddedHash)
    }
    catch (e) {
        console.warn('[defaultConfig] failed to apply:', e)
    }
})()

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersist)

app.config.globalProperties.$THREE = THREE // 挂载到原型
app.component('svg-icon', svgIcon)
app.use(router)
app.use(VueDOMPurifyHTML)
app.use(pinia)
app.use(i18n)
app.mount('#app')
