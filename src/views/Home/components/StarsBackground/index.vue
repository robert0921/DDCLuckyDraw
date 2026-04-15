<script setup lang='ts'>
import { useElementSize } from '@vueuse/core'
import localforage from 'localforage'
import Sparticles from 'sparticles'
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import useStore from '@/store'

const props = defineProps({
    homeBackground: {
        type: Object,
        default: () => ({
            id: '',
            name: '',
            url: '',
        }),
    },
})
const imageDbStore = localforage.createInstance({
    name: 'imgStore',
})
const imgUrl = ref('')
const starRef = ref()
const starBackRef = ref()
const starFrontRef = ref()
const spBackInstance = ref<any>(null)
const spFrontInstance = ref<any>(null)

const { width, height } = useElementSize(starRef)
const options = ref({ shape: 'star', parallax: 1.2, rotate: true, twinkle: true, speed: 10, count: 200 })
function addSparticles(node: any, width: number, height: number, opts?: any) {
    if (!node) return null
    const params = Object.assign({}, options.value, opts || {})
    const sparticleInstance = new Sparticles(node, params, width, height)
    return sparticleInstance
}
// 页面大小改变时
function listenWindowSize() {
    window.addEventListener('resize', () => {
        if (width.value && height.value) {
            addSparticles(starRef.value, width.value, height.value)
        }
    })
}

async function getImageStoreItem(item: any): Promise<string> {
    let image = ''
    if (item.url === 'Storage') {
        const key = item.id
        const imageData = await imageDbStore.getItem(key) as any
        image = URL.createObjectURL(imageData.data)
    }
    else {
        image = item.url
    }

    return image
}
onMounted(() => {
    getImageStoreItem(props.homeBackground).then((image) => {
        imgUrl.value = image
    })
    // 临时调试：打印运行时背景/图案配置，帮助定位为什么未显示预期的 2026 图案
    try {
           // debug logs removed to avoid noisy console output
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[StarsBackground] pattern debug failed', e)
    }
    // create a subtle back layer and a vibrant front layer
    spBackInstance.value = addSparticles(starBackRef.value || starRef.value, width.value, height.value, { count: 140, speed: 6, size: 1.6, opacity: 0.75, shape: 'circle', twinkle: true, color: undefined })
    spFrontInstance.value = addSparticles(starFrontRef.value || starRef.value, width.value, height.value, { count: 140, speed: 16, size: 2.8, opacity: 1, shape: 'star', twinkle: true, rotate: true, color: (getLuckyColor && getLuckyColor.value) ? getLuckyColor.value : undefined })
    listenWindowSize()
    // 鼠标视差效果
    window.addEventListener('mousemove', handleMouseMove)
    // 侦听抽奖结束事件以触发粒子爆发
    window.addEventListener('lottery:end', onLotteryEndParticle)
    // 侦听洗牌轮次事件，触发小幅粒子效果
    window.addEventListener('shuffle:round', onShuffleRoundParticle)
})
onUnmounted(() => {
    window.removeEventListener('resize', listenWindowSize)
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('lottery:end', onLotteryEndParticle)
    window.removeEventListener('shuffle:round', onShuffleRoundParticle)
    try {
        if (spBackInstance.value && typeof spBackInstance.value.destroy === 'function') spBackInstance.value.destroy()
    }
    catch (e) {}
    try {
        if (spFrontInstance.value && typeof spFrontInstance.value.destroy === 'function') spFrontInstance.value.destroy()
    }
    catch (e) {}
})

function handleMouseMove(ev: MouseEvent) {
    const w = window.innerWidth
    const h = window.innerHeight
    const nx = (ev.clientX / w) - 0.5
    const ny = (ev.clientY / h) - 0.5
    // 前景移动幅度大一些，背景小一些
    try {
        if (starFrontRef.value) starFrontRef.value.style.transform = `translate(${-(nx * 12)}px, ${-(ny * 8)}px)`
        if (starBackRef.value) starBackRef.value.style.transform = `translate(${-(nx * 6)}px, ${-(ny * 3)}px)`
    }
    catch (e) {}
}

function onShuffleRoundParticle(ev: any) {
    try {
        const d = ev && ev.detail ? ev.detail : {}
        // 小爆发，次数与轮次有关
        const strength = (typeof d.round === 'number') ? (1 + d.round) : 1
        const burst = addSparticles(starFrontRef.value, window.innerWidth, window.innerHeight, { count: 40 * strength, speed: 22, size: 2.6, opacity: 0.9, shape: 'star', twinkle: true, rotate: true, color: (getLuckyColor && getLuckyColor.value) ? getLuckyColor.value : undefined })
        setTimeout(() => {
            try { if (burst && typeof burst.destroy === 'function') burst.destroy() } catch (e) {}
        }, 650)
    }
    catch (e) { console.error('onShuffleRoundParticle failed', e) }
}

