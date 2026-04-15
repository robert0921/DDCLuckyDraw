
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, reactive, nextTick } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'

import HeaderTitle from './components/HeaderTitle/index.vue'
import StarsBackground from './components/StarsBackground/index.vue'
import ImageSync from '@/components/ImageSync/index.vue'
import { usePrizeConfig } from '@/store/prizeConfig'
import 'vue-toast-notification/dist/theme-sugar.css'

// 行列定义（新增底部一行 F）
const ROWS = 6
const COLS = 15
const ROW_LABELS = ['D', 'X', 'C', 'U', 'P', 'F']
const COL_LABELS = Array.from({ length: COLS }, (_, i) => i.toString(16).toUpperCase())

// 隐藏不可用的列索引（以 0 开始计数）：第 4、9、E 列 — 提前声明，避免在 getCardGrid 初始化时引用未定义变量
const HIDDEN_COLS = [4, 9, 14]

// 奖品列表（68个）
const { getPrizeConfig } = usePrizeConfig()
const allPrizes = computed(() => getPrizeConfig)


import { filterData } from '@/utils'
import { useViewModel } from './useViewModel'

// 集成三维抽奖逻辑
const vm = useViewModel()
const { setDefaultPersonList, enterLuckydraw, startLuckydraw, startLuckydrawForCard, stopLuckydraw, continueLuckydraw, quitLuckydraw, tableData, currentStatus, isInitialDone, containerRef, titleFont, titleFontSyncGlobal } = vm

// 同步当前卡牌数据到 three.js 的 tableData
function syncTableDataFromCardGrid() {
  // 构造最小数据结构供 initTableData / createTableVertices 使用
  const total = ROWS * COLS
  const arr = cardGrid.value.slice(0, total).map((c) => ({
    uid: c.label,
    name: c.prize?.name || '',
    department: c.prize?.name || '',
    identity: c.prize?.name || '',
    avatar: c.prize?.picture?.url || '',
    prizeId: c.prize?.id || '',
    prizeRaw: c.prize || null,
  }))
  // 确保有 x/y/id
  const table = filterData(arr, COLS)
  tableData.value = table
}

function startLuckydrawWrapper() {
  syncTableDataFromCardGrid()
  startLuckydraw()
}

// 卡牌数据结构（参考原始项目，x/y赋值，编号自适应）
function shuffle(arr: any[]) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function shuffleToDifferentPositions<T extends { col: number; row: number }>(positions: T[]) {
  if (positions.length < 2) return positions.slice()

  let targets = shuffle(positions.slice()) as T[]
  let attempts = 0

  while (
    attempts < 12
    && targets.some((target, index) => target.col === positions[index].col && target.row === positions[index].row)
  ) {
    targets = shuffle(positions.slice()) as T[]
    attempts++
  }

  if (targets.some((target, index) => target.col === positions[index].col && target.row === positions[index].row)) {
    return positions.slice(1).concat(positions[0]) as T[]
  }

  return targets
}

function getCardGrid(prizes: any[], revealedMap: Record<string, any>) {
  // 只在可见列分配数字与奖品（隐藏列不分配）
  const visibleCols = COLS - HIDDEN_COLS.length
  const visibleSlots = ROWS * visibleCols
  // 根据各奖品的 count 字段展开奖品池
  let prizePool: any[] = []
  if ((prizes || []).length > 0) {
    for (const prize of prizes) {
      const cnt = Math.max(1, prize.count || 1)
      for (let j = 0; j < cnt; j++) prizePool.push(prize)
    }
    // 超出则截断；不足则用全部奖品随机补充
    if (prizePool.length > visibleSlots) {
      prizePool = prizePool.slice(0, visibleSlots)
    } else if (prizePool.length < visibleSlots) {
      const base = prizePool.slice()
      while (prizePool.length < visibleSlots) {
        prizePool.push(base[Math.floor(Math.random() * base.length)])
      }
    }
  }
  prizePool = shuffle(prizePool)

  // 构造竖向编号映射（从 01 到 visibleSlots），跳过隐藏列
  const numbers: string[] = Array.from({ length: visibleSlots }, (_, i) => String(i + 1).padStart(2, '0'))
  const labelMap: Record<string, string> = {}
  let numIdx = 0
  for (let c = 0; c < COLS; c++) {
    if (HIDDEN_COLS.includes(c)) continue
    for (let r = 0; r < ROWS; r++) {
      const key = `${r}_${c}`
      if (numIdx < numbers.length) {
        labelMap[key] = numbers[numIdx++]
      }
    }
  }

  // 生成卡牌：隐藏列不分配 prize 与 label
  const grid: any[] = []
  let prizeIdx = 0
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c
      const key = `${r}_${c}`
      const isHidden = HIDDEN_COLS.includes(c)
      const label = isHidden ? '' : (labelMap[key] || '')
      const prize = isHidden ? (revealedMap[key] || null) : (revealedMap[key] || prizePool[prizeIdx++] || null)
      const locked = !!revealedMap[key]
      grid.push({
        row: r,
        col: c,
        label,
        revealed: !!revealedMap[key],
        prize,
        locked,
        id: i,
      })
    }
  }
  return grid
}

