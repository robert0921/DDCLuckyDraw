import type { IMsgType } from '@/types/msgType'
import type { WsMsgData } from '@/types/storeType'
import { v4 as uuidv4 } from 'uuid'
import { onMounted, onUnmounted, ref } from 'vue'
import { useTimerWorker } from './useTimerWorker'

export function useWebsocket() {
    const { init: initWorker, close: closeWorker } = useTimerWorker(30 * 1000)
    const status = ref<{ status: WebSocket['readyState'], connected: boolean }>()
    const data = ref<WsMsgData>()
    const registration = ref<ServiceWorkerRegistration | null>(null)
    const swMessageHandler = (event: MessageEvent) => {
        const msgType = event.data.type
        switch (msgType) {
            case 'WS_STATUS':
                status.value = event.data.payload
                break
            case 'WS_MESSAGE':{
                const receivedMsg: IMsgType = event.data.payload as IMsgType
                data.value = {
                    ...receivedMsg,
                    id: uuidv4(),
                }
                break
            }
            case 'WS_ERROR':
                console.error('ws error:', event.data.payload)
                status.value = {
                    status: WebSocket.CLOSED,
                    connected: false,
                }
                closeWorker()
                break
            case 'WS_CLOSE':
                status.value = {
                    status: WebSocket.CLOSED,
                    connected: false,
                }
                closeWorker()
                break
            case 'WS_OPEN':
                status.value = {
                    status: WebSocket.OPEN,
                    connected: true,
                }
                initWorker(getStatus)
                break
        }
    }

    async function registerSW() {
        if ('serviceWorker' in navigator) {
            try {
                registration.value = await navigator.serviceWorker.register('/log-lottery/sw.js')
                navigator.serviceWorker.removeEventListener('message', swMessageHandler)
                navigator.serviceWorker.addEventListener('message', swMessageHandler)
            }
            catch (error) {
                console.error('Service Worker 注册失败:', error)
            }
        }
        else {
            console.error('浏览器不支持 Service Worker')
        }
    }

    function postToServiceWorker(message: Record<string, unknown>) {
        if (!('serviceWorker' in navigator))
            return Promise.resolve()

        return navigator.serviceWorker.ready.then((workerRegistration) => {
            workerRegistration.active?.postMessage(message)
        })
    }

    function open(url: string) {
        postToServiceWorker({
            type: 'CONNECT_WS',
            payload: { url },
        })
    }

    function close() {
        closeWorker()
        postToServiceWorker({
            type: 'DISCONNECT_WS',
        })
    }
    function send(message: string) {
        postToServiceWorker({
            type: 'SEND_WS_MESSAGE',
            payload: { message, id: uuidv4() },
        })
    }
    function getStatus() {
        postToServiceWorker({
            type: 'GET_WS_STATUS',
        })
    }

    onMounted(() => {
        registerSW()
        getStatus()
    })
    onUnmounted(() => {
        closeWorker()
        if ('serviceWorker' in navigator)
            navigator.serviceWorker.removeEventListener('message', swMessageHandler)
    })
    return {
        open,
        close,
        send,
        status,
        data,
    }
}