function onLotteryEndParticle(ev: any) {
    try {
        const detail = ev && ev.detail ? ev.detail : null
        // 尝试从事件中获取主题色（优先），否则使用 global lucky color
        let color = null
        if (detail && detail.person && detail.person.prizeRaw && detail.person.prizeRaw.color) color = detail.person.prizeRaw.color
        if (!color && getLuckyColor && getLuckyColor.value) color = getLuckyColor.value
        triggerBurst(color)
    }
    catch (e) { console.error('onLotteryEndParticle failed', e) }
}

function triggerBurst(color?: string) {
    try {
        // 临时爆发实例，使用更高能量参数
        const burst = addSparticles(starFrontRef.value, window.innerWidth, window.innerHeight, { count: 180, speed: 42, size: 4.6, opacity: 1, shape: 'circle', twinkle: false, rotate: false, color: color })
        // 自动销毁
        setTimeout(() => {
            try { if (burst && typeof burst.destroy === 'function') burst.destroy() } catch (e) {}
        }, 900)
    }
    catch (e) { console.error('triggerBurst failed', e) }
}

// 支持两种图案来源：props.homeBackground.pattern（旧格式）或全局配置里的 patternList/patternColor（原项目格式）
const store = useStore()
const { getPatternList, getPatterColor, getRowCount, getCardColor, getLuckyColor } = storeToRefs(store.globalConfig)

const patternGridStyle = computed(() => {
    // 优先使用 props.homeBackground.pattern（如果存在）以保兼容性
    const p = (props.homeBackground && props.homeBackground.pattern) || null
    if (p && p.cells && p.cells.length) {
        const cols = p.cols || 15
        const rows = p.rows || Math.ceil(p.cells.length / cols) || 5
        const cell = p.cellSize || 16
        const gap = (typeof p.gap !== 'undefined') ? p.gap : 2
        return {
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
            gridAutoRows: `${cell}px`,
            gap: `${gap}px`,
            width: `${cols * cell + (cols - 1) * gap}px`,
            height: `${rows * cell + (rows - 1) * gap}px`,
        }
    }

    // 否则使用全局配置的 patternList（与主页面一致：15 列 × 5 行）
    const patternList = (getPatternList && getPatternList.value) || []
    const cols = 15
    const rows = 5
    const cell = 16
    const gap = 2
    return {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
        gridAutoRows: `${cell}px`,
        gap: `${gap}px`,
        width: `${cols * cell + (cols - 1) * gap}px`,
        height: `${rows * cell + (rows - 1) * gap}px`,
    }
})

const patternCells = computed(() => {
    // 优先兼容 props.homeBackground.pattern
    const p = (props.homeBackground && props.homeBackground.pattern) || null
    if (p && p.cells && p.cells.length) return p.cells

    const patternList = (getPatternList && getPatternList.value) || []
    const patternColor = (getPatterColor && getPatterColor.value) || '#1b66c9'
    const cardColor = (getCardColor && getCardColor.value) || '#ffffff'
    const cols = (getRowCount && getRowCount.value) || 17
    const rows = 7
    const total = cols * rows
    const cells = new Array(total).fill(cardColor)
    for (let i = 0; i < patternList.length; i++) {
        const idx = patternList[i] - 1
        if (idx >= 0 && idx < total) cells[idx] = patternColor
    }
    return cells
})
</script>

<template>
    <!-- background layer: strictly behind all page content (z-index:-1) -->
    <div class="background-layer">
        <div v-if="props.homeBackground && props.homeBackground.pattern && patternCells && patternCells.length" class="home-background w-screen h-screen overflow-hidden pattern-bg">
            <div class="pattern-grid" :style="patternGridStyle">
                <div v-for="(cell, idx) in patternCells" :key="idx" class="pattern-cell" :style="{ background: cell }"></div>
            </div>
        </div>
        <div v-else-if="homeBackground && homeBackground.url" class="home-background w-screen h-screen overflow-hidden">
            <img :src="imgUrl" class="w-full h-full object-cover" alt="">
        </div>
        <div ref="starBackRef" class="particles-layer particles-back" />
    </div>
    <!-- foreground particles layer: above lottery grid but below three.js overlay -->
    <div class="particles-foreground">
        <div ref="starFrontRef" class="particles-layer particles-front" />
    </div>
</template>

<style lang='scss' scoped>
.pattern-bg {
    display: flex;
    justify-content: center;
    align-items: center;
}
.pattern-grid {
    display: grid;
    grid-template-columns: repeat(15, 16px);
    grid-auto-rows: 16px;
    gap: 2px;
}
.pattern-cell {
    width: 16px;
    height: 16px;
}

</style>
<style lang='scss' scoped>
.background-layer {
    position: fixed;
    inset: 0;
    z-index: 0; /* behind lottery content but above page background */
    pointer-events: none;
}
.particles-foreground {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 10; /* above lottery card grid (z-index:1) but below three.js container (z-index:5 → cards at z:1) */
}
.particles-layer {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    will-change: transform;
    transition: transform 0.12s linear;
    mix-blend-mode: screen;
    filter: drop-shadow(0 6px 14px rgba(255,255,255,0.08)) blur(0.4px) saturate(1.2);
}
.particles-back { z-index: 1; opacity: 0.9 }
.particles-front { z-index: 3; opacity: 1 }
</style>