// 恢复已揭晓的映射（持久化到 localStorage）
function loadPersistedRevealedMap() {
  try {
    const raw = localStorage.getItem('luckydraw:revealedMap')
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed || {}
    }
  }
  catch (e) {
    console.error('load persisted revealedMap failed', e)
  }
  return {}
}

const revealedMap = ref(loadPersistedRevealedMap())
const cardGrid = ref(getCardGrid(allPrizes.value, revealedMap.value))

// Flicker timers（用于 JS 驱动的明暗切换，确保使用来自配置的颜色）
const flickerTimers = new Map()
// 响应式状态映射：保存每张卡的当前明/暗状态，确保模板响应更新
const flickerState: Record<number, boolean> = reactive({})

function scheduleFlickerForCard(card: any) {
  // 不为已揭晓或隐藏列的卡牌调度
  if (!card || card.revealed || HIDDEN_COLS.includes(card.col)) return
  // debugCardColor removed to avoid console spam
  // 初始化状态
  if (typeof flickerState[card.id] === 'undefined') flickerState[card.id] = Math.random() > 0.5
  // 清除已有定时器
  if (flickerTimers.has(card.id)) {
    clearTimeout(flickerTimers.get(card.id))
    flickerTimers.delete(card.id)
  }
  // 更随机化并基于位置轻微偏移初始延迟，避免整体同步
  const initialDelay = 200 + Math.random() * 1400 + (card.row * 40 + card.col * 25)
  const interval = 700 + Math.random() * 1600

  const starter = setTimeout(() => {
    // 首次切换
    try { flickerState[card.id] = !flickerState[card.id] } catch (e) {}
    // 创建周期切换
    const id = setInterval(() => {
      try { flickerState[card.id] = !flickerState[card.id] } catch (e) {}
    }, interval)
    flickerTimers.set(card.id, id)
  }, initialDelay)
  flickerTimers.set(card.id, starter)
}

function stopFlickers() {
  for (const id of flickerTimers.values()) {
    try { clearTimeout(id) } catch (e) {}
    try { clearInterval(id) } catch (e) {}
  }
  flickerTimers.clear()
}

function startFlickers() {
  if (typeof stopFlickers === 'function') stopFlickers()
  ;(cardGrid.value || []).forEach((card: any) => scheduleFlickerForCard(card))
}

// ===== 翻牌预览 + 洗牌动画 =====
const previewPhase = ref<'idle' | 'revealing' | 'shuffling' | 'restoring'>('idle')
const previewFlipDelay: Record<number, number> = reactive({})

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

async function runPreviewThenLuckydraw(cardIdx: number) {
  if (previewPhase.value !== 'idle') return
  stopFlickers()

  // 阶段1：翻开所有非隐藏、未揭晓的卡牌（波浪式延迟）
  cardGrid.value.forEach((card: any) => {
    if (!HIDDEN_COLS.includes(card.col) && !card.revealed) {
      const step = (card.row * COLS + card.col) % 30
      previewFlipDelay[card.id] = step * 20 // 0~580ms 阶梯
    }
  })
  previewPhase.value = 'revealing'
  await sleep(1400) // max stagger 580ms + transition 500ms + buffer

  // 阶段2：洗牌动画（弹跳波浪，保持翻开状态）
  previewPhase.value = 'shuffling'
  await sleep(1200) // 动画 600ms + 最大延迟 450ms + buffer

  // 阶段3：随机翻回正面
  cardGrid.value.forEach((card: any) => {
    if (!HIDDEN_COLS.includes(card.col) && !card.revealed) {
      previewFlipDelay[card.id] = Math.floor(Math.random() * 500)
    }
  })
  previewPhase.value = 'restoring'
  await sleep(1200) // max stagger 500ms + transition 500ms + buffer

  // 完成，恢复常态并触发抽奖
  previewPhase.value = 'idle'
  startFlickers()
  syncTableDataFromCardGrid()
  if (vm && vm.startLuckydrawForCard) vm.startLuckydrawForCard(cardIdx)
}

