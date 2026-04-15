import { onUnmounted } from 'vue'
import TimerWorker from './timerworker.worker?worker'

export function useTimerWorker(interval: number) {
    let timerWorker: Worker | null = null
    const init = (callback: () => void) => {
        close()
        timerWorker = new TimerWorker()
        timerWorker.onmessage = () => callback()
        timerWorker.postMessage({ interval })
    }

    function close() {
        timerWorker?.terminate()
        timerWorker = null
    }

    onUnmounted(() => {
        close()
    })

    return {
        init,
        close,
    }
}
