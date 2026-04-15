import type { Material, Object3D } from 'three'
import type { TargetType } from './type'
import type { IPersonConfig } from '@/types/storeType'
import * as TWEEN from '@tweenjs/tween.js'
import localforage from 'localforage'
import { storeToRefs } from 'pinia'
import { PerspectiveCamera, Scene } from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three-css3d'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useToast } from 'vue-toast-notification'
import dongSound from '@/assets/audio/end.mp3'
import enterAudio from '@/assets/audio/enter.wav'
import worldCupAudio from '@/assets/audio/worldcup.mp3'
import { CONFETTI_FIRE_MAX_COUNT, SINGLE_TIME_MAX_PERSON_COUNT } from '@/constant/config'
import { useElementPosition, useElementStyle } from '@/hooks/useElement'
import i18n from '@/locales/i18n'
import useStore from '@/store'
import { selectCard } from '@/utils'
import { rgba } from '@/utils/color'
import { LotteryStatus } from './type'
import { confettiFire, createSphereVertices, createTableVertices, getRandomElements, initTableData } from './utils'

const maxAudioLimit = 10
export function useViewModel() {
    const toast = useToast()
    // store里面存储的值
    const { personConfig, globalConfig, prizeConfig } = useStore()
    const {
        getAllPersonList: allPersonList,
        getNotPersonList: notPersonList,
        getNotThisPrizePersonList: notThisPrizePersonList,
    } = storeToRefs(personConfig)
    const { getCurrentPrize: currentPrize } = storeToRefs(prizeConfig)
    const {
        getCardColor: cardColor,
        getPatterColor: patternColor,
        getPatternList: patternList,
        getTextColor: textColor,
        getLuckyColor: luckyColor,
        getCardSize: cardSize,
        getTextSize: textSize,
        getRowCount: rowCount,
        getIsShowAvatar: isShowAvatar,
        getTitleFont: titleFont,
        getTitleFontSyncGlobal: titleFontSyncGlobal,
        getDefiniteTime: definiteTime,
        getWinMusic: isPlayWinMusic,
        getMusicList: musicList,
    } = storeToRefs(globalConfig)
    // three初始值
    const ballRotationY = ref(0)
    const containerRef = ref<HTMLElement>()
    const canOperate = ref(true)
    const cameraZ = ref(3000)
    const scene = ref()
    const camera = ref()
    const renderer = ref()
    const controls = ref()
    const objects = ref<any[]>([])
    const targets: TargetType = {
        grid: [],
        helix: [],
        table: [],
        sphere: [],
    }
    // 页面数据初始值
    const currentStatus = ref<LotteryStatus>(LotteryStatus.init) // 0为初始状态， 1为抽奖准备状态，2为抽奖中状态，3为抽奖结束状态
    const tableData = ref<any[]>([])
    const luckyTargets = ref<any[]>([])
    const luckyCardList = ref<number[]>([])
    const luckyCount = ref(10)
    const personPool = ref<IPersonConfig[]>([])
    const intervalTimer = ref<any>(null)
    const autoStopTimer = ref<any>(null)
    const isInitialDone = ref<boolean>(false)
    const animationFrameId = ref<any>(null)
    const playingAudios = ref<HTMLAudioElement[]>([])
    const preselectedCardIndex = ref<number | null>(null)
    // 全局点击停止处理
    function onAnyClickStop(e: MouseEvent) {
        // 如果正在抽奖并处于 running 状态，则点击任意处停止抽奖
        if (currentStatus.value === LotteryStatus.running) {
            stopLottery()
        }
    }

    // 抽奖音乐相关
    const lotteryMusic = ref<HTMLAudioElement | null>(null)
    const lotteryMusicObjectUrl = ref<string | null>(null)

    function initThreeJs() {
        const felidView = 40
        const width = window.innerWidth
        const height = window.innerHeight
        const aspect = width / height
        const nearPlane = 1
        const farPlane = 10000
        const WebGLoutput = containerRef.value

        scene.value = new Scene()
        camera.value = new PerspectiveCamera(felidView, aspect, nearPlane, farPlane)
        camera.value.position.z = cameraZ.value
        renderer.value = new CSS3DRenderer()
        renderer.value.setSize(width, height * 0.9)
        renderer.value.domElement.style.position = 'absolute'
        // 垂直居中
        renderer.value.domElement.style.paddingTop = '50px'
        renderer.value.domElement.style.top = '50%'
        renderer.value.domElement.style.left = '50%'
        renderer.value.domElement.style.transform = 'translate(-50%, -50%)'
        WebGLoutput!.appendChild(renderer.value.domElement)

        controls.value = new TrackballControls(camera.value, renderer.value.domElement)
        controls.value.rotateSpeed = 1
        controls.value.staticMoving = true
        controls.value.minDistance = 500
        controls.value.maxDistance = 6000
        controls.value.addEventListener('change', render)

        // 初始创建对象由 createObjectsFromTableData 处理，以便后续可重建
        createObjectsFromTableData()
        // 创建横铺的界面（根据当前 objects / tableData）
        const tableVertices = createTableVertices({ tableData: tableData.value, rowCount: rowCount.value, cardSize: cardSize.value })
        targets.table = tableVertices
        // 创建球体
        const sphereVertices = createSphereVertices({ objectsLength: objects.value.length })
        targets.sphere = sphereVertices
        window.addEventListener('resize', onWindowResize, false)
        transform(targets.table, 1000)
        render()
    }

    /**
     * @description: 根据当前 tableData 重建 three.js 对象（CSS3D 元素）
     */
    function createObjectsFromTableData() {
        // 清理旧对象
        if (objects.value && objects.value.length) {
            objects.value.forEach((object) => {
                if (object.element) object.element.remove()
                if (scene.value && object) scene.value.remove(object)
            })
            objects.value = []
        }

        const tableLen = tableData.value.length
        for (let i = 0; i < tableLen; i++) {
            let element = document.createElement('div')
            element.className = 'element-card'

            const number = document.createElement('div')
            number.className = 'card-id'
            number.textContent = tableData.value[i].uid
            if (isShowAvatar.value)
                number.style.display = 'none'
            element.appendChild(number)

            const symbol = document.createElement('div')
            symbol.className = 'card-name'
            symbol.textContent = tableData.value[i].name
            if (isShowAvatar.value)
                symbol.className = 'card-name card-avatar-name'
            element.appendChild(symbol)

            const detail = document.createElement('div')
            detail.className = 'card-detail'
            detail.innerHTML = `${tableData.value[i].department || ''}<br/>${tableData.value[i].identity || ''}`
            if (isShowAvatar.value)
                detail.style.display = 'none'
            element.appendChild(detail)

            if (isShowAvatar.value) {
                const avatar = document.createElement('img')
                avatar.className = 'card-avatar'
                avatar.src = tableData.value[i].avatar
                avatar.alt = 'avatar'
                avatar.style.width = '140px'
                avatar.style.height = '140px'
                element.appendChild(avatar)
            }
            else {
                const avatarEmpty = document.createElement('div')
                avatarEmpty.style.display = 'none'
                element.appendChild(avatarEmpty)
            }

            element = useElementStyle({
                element,
                person: tableData.value[i],
                index: i,
                patternList: patternList.value,
                patternColor: patternColor.value,
                cardColor: cardColor.value,
                cardSize: cardSize.value,
                scale: 1,
                textSize: textSize.value,
                mod: 'default',
            },
            )
            const object = new CSS3DObject(element)
            object.position.x = Math.random() * 4000 - 2000
            object.position.y = Math.random() * 4000 - 2000
            object.position.z = Math.random() * 4000 - 2000
            scene.value.add(object)

            objects.value.push(object)
        }
        // 更新目标顶点
        targets.table = createTableVertices({ tableData: tableData.value, rowCount: rowCount.value, cardSize: cardSize.value })
        targets.sphere = createSphereVertices({ objectsLength: objects.value.length })
    }

    /**
     * @description: 针对某一张卡牌发起抽奖（预选卡位并触发球体旋转和停止）
     */
    async function startLotteryForCard(idx: number) {
        if (!canOperate.value) return
        // 确保 tableData 与 three.js 对象同步
        // 预选卡位
        preselectedCardIndex.value = idx
        // 将对应的奖项信息设为 luckyTargets，以便 stopLottery 使用
        luckyTargets.value = [tableData.value[idx] || {}]
        // card click 一次只抽取一个
        luckyCount.value = 1

        // 为避免上一次的 highligh/transform 残留，在每次抽奖前清理并重建 three.js 对象
        if (objects.value.length !== tableData.value.length || luckyCardList.value.length > 0) {
            createObjectsFromTableData()
            // 清理上一次的 lucky 列表，确保没有残留
            luckyCardList.value = []
        }

        // 隐藏页面网格，进入球体状态并启动转动
        try { document.querySelector('.lottery-table')?.classList.add('hidden-during-sphere') } catch (e) {}
        // 确保 renderer 可见
        try { if (renderer && renderer.value && renderer.value.domElement) renderer.value.domElement.style.display = '' } catch (e) {}
        await enterLottery()

        // 播放抽奖音乐并开始转动
        startLotteryMusic()
        currentStatus.value = LotteryStatus.running
        rollBall(10, 3000)

        // 自动在 3 秒后停止并展示中奖（不再需要用户二次点击）
        try { if (autoStopTimer.value) clearTimeout(autoStopTimer.value) } catch (e) {}
        autoStopTimer.value = setTimeout(() => {
            try {
                if (currentStatus.value === LotteryStatus.running) stopLottery()
            }
            catch (err) { console.error('auto stopLottery failed', err) }
        }, 3000)

        // 若配置了 definiteTime，则使用更长的配置时间为准（覆盖自动 3s）
        if (definiteTime.value) {
            const delay = definiteTime.value * 1000
            try { if (autoStopTimer.value) clearTimeout(autoStopTimer.value) } catch (e) {}
            autoStopTimer.value = setTimeout(() => {
                try {
                    if (currentStatus.value === LotteryStatus.running) stopLottery()
                }
                catch (err) { console.error('definiteTime stopLottery failed', err) }
            }, delay)
        }
    }
    function render() {
        if (renderer.value) {
            renderer.value.render(scene.value, camera.value)
        }
    }
    /**
     * @description: 位置变换
     * @param targets 目标位置
     * @param duration 持续时间
     */
    function transform(targets: any[], duration: number) {
        TWEEN.removeAll()
        if (intervalTimer.value) {
            clearInterval(intervalTimer.value)
            intervalTimer.value = null
            randomBallData('sphere')
        }

        return new Promise((resolve) => {
            const objLength = objects.value.length
            for (let i = 0; i < objLength; ++i) {
                const object = objects.value[i]
                const target = targets[i]
                new TWEEN.Tween(object.position)
                    .to({ x: target.position.x, y: target.position.y, z: target.position.z }, Math.random() * duration + duration)
                    .easing(TWEEN.Easing.Exponential.InOut)
                    .start()

                new TWEEN.Tween(object.rotation)
                    .to({ x: target.rotation.x, y: target.rotation.y, z: target.rotation.z }, Math.random() * duration + duration)
                    .easing(TWEEN.Easing.Exponential.InOut)
                    .start()
                    .onComplete(() => {
                        if (luckyCardList.value.length) {
                            luckyCardList.value.forEach((cardIndex: any) => {
                                const item = objects.value[cardIndex]
                                useElementStyle({
                                    element: item.element,
                                    person: {} as any,
                                    index: i,
                                    patternList: patternList.value,
                                    patternColor: patternColor.value,
                                    cardColor: cardColor.value,
                                    cardSize: cardSize.value,
                                    scale: 1,
                                    textSize: textSize.value,
                                    mod: 'sphere',
                                })
                            })
                        }
                        luckyTargets.value = []
                        luckyCardList.value = []
                        canOperate.value = true
                    })
            }

            // 这个补间用来在位置与旋转补间同步执行，通过onUpdate在每次更新数据后渲染scene和camera
            new TWEEN.Tween({})
                .to({}, duration * 2)
                .onUpdate(render)
                .start()
                .onComplete(() => {
                    canOperate.value = true
                    resolve('')
                })
        })
    }
    /**
     * @description: 窗口大小改变时重新设置渲染器的大小
     */
    function onWindowResize() {
        camera.value.aspect = window.innerWidth / window.innerHeight
        camera.value.updateProjectionMatrix()

        renderer.value.setSize(window.innerWidth, window.innerHeight)
        render()
    }

    /**
     * [animation update all tween && controls]
     */
    function animation() {
        TWEEN.update()
        if (controls.value) {
            controls.value.update()
        }
        // 设置自动旋转
        // 设置相机位置
        animationFrameId.value = requestAnimationFrame(animation)
    }
    /**
     * @description: 旋转的动画
     * @param rotateY 绕y轴旋转圈数
     * @param duration 持续时间，单位秒
     */
    function rollBall(rotateY: number, duration: number) {
        TWEEN.removeAll()

        return new Promise((resolve) => {
            scene.value.rotation.y = 0
            ballRotationY.value = Math.PI * rotateY * 1000
            const rotateObj = new TWEEN.Tween(scene.value.rotation)
            rotateObj
                .to(
                    {
                        // x: Math.PI * rotateX * 1000,
                        x: 0,
                        y: ballRotationY.value,
                        // z: Math.PI * rotateZ * 1000
                        z: 0,
                    },
                    duration * 1000,
                )
                .onUpdate(render)
                .start()
                .onStop(() => {
                    resolve('')
                })
                .onComplete(() => {
                    resolve('')
                })
        })
    }
    /**
     * @description: 视野转回正面
     */
    function resetCamera() {
        new TWEEN.Tween(camera.value.position)
            .to(
                {
                    x: 0,
                    y: 0,
                    z: 3000,
                },
                1000,
            )
            .onUpdate(render)
            .start()
            .onComplete(() => {
                new TWEEN.Tween(camera.value.rotation)
                    .to(
                        {
                            x: 0,
                            y: 0,
                            z: 0,
                        },
                        1000,
                    )
                    .onUpdate(render)
                    .start()
                    .onComplete(() => {
                        canOperate.value = true
                        // camera.value.lookAt(scene.value.position)
                        camera.value.position.y = 0
                        camera.value.position.x = 0
                        camera.value.position.z = 3000
                        camera.value.rotation.x = 0
                        camera.value.rotation.y = 0
                        camera.value.rotation.z = -0
                        controls.value.reset()
                    })
            })
    }

    /**
     * @description: 开始抽奖音乐
     */
    function startLotteryMusic() {
        if (!isPlayWinMusic.value) {
            return
        }
        if (lotteryMusic.value) {
            lotteryMusic.value.pause()
            lotteryMusic.value = null
        }

        // 从「音乐设定」中随机选取一首；若列表为空则回退到内置世界杯音乐
        const list = musicList.value
        let audioUrl: string = worldCupAudio
        // 兼容 string 或 Blob/Response 等可通过 arrayBuffer() 读取的对象
        if (list && list.length > 0) {
            const idx = Math.floor(Math.random() * list.length)
            const candidate = list[idx] && (list[idx] as any).url
            if (typeof candidate === 'string') {
                audioUrl = candidate
            }
            else if (candidate && typeof (candidate as any).arrayBuffer === 'function') {
                try {
                    const blob = candidate as unknown as Blob
                    const objectUrl = URL.createObjectURL(blob)
                    audioUrl = objectUrl
                    lotteryMusicObjectUrl.value = objectUrl
                }
                catch (err) {
                    console.warn('创建音频 object URL 失败，回退到内置音乐', err)
                    audioUrl = worldCupAudio
                }
            }
        }

        lotteryMusic.value = new Audio(audioUrl)
        lotteryMusic.value.loop = true
        lotteryMusic.value.volume = 0.7

        lotteryMusic.value.play().catch((error) => {
            console.error('播放抽奖音乐失败:', error)
        })
    }

    /**
     * @description: 停止抽奖音乐
     */
    function stopLotteryMusic() {
        if (!isPlayWinMusic.value) {
            return
        }
        if (lotteryMusic.value) {
            lotteryMusic.value.pause()
            lotteryMusic.value = null
            // 释放通过 createObjectURL 创建的临时 URL
            try {
                if (lotteryMusicObjectUrl.value) {
                    URL.revokeObjectURL(lotteryMusicObjectUrl.value)
                    lotteryMusicObjectUrl.value = null
                }
            }
            catch (e) {}
        }
    }

    /**
     * @description: 播放结束音效
     */
    function playEndSound() {
        if (!isPlayWinMusic.value) {
            return
        }

        // 清理已结束的音频
        playingAudios.value = playingAudios.value.filter(audio => !audio.ended)

        try {
            const endSound = new Audio(dongSound)
            endSound.volume = 1.0

            // 简化播放逻辑
            const playPromise = endSound.play()

            if (playPromise) {
                playPromise
                    .then(() => {
                        playingAudios.value.push(endSound)
                    })
                    .catch((err) => {
                        console.error('播放失败:', err.name, err.message)
                        if (err.name === 'NotAllowedError') {
                            console.warn('自动播放被阻止，需用户交互后播放')
                        }
                    })
            }

            endSound.onended = () => {
                const index = playingAudios.value.indexOf(endSound)
                if (index > -1)
                    playingAudios.value.splice(index, 1)
            }
        }
        catch (error) {
            console.error('创建音频对象失败:', error)
        }
    }

    /**
     * @description: 重置音频状态
     */
    function resetAudioState() {
        if (!isPlayWinMusic.value) {
            return
        }
        // 停止抽奖音乐
        stopLotteryMusic()

        // 清理所有正在播放的音频
        playingAudios.value.forEach((audio) => {
            if (!audio.ended && !audio.paused) {
                audio.pause()
            }
        })
        playingAudios.value = []
    }

    /**
     * @description: 开始抽奖，由横铺变换为球体（或其他图形）
     * @returns 随机抽取球数据
     */
    /// <IP_ADDRESS>description 进入抽奖准备状态
    async function enterLottery() {
        if (!canOperate.value) {
            return
        }

        // 重置音频状态
        resetAudioState()

        // 预加载音频资源以解决浏览器自动播放策略
        try {
            void (window.AudioContext || (window as any).webkitAudioContext)
        }
        catch (e) {
            console.warn('音频上下文不可用:', e)
        }

        if (!intervalTimer.value && tableData.value.length === 0) {
            randomBallData()
        }
        // 如果渲染器的 DOM 已被移除（我们在恢复时可能会移除以避免遮挡），重新附加到容器
        try {
            if (renderer && renderer.value && renderer.value.domElement && containerRef.value && !renderer.value.domElement.parentElement) {
                containerRef.value.appendChild(renderer.value.domElement)
                renderer.value.domElement.style.display = ''
            }
        }
        catch (err) {
            console.error('re-append renderer dom failed', err)
        }
        if (patternList.value.length) {
            for (let i = 0; i < patternList.value.length; i++) {
                if (i < rowCount.value * 7) {
                    objects.value[patternList.value[i] - 1].element.style.backgroundColor = rgba(cardColor.value, Math.random() * 0.5 + 0.25)
                }
            }
        }
        canOperate.value = false
        await transform(targets.sphere, 1000)
        currentStatus.value = LotteryStatus.ready
        rollBall(0.1, 2000)
    }
    /**
     * @description 开始抽奖
     */
    function startLottery() {
        if (!canOperate.value) {
            return
        }
        // 验证是否已抽完全部奖项
        if (currentPrize.value.isUsed || !currentPrize.value) {
            toast.open({
                message: i18n.global.t('error.personIsAllDone'),
                type: 'warning',
                position: 'top-right',
                duration: 10000,
            })

            return
        }
        // personPool.value = currentPrize.value.isAll ? notThisPrizePersonList.value : notPersonList.value
        personPool.value = currentPrize.value.isAll ? [...notThisPrizePersonList.value] : [...notPersonList.value]
        // 验证抽奖人数是否还够
        if (personPool.value.length < currentPrize.value.count - currentPrize.value.isUsedCount) {
            toast.open({
                message: i18n.global.t('error.personNotEnough'),
                type: 'warning',
                position: 'top-right',
                duration: 10000,
            })

            return
        }
        // 默认置为单次抽奖最大个数
        luckyCount.value = SINGLE_TIME_MAX_PERSON_COUNT
        // 还剩多少人未抽
        let leftover = currentPrize.value.count - currentPrize.value.isUsedCount
        const customCount = currentPrize.value.separateCount
        if (customCount && customCount.enable && customCount.countList.length > 0) {
            for (let i = 0; i < customCount.countList.length; i++) {
                if (customCount.countList[i].isUsedCount < customCount.countList[i].count) {
                    // 根据自定义人数来抽取
                    leftover = customCount.countList[i].count - customCount.countList[i].isUsedCount
                    break
                }
            }
        }
        luckyCount.value = leftover < luckyCount.value ? leftover : luckyCount.value
        // 重构抽奖函数
        luckyTargets.value = getRandomElements(personPool.value, luckyCount.value)
        luckyTargets.value.forEach((item) => {
            const index = personPool.value.findIndex(person => person.id === item.id)
            if (index > -1) {
                personPool.value.splice(index, 1)
            }
        })

        toast.open({
            // message: `现在抽取${currentPrize.value.name} ${leftover}人`,
            message: i18n.global.t('error.startDraw', { count: currentPrize.value.name, leftover }),
            type: 'default',
            position: 'top-right',
            duration: 8000,
        })

        // 开始播放抽奖音乐
        startLotteryMusic()

        currentStatus.value = LotteryStatus.running
        rollBall(10, 3000)
        if (definiteTime.value) {
            setTimeout(() => {
                if (currentStatus.value === LotteryStatus.running) {
                    stopLottery()
                }
            }, definiteTime.value * 1000)
        }
    }
    /**
     * @description: 停止抽奖，抽出幸运人
     */
    async function stopLottery() {
        // 清理自动停止定时器，防止重复触发
        try { if (autoStopTimer.value) { clearTimeout(autoStopTimer.value); autoStopTimer.value = null } } catch (e) {}

        if (!canOperate.value) {
            return
        }
        // 停止抽奖音乐
        stopLotteryMusic()

        // 播放结束音效
        playEndSound()

        //   clearInterval(intervalTimer.value)
        //   intervalTimer.value = null
        canOperate.value = false
        // 确保 renderer 可见以展示停止动画
        try { if (renderer && renderer.value && renderer.value.domElement) renderer.value.domElement.style.display = '' } catch (e) {}
        rollBall(0, 1)

        const windowSize = { width: window.innerWidth, height: window.innerHeight }
        // 若 tween onComplete 未触发，使用回退机制确保最终会派发 lottery:end
        let lotteryEndDispatched = false
        // 如果存在预选卡位：优先让 three.js 的动画路径（移位并触发 onComplete）来派发 lottery:end 并展示“大图/高亮”效果。
        // 仅在无法渲染 three.js（renderer DOM 缺失或 objects 不完整）时，才走立即派发并移除 renderer 的回退路径。
        if (preselectedCardIndex.value !== null) {
            const canRenderLucky = (renderer && renderer.value && renderer.value.domElement && objects.value && objects.value.length > (preselectedCardIndex.value))
            if (!canRenderLucky) {
                try {
                    const personCandidate = (luckyTargets.value && luckyTargets.value.length) ? luckyTargets.value[0] : (tableData.value && tableData.value[preselectedCardIndex.value]) || null
                    const ev = new CustomEvent('lottery:end', { detail: { index: preselectedCardIndex.value, person: personCandidate } })
                    window.dispatchEvent(ev)
                }
                catch (e) { console.error('immediate dispatch lottery:end failed', e) }
                lotteryEndDispatched = true
                // 回退路径仍然尝试恢复页面网格并移除 renderer
                try { document.querySelector('.lottery-table')?.classList.remove('hidden-during-sphere') } catch (e) {}
                try {
                    if (renderer && renderer.value && renderer.value.domElement && renderer.value.domElement.parentElement) {
                        renderer.value.domElement.parentElement.removeChild(renderer.value.domElement)
                    }
                    else if (renderer && renderer.value && renderer.value.domElement) {
                        renderer.value.domElement.style.display = 'none'
                    }
                } catch (e) { console.error('hide/remove renderer dom failed', e) }
                // 若页面短时间内未响应事件更新 DOM，则强制继续
                setTimeout(() => {
                    try {
                        const revealedCount = document.querySelectorAll('.grid-cell.revealed').length
                        if (revealedCount === 0) {
                            console.warn('No revealed DOM detected after immediate lottery:end — forcing continueLottery')
                            canOperate.value = true
                            currentStatus.value = LotteryStatus.end
                            try { continueLottery() } catch (err) { console.error('forced continueLottery failed', err) }
                        }
                    }
                    catch (err) {
                        console.error('check revealed DOM failed', err)
                    }
                }, 1200)
            }
            else {
                // 允许正常的 three.js 动画路径继续：不要立即派发或移除 renderer，等到 item 的 onComplete 分支派发 lottery:end 并执行 confetti/highlight
            }
        }
        const deferredSnapshot = { preselected: preselectedCardIndex.value, targets: (luckyTargets.value && luckyTargets.value.slice()) || [] }
        // 如果我们选择了由 three.js 正常渲染（deferred dispatch），保留一个后备超时以防 onComplete 未触发
        if (deferredSnapshot.targets && deferredSnapshot.targets.length) {
            setTimeout(() => {
                try {
                    if (!lotteryEndDispatched) {
                        const fallbackPerson = deferredSnapshot.targets[0]
                        const fallbackIndex = deferredSnapshot.preselected ?? 0
                        console.warn('deferred path fallback dispatch after timeout', { fallbackIndex, fallbackPerson })
                        const ev = new CustomEvent('lottery:end', { detail: { index: fallbackIndex, person: fallbackPerson } })
                        window.dispatchEvent(ev)
                        lotteryEndDispatched = true
                    }
                }
                catch (err) { console.error('deferred fallback dispatch failed', err) }
            }, 2000)
        }

        // 若 luckyTargets 在 transform 后被清空，但存在 preselectedCardIndex，则用 tableData 的该项作为备选目标
        const processTargets = (luckyTargets.value && luckyTargets.value.length) ? luckyTargets.value.slice() : (preselectedCardIndex.value !== null && tableData.value && tableData.value[preselectedCardIndex.value] ? [tableData.value[preselectedCardIndex.value]] : [])
        processTargets.forEach((person: IPersonConfig, index: number) => {
            // 如果存在预设的卡牌索引，优先使用并清除它
            let cardIndex: number
            if (preselectedCardIndex.value !== null) {
                cardIndex = preselectedCardIndex.value
                preselectedCardIndex.value = null
            }
            else {
                cardIndex = selectCard(luckyCardList.value, tableData.value.length, person.id)
            }
            luckyCardList.value.push(cardIndex)
            const totalLuckyCount = processTargets.length || luckyTargets.value.length
            const item = objects.value[cardIndex]
            const { xTable, yTable, scale } = useElementPosition(
                item,
                rowCount.value,
                totalLuckyCount,
                { width: cardSize.value.width, height: cardSize.value.height },
                windowSize,
                index,
            )
            const posTween = new TWEEN.Tween(item.position)
                .to({ x: xTable, y: yTable, z: 1000 }, 1200)
                .easing(TWEEN.Easing.Exponential.InOut)
            posTween.onStart(() => {
                item.element = useElementStyle({
                    element: item.element,
                    person,
                    index: cardIndex,
                    patternList: patternList.value,
                    patternColor: patternColor.value,
                    cardColor: luckyColor.value,
                    cardSize: { width: cardSize.value.width, height: cardSize.value.height },
                    scale,
                    textSize: textSize.value,
                    mod: 'lucky',
                })
                // 注入奖品图片覆盖层（填满整张中奖卡）
                try {
                    const prizeData = (person as any).prizeRaw
                    const picInfo = prizeData?.picture
                    if (picInfo) {
                        const el = item.element as HTMLElement
                        let prizeImg = el.querySelector('.lucky-prize-img') as HTMLImageElement | null
                        const revokePrizeBlobUrl = () => {
                            const blobUrl = prizeImg?.dataset.blobUrl
                            if (blobUrl) {
                                URL.revokeObjectURL(blobUrl)
                                if (prizeImg)
                                    delete prizeImg.dataset.blobUrl
                            }
                        }
                        if (!prizeImg) {
                            prizeImg = document.createElement('img')
                            prizeImg.className = 'lucky-prize-img'
                            prizeImg.style.cssText = 'position:absolute;inset:8px;width:calc(100% - 16px);height:calc(100% - 16px);object-fit:contain;object-position:center;z-index:3;border-radius:8px;pointer-events:none;background:transparent;box-sizing:border-box;'
                            el.insertBefore(prizeImg, el.firstChild)
                        }
                        if (picInfo.url === 'Storage') {
                            const imgDb = localforage.createInstance({ name: 'imgStore' })
                            imgDb.getItem<any>(picInfo.id).then((data: any) => {
                                if (!prizeImg)
                                    return
                                revokePrizeBlobUrl()
                                if (data?.data instanceof Blob) {
                                    const nextUrl = URL.createObjectURL(data.data)
                                    prizeImg.dataset.blobUrl = nextUrl
                                    prizeImg.src = nextUrl
                                }
                                else {
                                    prizeImg.removeAttribute('src')
                                }
                            }).catch(() => {})
                        } else {
                            revokePrizeBlobUrl()
                            prizeImg.src = picInfo.url as string
                        }
                    } else {
                        const el = item.element as HTMLElement
                        const prizeImg = el.querySelector('.lucky-prize-img') as HTMLImageElement | null
                        const blobUrl = prizeImg?.dataset.blobUrl
                        if (blobUrl)
                            URL.revokeObjectURL(blobUrl)
                        prizeImg?.remove()
                    }
                } catch (e) {}
            })
            posTween.onComplete(() => {
                canOperate.value = true
                currentStatus.value = LotteryStatus.end
                try {
                    const ev = new CustomEvent('lottery:end', { detail: { index: cardIndex, person } })
                    window.dispatchEvent(ev)
                }
                catch (e) { console.error('dispatch lottery:end failed', e) }
                lotteryEndDispatched = true
                // 在抽奖结束后保留 three.js 渲染以展示获奖卡牌；页面网格恢复由用户点击该高亮卡牌触发 continueLottery()
                try {
                    const el = item.element as HTMLElement
                    // 放大高亮元素，确保文字可读
                    if (el) {
                        // Allow pointer events on renderer and element so clicks register
                        try {
                            if (renderer && renderer.value && renderer.value.domElement) {
                                renderer.value.domElement.style.pointerEvents = 'auto'
                            }
                            if (containerRef && containerRef.value) {
                                containerRef.value.style.pointerEvents = ''
                            }
                        }
                        catch (e) {}

                        el.classList.add('lucky-clickable')
                        el.style.cursor = 'pointer'
                        // 放大元素尺寸以展示完整文字
                        try {
                            el.style.width = `${cardSize.value.width * (scale * 2)}px`
                            el.style.height = `${cardSize.value.height * (scale * 2)}px`
                        } catch (e) {}

                        // 添加提示文字（若不存在）
                        let hint = el.querySelector('.lucky-click-hint') as HTMLElement | null
                        if (!hint) {
                            hint = document.createElement('div')
                            hint.className = 'lucky-click-hint'
                            hint.style.position = 'absolute'
                            hint.style.left = '50%'
                            hint.style.bottom = '6%'
                            hint.style.transform = 'translateX(-50%)'
                            hint.style.padding = '6px 12px'
                            hint.style.background = 'rgba(0,0,0,0.65)'
                            hint.style.color = '#fff'
                            hint.style.borderRadius = '6px'
                            hint.style.fontSize = '13px'
                            hint.style.zIndex = '999'
                            hint.textContent = '点击查看并返回'
                            el.appendChild(hint)
                        }
                        const onClickContinue = () => {
                            try { el.removeEventListener('click', onClickContinue) } catch (e) {}
                            try { window.removeEventListener('click', globalContinueHandler) } catch (e) {}
                            try { if (hint && hint.parentElement) hint.parentElement.removeChild(hint) } catch (e) {}
                            try {
                                // restore pointer-events
                                if (renderer && renderer.value && renderer.value.domElement) renderer.value.domElement.style.pointerEvents = ''
                                if (containerRef && containerRef.value) containerRef.value.style.pointerEvents = 'none'
                            } catch (e) {}
                            try { continueLottery() } catch (err) { console.error('continueLottery failed on click', err) }
                        }
                        // 全局后备：若局部点击没有被触发，则任意点击页面也能触发继续（仅在当前状态为 end 时）
                        const globalContinueHandler = (ev: MouseEvent) => {
                            try {
                                if (currentStatus.value === LotteryStatus.end) {
                                    try { window.removeEventListener('click', globalContinueHandler) } catch (e) {}
                                    try { el.removeEventListener('click', onClickContinue) } catch (e) {}
                                    try {
                                        if (renderer && renderer.value && renderer.value.domElement) renderer.value.domElement.style.pointerEvents = ''
                                        if (containerRef && containerRef.value) containerRef.value.style.pointerEvents = 'none'
                                    } catch (e) {}
                                    try { continueLottery() } catch (err) { console.error('continueLottery failed in global handler', err) }
                                }
                            }
                            catch (err) {
                                console.error('globalContinueHandler error', err)
                            }
                        }
                        window.addEventListener('click', globalContinueHandler)
                        el.addEventListener('click', onClickContinue)
                    }
                }
                catch (err) { console.error('attach click-to-continue handler failed', err) }
            })
            posTween.start()
            // 设置初始旋转：让中奖卡牌从球体中「旋转飞出」
            item.rotation.x = Math.PI * 3
            item.rotation.y = Math.PI * 5
            item.rotation.z = Math.PI * 1
            new TWEEN.Tween(item.rotation)
                .to({ x: 0, y: 0, z: 0 }, 1400)
                .easing(TWEEN.Easing.Exponential.Out)
                .start()
                .onComplete(() => {
                    playWinMusic()
                    confettiFire(index, CONFETTI_FIRE_MAX_COUNT)
                    resetCamera()
                })
        })

        // 回退：若在 1600ms 内未派发 lottery:end，则强制派发一次（防止页面卡死在 three.js）
        setTimeout(() => {
            if (!luckyTargets.value || !luckyTargets.value.length) return
            if (!lotteryEndDispatched) {
                const fallbackIndex = (luckyCardList.value && luckyCardList.value.length) ? luckyCardList.value[0] : (preselectedCardIndex.value ?? 0)
                try {
                    const ev = new CustomEvent('lottery:end', { detail: { index: fallbackIndex, person: luckyTargets.value[0] } })
                    window.dispatchEvent(ev)
                    console.warn('lottery:end dispatched by fallback', { index: fallbackIndex })
                    currentStatus.value = LotteryStatus.end
                    canOperate.value = true
                }
                catch (e) { console.error('fallback dispatch lottery:end failed', e) }
                    // 回退路径：自动提交
                    try { continueLottery() } catch (err) { console.error('fallback auto continueLottery failed', err) }
            }
        }, 1600)

        // 页面网格恢复由用户在继续/放弃时触发（保持 three.js 展示以显示中奖卡牌）
    }
    // 播放音频，中将卡片越多audio对象越多，声音越大
    function playWinMusic() {
        if (!isPlayWinMusic.value) {
            return
        }
        // 清理已结束的音频
        playingAudios.value = playingAudios.value.filter(audio => !audio.ended && !audio.paused)

        if (playingAudios.value.length > maxAudioLimit) {
            console.warn('音频播放数量已达到上限，请勿重复播放')
            return
        }

        const enterNewAudio = new Audio(enterAudio)
        enterNewAudio.volume = 0.8

        playingAudios.value.push(enterNewAudio)
        enterNewAudio.play()
            .then(() => {
                // 当音频播放结束后，从数组中移除
                enterNewAudio.onended = () => {
                    const index = playingAudios.value.indexOf(enterNewAudio)
                    if (index > -1) {
                        playingAudios.value.splice(index, 1)
                    }
                }
            })
            .catch((error) => {
                console.error('播放音频失败:', error)
                // 如果播放失败，也从数组中移除
                const index = playingAudios.value.indexOf(enterNewAudio)
                if (index > -1) {
                    playingAudios.value.splice(index, 1)
                }
            })

        // 播放错误时从数组中移除
        enterNewAudio.onerror = () => {
            const index = playingAudios.value.indexOf(enterNewAudio)
            if (index > -1) {
                playingAudios.value.splice(index, 1)
            }
        }
    }
    /**
     * @description: 继续,意味着这抽奖作数，计入数据库
     */
    async function continueLottery() {
        if (!canOperate.value) {
            return
        }
        try { if (autoStopTimer.value) { clearTimeout(autoStopTimer.value); autoStopTimer.value = null } } catch (e) {}
        const customCount = currentPrize.value.separateCount
        if (customCount && customCount.enable && customCount.countList.length > 0) {
            for (let i = 0; i < customCount.countList.length; i++) {
                if (customCount.countList[i].isUsedCount < customCount.countList[i].count) {
                    customCount.countList[i].isUsedCount += luckyCount.value
                    break
                }
            }
        }
        currentPrize.value.isUsedCount += luckyCount.value
        luckyCount.value = 0
        if (currentPrize.value.isUsedCount >= currentPrize.value.count) {
            currentPrize.value.isUsed = true
            currentPrize.value.isUsedCount = currentPrize.value.count
        }
        // 确定本次揭晓应计入的 prize（卡牌触发时，luckyTargets 中会包含 prizeId/prizeRaw；否则回退到 currentPrize）
        let targetPrizeId: any = null
        let prizeObjForAdd: any = null
        try {
            if (luckyTargets.value && luckyTargets.value.length && luckyTargets.value[0].prizeId) {
                targetPrizeId = luckyTargets.value[0].prizeId
                prizeObjForAdd = luckyTargets.value[0].prizeRaw || null
            }
        }
        catch (e) {
            console.error('extract prizeId from luckyTargets failed', e)
        }
        // 如果没有从 luckyTargets 得到 prizeId，则使用当前奖项
        if (!targetPrizeId) {
            targetPrizeId = currentPrize.value && currentPrize.value.id
            prizeObjForAdd = currentPrize.value
        }

        // 将获奖记录与对应奖项一并保存
        try {
            // personConfig 接口期望传入(people, prize)
            personConfig.addAlreadyPersonList(luckyTargets.value, prizeObjForAdd || currentPrize.value)
        }
        catch (err) {
            console.error('personConfig.addAlreadyPersonList failed', err)
        }

        // 同步更新 prizeConfig 中对应的 prize 列表项，以便左侧列表即时反映 已用/总数，并高亮该奖项
        try {
            const prizeList = prizeConfig.prizeConfig.prizeList
            const found = prizeList.find((p: any) => p.id === targetPrizeId)
            if (found) {
                found.isUsedCount = (found.isUsedCount || 0) + (luckyCount.value || 0)
                if (found.isUsedCount >= (found.count || 0)) {
                    found.isUsed = true
                    found.isUsedCount = found.count
                }
                // Ensure reactive update: replace the prize list reference
                try { prizeConfig.prizeConfig.prizeList = prizeList.slice() } catch (e) {}
                // 将该奖项设为当前选中以高亮左侧
                try { prizeConfig.setCurrentPrize(found) } catch (e) {}
                // 调用 updatePrizeConfig 触发其它逻辑（例如自动切换下一项）
                try { prizeConfig.updatePrizeConfig(found) } catch (e) { console.error('prizeConfig.updatePrizeConfig failed', e) }
            }
        }
        catch (err) {
            console.error('sync prizeConfig list failed', err)
        }
        // 恢复页面网格显示并隐藏 three.js 渲染（在用户确认后恢复 DOM 网格）
        try { document.querySelector('.lottery-table')?.classList.remove('hidden-during-sphere') } catch (e) {}
        try {
            if (renderer && renderer.value && renderer.value.domElement && renderer.value.domElement.parentElement) {
                renderer.value.domElement.parentElement.removeChild(renderer.value.domElement)
            }
            else if (renderer && renderer.value && renderer.value.domElement) {
                renderer.value.domElement.style.display = 'none'
            }
        } catch (e) {}
        currentStatus.value = LotteryStatus.init
        // 告知页面层返回展示模式（由页面决定如何处理）
        try {
            const ev = new CustomEvent('lottery:returnToShowcase')
            window.dispatchEvent(ev)
        }
        catch (e) { console.error('dispatch lottery:returnToShowcase failed', e) }
    }
    /**
     * @description: 放弃本次抽奖，回到初始状态
     */
    function quitLottery() {
        // 停止抽奖音乐
        stopLotteryMusic()

        try { if (autoStopTimer.value) { clearTimeout(autoStopTimer.value); autoStopTimer.value = null } } catch (e) {}

        // 直接恢复页面网格并隐藏 three.js 渲染
        try { document.querySelector('.lottery-table')?.classList.remove('hidden-during-sphere') } catch (e) {}
        try {
            if (renderer && renderer.value && renderer.value.domElement && renderer.value.domElement.parentElement) {
                renderer.value.domElement.parentElement.removeChild(renderer.value.domElement)
            }
            else if (renderer && renderer.value && renderer.value.domElement) {
                renderer.value.domElement.style.display = 'none'
            }
        } catch (e) {}
        currentStatus.value = LotteryStatus.init
    }

    /**
     * @description: 随机替换卡片中的数据（不改变原有的值，只是显示）
     * @param {string} mod 模式
     */
    function randomBallData(mod: 'default' | 'lucky' | 'sphere' = 'default') {
        // 两秒执行一次
        // 防护：当 tableData 或人员列表不足时跳过，避免索引越界导致 undefined
        if (!tableData.value || tableData.value.length < 2 || !allPersonList.value || allPersonList.value.length < 1) {
            return
        }
        intervalTimer.value = setInterval(() => {
            // 产生随机数数组
            const indexLength = 4
            const cardRandomIndexArr: number[] = []
            const personRandomIndexArr: number[] = []
            for (let i = 0; i < indexLength; i++) {
                // 解决随机元素概率过于不均等问题
                const randomCardIndex = Math.floor(Math.random() * Math.max(1, tableData.value.length))
                const randomPersonIndex = Math.floor(Math.random() * Math.max(1, allPersonList.value.length))
                if (luckyCardList.value.includes(randomCardIndex)) {
                    continue
                }
                cardRandomIndexArr.push(randomCardIndex)
                personRandomIndexArr.push(randomPersonIndex)
            }
            for (let i = 0; i < cardRandomIndexArr.length; i++) {
                if (!objects.value[cardRandomIndexArr[i]]) {
                    continue
                }
                const person = allPersonList.value[personRandomIndexArr[i]] || { uid: '', name: '', department: '', identity: '', avatar: '' }
                objects.value[cardRandomIndexArr[i]].element = useElementStyle({
                    element: objects.value[cardRandomIndexArr[i]].element,
                    person,
                    index: cardRandomIndexArr[i],
                    patternList: patternList.value,
                    patternColor: patternColor.value,
                    cardColor: cardColor.value,
                    cardSize: { width: cardSize.value.width, height: cardSize.value.height },
                    textSize: textSize.value,
                    scale: 1,
                    mod,
                    type: 'change',
                })
            }
        }, 200)
    }
    /**
     * @description: 键盘监听，快捷键操作
     */
    function listenKeyboard(e: any) {
        if ((e.keyCode !== 32 || e.keyCode !== 27) && !canOperate.value) {
            return
        }
        if (e.keyCode === 27 && currentStatus.value === LotteryStatus.running) {
            quitLottery()
        }
        if (e.keyCode !== 32) {
            return
        }
        switch (currentStatus.value) {
            case LotteryStatus.init:
                enterLottery()
                break
            case LotteryStatus.ready:
                startLottery()
                break
            case LotteryStatus.running:
                stopLottery()
                break
            case LotteryStatus.end:
                continueLottery()
                break
            default:
                break
        }
    }
    /**
     * @description: 清理资源，避免内存溢出
     */
    function cleanup() {
        // 停止所有Tween动画
        TWEEN.removeAll()

        // 清理动画循环
        if ((window as any).cancelAnimationFrame) {
            (window as any).cancelAnimationFrame(animationFrameId.value)
        }
        clearInterval(intervalTimer.value)
        intervalTimer.value = null
        try { if (autoStopTimer.value) { clearTimeout(autoStopTimer.value); autoStopTimer.value = null } } catch (e) {}

        // 停止抽奖音乐
        stopLotteryMusic()

        // 清理所有音频资源
        playingAudios.value.forEach((audio) => {
            if (!audio.ended && !audio.paused) {
                audio.pause()
            }
            // 释放音频资源
            audio.src = ''
            audio.load()
        })
        playingAudios.value = []

        if (scene.value) {
            scene.value.traverse((object: Object3D) => {
                if ((object as any).material) {
                    if (Array.isArray((object as any).material)) {
                        (object as any).material.forEach((material: Material) => {
                            material.dispose()
                        })
                    }
                    else {
                        (object as any).material.dispose()
                    }
                }
                if ((object as any).geometry) {
                    (object as any).geometry.dispose()
                }
                if ((object as any).texture) {
                    (object as any).texture.dispose()
                }
            })
            scene.value.clear()
        }

        if (objects.value) {
            objects.value.forEach((object) => {
                if (object.element) {
                    object.element.remove()
                }
            })
            objects.value = []
        }

        if (controls.value) {
            controls.value.removeEventListener('change')
            controls.value.dispose()
        }
        //   移除所有事件监听
        window.removeEventListener('resize', onWindowResize)
        scene.value = null
        camera.value = null
        renderer.value = null
        controls.value = null
    }
    /**
     * @description: 设置默认人员列表
     */
    function setDefaultPersonList() {
        personConfig.setDefaultPersonList()
        // 刷新页面
        window.location.reload()
    }
    const init = () => {
        // 立即初始化 three.js，但是不自动用员工列表填充卡片
        // 卡片数据由页面卡格（cardGrid）通过 syncTableDataFromCardGrid 主动同步
        tableData.value = []
        initThreeJs()
        animation()
        containerRef.value!.style.color = `${textColor}`
        randomBallData()
        window.addEventListener('keydown', listenKeyboard)
        // 允许任意点击停止抽奖，方便没有停止按钮的场景
        window.addEventListener('click', onAnyClickStop)
        isInitialDone.value = true
    }
    onMounted(() => {
        init()
    })
    onUnmounted(() => {
        nextTick(() => {
            cleanup()
        })
        clearInterval(intervalTimer.value)
        intervalTimer.value = null
        window.removeEventListener('keydown', listenKeyboard)
        window.removeEventListener('click', onAnyClickStop)
    })

    return {
        setDefaultPersonList,
        startLottery,
        startLotteryForCard,
        setPreselectedCard: (idx: number | null) => { preselectedCardIndex.value = idx },
        continueLottery,
        quitLottery,
        containerRef,
        stopLottery,
        enterLottery,
        tableData,
        currentStatus,
        isInitialDone,
        titleFont,
        titleFontSyncGlobal,
    }
}