function rebindPrizes() {
  // 按剩余量（count - isUsedCount）重新分配未揭晓格子
  try {
    const remaining = (allPrizes.value || []).map((p: any) => ({
      ...p,
      count: Math.max(0, (p.count || 1) - (p.isUsedCount || 0)),
    })).filter((p: any) => p.count > 0)
    cardGrid.value = getCardGrid(
      remaining.length > 0 ? remaining : allPrizes.value,
      revealedMap.value
    )
  }
  catch (err) {
    console.error('rebindPrizes failed', err)
    cardGrid.value = getCardGrid(allPrizes.value, revealedMap.value)
  }
}

// 当 cardGrid 改变时（比如重绑定奖品），重新调度 flicker
watch(cardGrid, () => {
  startFlickers()
}, { deep: true })

import useStore from '@/store'
import { ref as vueRef } from 'vue'
const { personConfig } = useStore()
// 全局中奖记录（Pinia）
if (!(personConfig as any).winRecords) (personConfig as any).winRecords = vueRef([])


// 行列头样式
// 卡片尺寸：优先使用全局配置 `getCardSize`（但做范围钳制），否则根据窗口宽度自适应并限制在合理范围
const { width: windowWidth } = useWindowSize()
const cardSizeConfig = computed(() => {
  const minSize = 48
  const maxSize = 72
  // 如果全局配置存在，优先使用但进行范围钳制，防止被过大的主题值覆盖
  if (getCardSize && getCardSize.value) {
    const raw = getCardSize.value
    const w = Math.max(minSize, Math.min(maxSize, Math.floor(raw.width)))
    const h = Math.max(minSize, Math.min(maxSize, Math.floor(raw.height)))
    const size = Math.min(w, h)
    return { width: size, height: size }
  }

  const sidebars = 440 // 左右各 220 的预留
  const padding = 40
  const available = Math.max(480, (windowWidth.value || 1200) - sidebars - padding)
  const w = Math.floor(available / COLS) - 6
  // 进一步缩小卡牌尺寸范围以适配侧栏与标题
  const size = Math.max(minSize, Math.min(maxSize, w))
  return { width: size, height: size }
})
const cardWidth = computed(() => cardSizeConfig.value.width)
const cardHeight = computed(() => cardSizeConfig.value.height)
// 将隐藏列声明移动到文件开头，避免重复声明
// 将抽奖区向右移动若干列（以卡牌宽度为单位），默认移动 0 列（整体左移一个卡牌位置）
const GRID_OFFSET_COLS = 0
const gridOffsetX = computed(() => (cardWidth.value + 6) * GRID_OFFSET_COLS)
const gridLeftBase = computed(() => cardWidth.value + gridOffsetX.value)

onMounted(() => {
  // 监听抽奖结束事件以同步揭晓状态
  window.addEventListener('luckydraw:end', onLuckydrawEnd)
  // 当抽奖确认并继续后，页面层需返回初始展示模式
  window.addEventListener('luckydraw:returnToShowcase', returnToShowcase)
  startFlickers()
})
onBeforeUnmount(() => {
  window.removeEventListener('luckydraw:end', onLuckydrawEnd)
  window.removeEventListener('luckydraw:returnToShowcase', returnToShowcase)
  stopFlickers()
})

function onLuckydrawEnd(e: any) {
  try {
    const detail = e.detail || {}
    const idx = typeof detail.index === 'number' ? detail.index : null
    if (idx === null) return
    const row = Math.floor(idx / COLS)
    const col = idx % COLS
    const key = `${row}_${col}`
    // 将该格设置为已揭晓，绑定当前 cardGrid 的 prize
    let prize = cardGrid.value[idx] && cardGrid.value[idx].prize ? cardGrid.value[idx].prize : null
    // 回退：如果 cardGrid 中没有 prize（可能因为同步顺序问题），尝试使用事件中携带的 person 数据
    if (!prize && detail.person) {
      prize = detail.person
      console.warn('[onLuckydrawEnd] prize not found in cardGrid — using event.person as fallback')
    }
    if (prize) {
      revealedMap.value[key] = prize
    }
  }
  catch (err) {
    // ignore
  }
}
// 图片加载失败回退：将无法加载的远程图片替换为内联 SVG 占位图
function onPrizeImgError(e: Event) {
  try {
    const img = e.target as HTMLImageElement
    if (!img) return
    // 防止重复替换
    if ((img as any).__fallbackApplied) return
    ;(img as any).__fallbackApplied = true
    // 使用仓库中的静态占位图（PNG 优先），若不存在再回退到内联 SVG
    img.src = '/static/images/placeholder.png'
    img.onerror = () => {
      try {
        img.onerror = null
        img.src = '/static/images/placeholder.svg'
      }
      catch (e) {}
    }
  }
  catch (err) {
    // ignore
  }
}
const cardLabelFontScale = 0.45 // 编号最大字号比例

// ===== 应用模式 =====
// showcase: 展示模式，所有卡牌显示奖品图片
// entering: 过渡动画（洗牌）
// luckydraw: 抽奖模式，卡牌显示编号，可点击抽奖
const appMode = ref<'showcase' | 'entering' | 'luckydraw'>('showcase')
const shuffleOffset = reactive<Record<number, { x: number; y: number; rt?: string; s?: number; td?: number }>>({})

async function enterNewLuckydraw() {
  if (appMode.value !== 'showcase') return
  appMode.value = 'entering'
  stopFlickers()
  await nextTick()

  const GAP = 6
  // 只对可见（非隐藏列、未揭晓）的卡牌做位置互换洗牌
  const visibleCards = cardGrid.value.filter(
    (c: any) => !HIDDEN_COLS.includes(c.col) && !c.revealed
  )

  // 5 轮洗牌：每轮先 Fisher-Yates 打乱，奇数轮再额外打乱一次避免重复规律
  // 同时确保每张卡都移动（不原地不动）
  const ROUNDS = 5
  for (let round = 0; round < ROUNDS; round++) {
    const positions = visibleCards.map((c: any) => ({ col: c.col, row: c.row }))
    let targets = shuffleToDifferentPositions(positions)
    if (round % 2 === 1) targets = shuffle(targets)
    targets = shuffleToDifferentPositions(targets)
    visibleCards.forEach((card: any, i: number) => {
      const tgt = targets[i]
      const dx = (tgt.col - card.col) * (cardWidth.value + GAP)
      const dy = (tgt.row - card.row) * (cardHeight.value + GAP)
      const angle = (Math.random() * 60 - 30) + (round % 2 === 0 ? 15 : -15)
      const scale = 0.8 + Math.random() * 0.4
      const td = Math.floor(Math.random() * 280)
      shuffleOffset[card.id] = { x: dx, y: dy, rt: `${angle}deg`, s: scale, td }
    })
    try { window.dispatchEvent(new CustomEvent('shuffle:round', { detail: { round } })) } catch (e) {}
    await sleep(660)
  }

  // 归位：飞向新随机排列（而非原始格子），让玩家看到洗牌有实际效果
  const visPositions = visibleCards.map((c: any) => ({ col: c.col, row: c.row }))
  const finalTargets = shuffleToDifferentPositions(visPositions)
  visibleCards.forEach((card: any, i: number) => {
    const tgt = finalTargets[i]
    const dx = (tgt.col - card.col) * (cardWidth.value + GAP)
    const dy = (tgt.row - card.row) * (cardHeight.value + GAP)
    shuffleOffset[card.id] = { x: dx, y: dy, rt: '0deg', s: 1, td: 0 }
  })
  await sleep(560)

  // 内容与位置同时切换（奖品图片→数字），视觉上无回位感
  visibleCards.forEach((card: any) => { delete shuffleOffset[card.id] })
  rebindPrizes()
  await nextTick()

  appMode.value = 'luckydraw'
  startFlickers()
  syncTableDataFromCardGrid()
}

function returnToShowcase() {
  stopFlickers()
  appMode.value = 'showcase'
  rebindPrizes()
}

function onCardClick(card: any) {
  if (HIDDEN_COLS.includes(card.col)) return
  // 展示/过渡模式下不响应点击
  if (appMode.value === 'showcase' || appMode.value === 'entering') return
  // 抽奖模式下，点击已揭晓卡牌 → 返回展示模式
  if (card.revealed) {
    returnToShowcase()
    return
  }
  if (card.locked) return
  if (previewPhase.value !== 'idle') return
  const idx = card.row * COLS + card.col
  // 直接进入 three.js 抽奖流程：同步 tableData 并调用 startLuckydrawForCard
  syncTableDataFromCardGrid()
  if (vm && vm.startLuckydrawForCard) vm.startLuckydrawForCard(idx)
}

// revealedMap 变化时只做持久化——不触发 rebindPrizes（避免抽奖中途误刷格子）
import { watch } from 'vue'
watch(revealedMap, (val) => {
  try {
    if (!val || Object.keys(val).length === 0) {
      localStorage.removeItem('luckydraw:revealedMap')
    }
    else {
      localStorage.setItem('luckydraw:revealedMap', JSON.stringify(val))
    }
  }
  catch (e) {
    console.error('persist revealedMap failed', e)
  }
}, { deep: true })

const globalConfig = useStore().globalConfig
const { getTopTitle: topTitle, getTextColor: textColor, getTextSize: textSize, getBackground: homeBackground, getPatternList, getPatterColor, getCardColor, getRowCount, getCardSize, getLuckyColor } = storeToRefs(globalConfig)
// computed wrappers to normalize types for template usage
const getPatterColorVal = computed(() => ((getPatterColor as any)?.value) || '#1b66c9')
const getCardColorVal = computed(() => ((getCardColor as any)?.value) || '#ff79c6')
const luckyColorVal = computed(() => ((getLuckyColor as any)?.value) || 'rgb(255, 215, 0)')
const currentStatusLocal = computed(() => (currentStatus as any)?.value ?? (currentStatus as any))
const tableDataLocal = computed(() => (tableData as any)?.value ?? (tableData as any))

function cardIsPattern(card: any) {
  const patternList = (getPatternList && getPatternList.value) || []
  const colsInPattern = COLS // 固定与主页面列数一致（15）
  // pattern numbering：按行主序（行优先），columns = COLS，rows = 5
  const patternNum = card.row * colsInPattern + (card.col + 1)
  return patternList.includes(patternNum)
}

function cardBackgroundStyle(card: any) {
  if (card.revealed) return '#fff'
  const isPattern = cardIsPattern(card)
  const patternColor = getPatterColorVal.value || '#1b66c9'
  const cardColor = getCardColorVal.value || '#ff79c6'
  const base = isPattern ? patternColor : cardColor
  // 简单渐变：使用 base 作为主色，末端使用半透明黑以制造深色效果
  return `linear-gradient(135deg, ${base} 0%, ${base} 100%)`
}

// 颜色工具：兼容 #hex 与 rgb(a) 格式，按比例加深或变亮（percent 负为变暗，正为变亮）
function shadeColor(color: any, percent: number) {
  if (!color) return color
  // parse rgb(a)
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i)
  let r, g, b
  if (rgbMatch) {
    r = parseInt(rgbMatch[1], 10)
    g = parseInt(rgbMatch[2], 10)
    b = parseInt(rgbMatch[3], 10)
  } else {
    // try hex
    let c = color.replace('#', '')
    if (c.length === 3) c = c.split('').map((s: string) => s + s).join('')
    const num = parseInt(c, 16)
    if (isNaN(num)) return color // cannot parse, return original
    r = (num >> 16) & 0xFF
    g = (num >> 8) & 0xFF
    b = num & 0xFF
  }
  const p = percent / 100
  const newR = Math.round(Math.min(255, Math.max(0, r + (p * (255 - r)) )))
  const newG = Math.round(Math.min(255, Math.max(0, g + (p * (255 - g)) )))
  const newB = Math.round(Math.min(255, Math.max(0, b + (p * (255 - b)) )))
  return `rgb(${newR}, ${newG}, ${newB})`
}

function getBaseColor(card: any) {
  const isPattern = cardIsPattern(card)
  return isPattern ? (((getPatterColor as any) && (getPatterColor as any).value) || '#1b66c9') : (((getCardColor as any) && (getCardColor as any).value) || '#ff79c6')
}

// 生成用于绑定到 card-content 的样式变量与属性（包括随机 flicker 延迟）
function getCardStyleVars(card: any) {
  const base = getBaseColor(card)
  const light = shadeColor(base, 35) // 增大对比度
  const dark = shadeColor(base, -30)
  const flickerOn = typeof flickerState[card.id] === 'undefined' ? Math.random() > 0.5 : !!flickerState[card.id]
  const luckyBg = luckyColorVal.value
  const bg = card.revealed ? luckyBg : (flickerOn ? `linear-gradient(180deg, ${light} 0%, ${dark} 100%)` : `linear-gradient(180deg, ${dark} 0%, ${light} 100%)`)
  const borderCol = card.revealed ? luckyBg : (getCardColorVal.value || base)
  // 生成一个稳定随机的延迟以避免所有卡同时闪烁
  const seed = (card.row * 31 + card.col * 17) % 11
  const delay = (seed / 10) + Math.random() * 0.6
  return {
    background: bg,
    border: `2px solid ${borderCol}`,
    boxShadow: card.revealed ? `0 0 10px 3px ${luckyBg}88` : `0 2px 8px rgba(0,0,0,0.08)`,
    cursor: card.revealed ? 'pointer' : undefined,
    ['--card-light']: light,
    ['--card-dark']: dark,
    animationDelay: `${delay}s`
  }
}

// `isInitialDone` 由 useViewModel 提供并已解构为同名变量，直接使用即可
</script>

<template>
  <HeaderTitle
      :table-data="cardGrid || []"
    :text-size="textSize"
    :text-color="textColor"
    :top-title="topTitle"
    :set-default-person-list="setDefaultPersonList"
    :is-initial-done="isInitialDone"
    :title-font="titleFont"
    :title-font-sync-global="titleFontSyncGlobal"
  />
  <div class="luckydraw-area">
    <!-- 展示模式：进入抽奖按钮 -->
    <div id="menu">
      <div class="start">
        <button v-if="appMode === 'showcase'" class="btn-stars" @click="enterNewLuckydraw">
          <strong>进入抽奖</strong>
          <div id="container-stars"><div id="stars"/></div>
          <div id="glow"><div class="circle"/><div class="circle"/></div>
        </button>
      </div>
    </div>
    <div class="luckydraw-table" :style="{ width: `${COLS * cardWidth + (COLS - 1) * 6}px`, height: `${ROWS * cardHeight + (ROWS - 1) * 6}px` }">
      <!-- 卡牌区域 -->
      <div class="grid-area" :style="{ left: `${cardWidth / 2}px`, top: '0px', width: `${COLS * cardWidth + (COLS - 1) * 6}px`, height: `${ROWS * cardHeight + (ROWS - 1) * 6}px`, ['--card-size']: `${cardWidth}px` }">
        <div
          v-for="card in cardGrid"
          :key="card.id"
          class="grid-cell card"
          :class="{
            revealed: card.revealed,
            locked: card.locked,
            'col-hidden': HIDDEN_COLS.includes(card.col),
            'is-shuffling': appMode === 'entering',
          }"
          :data-pos="`${card.row}_${card.col}`"
          :style="{
            gridColumnStart: card.col + 1,
            gridRowStart: card.row + 1,
            cursor: (card.revealed && appMode === 'luckydraw') ? 'pointer' : (!card.locked && appMode === 'luckydraw' && previewPhase === 'idle' && !HIDDEN_COLS.includes(card.col)) ? 'pointer' : 'default',
            '--tx': shuffleOffset[card.id] ? `${shuffleOffset[card.id].x}px` : '0px',
            '--ty': shuffleOffset[card.id] ? `${shuffleOffset[card.id].y}px` : '0px',
            '--rt': shuffleOffset[card.id] ? (shuffleOffset[card.id].rt || '0deg') : '0deg',
            '--s': shuffleOffset[card.id] ? (shuffleOffset[card.id].s || 1) : 1,
            transitionDelay: shuffleOffset[card.id] ? `${shuffleOffset[card.id].td || 0}ms` : '0ms',
            zIndex: shuffleOffset[card.id] ? 12 : undefined,
          }"
          @click="onCardClick(card)"
        >
          <!-- 已揭晓的卡牌：展示奖品，抽奖模式下点击可返回展示模式 -->
          <template v-if="card.revealed">
            <div class="card-frame revealed-frame" :style="{ ['--lucky-border']: luckyColorVal }">
              <div class="card-content" :style="getCardStyleVars(card)">
                <ImageSync
                  v-if="card.prize && card.prize.picture"
                  :img-item="card.prize.picture"
                  class="prize-img full-img"
                  :alt="card.prize && card.prize.name ? card.prize.name : '奖品图片'"
                  @error="onPrizeImgError"
                />
                <span v-else style="color:#b8860b;font-size:1.4em;">🏆</span>
              </div>
            </div>
          </template>
          <!-- 展示模式（未揭晓、非隐藏）：显示奖品图片 -->
          <template v-else-if="appMode !== 'luckydraw' && !HIDDEN_COLS.includes(card.col)">
            <div class="card-frame" :style="{ ['--frame-colors']: (cardIsPattern(card) ? (getPatterColorVal.value || '#1b66c9') : (getCardColorVal.value || '#ff79c6')) }">
              <div class="card-content showcase-card-content">
                <ImageSync
                  v-if="card.prize && card.prize.picture"
                  :img-item="card.prize.picture"
                  class="prize-img full-img"
                  :alt="card.prize && card.prize.name ? card.prize.name : ''"
                  @error="onPrizeImgError"
                />
                <div v-else class="showcase-placeholder">🎁</div>
              </div>
            </div>
          </template>
          <!-- 抽奖模式（未揭晓、非隐藏）：翻牌结构（正面=牌背编号，背面=奖品预览） -->
          <template v-else-if="!HIDDEN_COLS.includes(card.col)">
            <div
              class="card-flipper"
              :class="{
                'preview-flipped': previewPhase === 'revealing' || previewPhase === 'shuffling',
                'shuffle-spin': previewPhase === 'shuffling',
              }"
              :style="{
                transitionDelay: (previewPhase === 'revealing' || previewPhase === 'restoring')
                  ? `${previewFlipDelay[card.id] || 0}ms` : '0ms',
                animationDelay: previewPhase === 'shuffling'
                  ? `${((card.row * COLS + card.col) * 25) % 450}ms` : '0ms',
              }"
            >
              <!-- 正面：牌背（编号 + 水印） -->
              <div class="card-face card-face-front">
                <div class="card-frame" :style="{ ['--frame-colors']: (cardIsPattern(card) ? (getPatterColorVal.value || '#1b66c9') : (getCardColorVal.value || '#ff79c6')) }">
                  <div class="card-content" :style="getCardStyleVars(card)">
                    <span class="card-watermark">DDC</span>
                    <span class="card-label" :style="{ fontSize: `${cardHeight * cardLabelFontScale}px`, color: '#fff', fontWeight: 'bold', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative', zIndex: 2, display: 'inline-block' }" :title="card.label">{{ card.label }}</span>
                  </div>
                </div>
              </div>
              <!-- 背面：奖品图片（仅翻牌预览阶段可见） -->
              <div class="card-face card-face-back">
                <div class="prize-back-content">
                  <ImageSync
                    v-if="card.prize && card.prize.picture"
                    :img-item="card.prize.picture"
                    class="prize-img full-img"
                    :alt="card.prize && card.prize.name ? card.prize.name : '奖品图片'"
                    @error="onPrizeImgError"
                  />
                  <span v-else style="color:#b8860b;font-size:1.4em;">🎁</span>
                </div>
              </div>
            </div>
          </template>
          <!-- 隐藏列：不渲染内容，由 col-hidden CSS 控制占位 -->
        </div>
      </div>
    </div>
  </div>
    <StarsBackground :home-background="homeBackground" />
    <!-- three.js 渲染容器（用于球体/动画） -->
    <div ref="containerRef" class="threejs-container" style="position: absolute; inset: 0; pointer-events: none; z-index: 5"></div>
  <!-- 左侧奖项面板已移除 -->
</template>

<style scoped lang="scss">
.luckydraw-area {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  min-height: 700px;
}
.luckydraw-table {
  position: relative;
  background: transparent;
}
.cell {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0.9em;
  user-select: none;
}
/* 行列头已移除 */
// 卡牌样式
.card {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: box-shadow 0.2s, transform 0.2s, background 0.2s;
  z-index: 1;
  overflow: hidden;
  padding: 0;
}
.card:not(.revealed) {
  position: relative;
  transform-origin: center;
  will-change: transform, box-shadow;
}
.card:not(.revealed) .card-watermark {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) rotate(-20deg);
  font-size: calc(var(--card-size) * 0.45);
  color: rgba(255,255,255,0.14);
  font-weight: bold;
  pointer-events: none;
  user-select: none;
  z-index: 1;
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.card:not(.revealed):hover {
  filter: brightness(1.06);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}

/* 闪烁动画 */
.card:not(.revealed):not(.is-shuffling) {
  animation: pulse 1.6s infinite alternate;
}
@keyframes pulse {
  from { transform: translateY(0); box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
  to { transform: translateY(-4px); box-shadow: 0 8px 20px rgba(0,0,0,0.12); }
}
/* 洗牌动画：强制关闭 pulse、应用位移 transform */
.grid-cell.card.is-shuffling {
  animation: none !important;
  transform: translate(var(--tx, 0px), var(--ty, 0px)) rotate(var(--rt, 0deg)) scale(var(--s, 0.85)) !important;
  transition: transform 0.52s cubic-bezier(0.22, 0.61, 0.36, 1.0), box-shadow 0.28s !important;
  will-change: transform;
  box-shadow: 0 10px 30px rgba(0,0,0,0.18);
}
.grid-area {
  position: absolute;
  display: grid;
  grid-template-columns: repeat(15, var(--card-size));
  grid-template-rows: repeat(6, var(--card-size));
  gap: 6px;
  z-index: 1;
}

/* card frame for animated rainbow border (match left-side prize border effect) */
.card-frame {
  position: absolute;
  inset: 0;
  padding: 2px; /* thinner border */
  border-radius: calc(var(--card-size) * 0.12);
  overflow: clip;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-frame::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 400%;
  height: 100%;
  background: linear-gradient(115deg, #4fcf70, #fad648, #a767e5, #12bcfe, #44ce7b);
  background-size: 25% 100%;
  z-index: -1;
  transform: translateX(0%);
  animation: frameBorderFlow .9s linear infinite;
}
.card-frame::after {
  content: "";
  position: absolute;
  inset: 2px; /* match thinner padding */
  border-radius: calc(var(--card-size) * 0.09);
  z-index: -1;
  background: transparent;
}
.card-content {
  width: 100%;
  height: 100%;
  border-radius: calc(var(--card-size) * 0.1);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}
@keyframes frameBorderFlow {
  to { transform: translateX(-25%); }
}

/* 左侧开关已移除 */
.grid-cell {
  box-sizing: border-box;
  width: var(--card-size);
  height: var(--card-size);
  display: flex;
  justify-content: center;
  align-items: center;
}
.card.revealed {
  /* 背景和边框由 getCardStyleVars 动态注入 luckyColor */
  transition: box-shadow 0.3s;
}
/* 已揭晓卡牌特殊边框动画 */
.card.revealed .revealed-frame::before {
  background: linear-gradient(115deg, var(--lucky-border, #ffd700), #fff, var(--lucky-border, #ffd700), #fff, var(--lucky-border, #ffd700));
}
/* 已揭晓卡牌：图片绝对定位以填满整张卡牌 */
.card.revealed .card-content {
  position: relative;
  padding: 0;
}
.card.revealed .prize-img.full-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  border-radius: inherit;
  padding: 4px;
  box-sizing: border-box;
  background: transparent;
}
/* 展示模式卡牌内容区蒙白底 */
.card-content.showcase-card-content {
  background: #ffffff !important;
  animation: none;
}
.showcase-placeholder {
  font-size: 2em;
  opacity: 0.7;
  pointer-events: none;
  user-select: none;
}
/* 进入抽奖按钮 */
.btn-enter-luckydraw {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  padding: 10px 32px;
  font-size: 1.1rem;
  font-weight: bold;
  color: #fff;
  background: linear-gradient(135deg, #1b66c9 0%, #5533ff 100%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(27,102,201,0.4);
  transition: filter 0.15s, box-shadow 0.15s, transform 0.15s;
  letter-spacing: 0.1em;
}
.btn-enter-luckydraw:hover {
  filter: brightness(1.1);
  box-shadow: 0 6px 24px rgba(27,102,201,0.55);
  transform: translateX(-50%) translateY(-2px);
}
.card.locked {
  pointer-events: none;
}
.card.highlight {
  background: #ffe066 !important;
  box-shadow: 0 0 16px 4px #ffd70099;
  transition: background 0.3s, box-shadow 0.3s;
}
.card-label {
  color: #fff;
  font-weight: bold;
  text-shadow: 0 1px 4px rgba(0,0,0,0.25);
  display: inline-block;
  line-height: 1;
}
.card-label {
  animation: labelFlash 1.6s infinite linear;
}
@keyframes labelFlash {
  0% { opacity: 1; text-shadow: 0 1px 6px rgba(255,255,255,0.08); }
  50% { opacity: 0.6; text-shadow: 0 1px 2px rgba(0,0,0,0.15); }
  100% { opacity: 1; text-shadow: 0 1px 6px rgba(255,255,255,0.08); }
}

/* 颜色闪烁：在 card-content 上使用两个变量做渐变并交替 */
.card:not(.revealed) .card-content {
  /* JS 控制背景切换，不使用 keyframes 以确保基色来自配置 */
}

/* 隐藏指定列的卡牌内容并禁止交互（保留占位格子） */
.grid-cell.col-hidden {
  pointer-events: none;
  /* 保留格子位置但使用背景色填充，可在这里修改默认背景色或改为使用全局设置变量 */
  background: var(--hidden-cell-bg, rgba(16,16,24,0.12));
}
/* 隐藏所有内部可见内容，但保留格子大小与边距 */
.grid-cell.col-hidden .card-frame,
.grid-cell.col-hidden .card-content {
  display: none !important;
}

/* 隐藏页面网格（球体展示时） */
.luckydraw-table.hidden-during-sphere {
  visibility: hidden;
}
.prize-img.full-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  border-radius: 0;
  display: block;
  margin: 0;
  background: transparent;
  box-shadow: none;
}

/* ===== 翻牌预览动画 ===== */
/* 允许 3D 透视；用 overflow:visible 避免 preserve-3d 被裁切 */
.grid-cell.card {
  perspective: 800px;
  overflow: visible !important;
}
.card-flipper {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.5s ease-in-out;
}
.card-flipper.preview-flipped {
  transform: rotateY(180deg);
}
/* 每张卡牌保持互相独立的 backface */
.card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  overflow: hidden;
  border-radius: calc(var(--card-size) * 0.1);
}
.card-face-front {
  /* 正面无需额外 transform */
}
.card-face-back {
  transform: rotateY(180deg);
}
.prize-back-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: calc(var(--card-size) * 0.1);
  overflow: hidden;
}
/* 洗牌阶段：保持翻开状态同时做弹跳波浪效果 */
.card-flipper.shuffle-spin {
  animation: cardShuffleBounce 0.6s ease-in-out;
}
@keyframes cardShuffleBounce {
  0%   { transform: rotateY(180deg) translateY(0)    scale(1);    }
  25%  { transform: rotateY(180deg) translateY(-9px) scale(0.86); }
  65%  { transform: rotateY(180deg) translateY(4px)  scale(1.05); }
  100% { transform: rotateY(180deg) translateY(0)    scale(1);    }
}
</style>
