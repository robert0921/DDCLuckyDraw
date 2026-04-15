import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import Layout from '@/layout/index.vue'
import i18n from '@/locales/i18n'
import Home from '@/views/Home/index.vue'

export const configRoutes = {
    path: '/ddc-luckydraw/config',
    name: 'Config',
    component: () => import('@/views/Config/index.vue'),
    children: [
        {
            path: '',
            redirect: '/ddc-luckydraw/config/prize',
        },
        {
            path: '/ddc-luckydraw/config/person',
            name: 'PersonConfig',
            component: () => import('@/views/Config/Person/index.vue'),
            meta: {
                hidden: true,
                title: i18n.global.t('sidebar.personConfiguration'),
                icon: 'person',
            },
            children: [
                {
                    path: '',
                    redirect: '/ddc-luckydraw/config/person/all',
                },
                {
                    path: '/ddc-luckydraw/config/person/all',
                    name: 'AllPersonConfig',
                    component: () => import('@/views/Config/Person/PersonAll/index.vue'),
                    meta: {
                        hidden: true,
                        title: i18n.global.t('sidebar.personList'),
                        icon: 'all',
                    },
                },
                {
                    path: '/ddc-luckydraw/config/person/already',
                    name: 'AlreadyPerson',
                    component: () => import('@/views/Config/Person/PersonAlready/index.vue'),
                    meta: {
                        hidden: true,
                        title: i18n.global.t('sidebar.winnerList'),
                        icon: 'already',
                    },
                },
            ],
        },
        {
            path: '/ddc-luckydraw/config/prize',
            name: 'PrizeConfig',
            component: () => import('@/views/Config/Prize/PrizeConfig.vue'),
            meta: {
                title: i18n.global.t('sidebar.prizeConfiguration'),
                icon: 'prize',
            },
        },
        {
            path: '/ddc-luckydraw/config/global/face',
            name: 'FaceConfig',
            component: () => import('@/views/Config/Global/FaceConfig/index.vue'),
            meta: {
                title: i18n.global.t('sidebar.viewSetting'),
                icon: 'face',
            },
        },
        {
            path: '/ddc-luckydraw/config/global/image',
            name: 'ImageConfig',
            component: () => import('@/views/Config/Global/ImageConfig/index.vue'),
            meta: {
                title: i18n.global.t('sidebar.imagesManagement'),
                icon: 'image',
            },
        },
        {
            path: '/ddc-luckydraw/config/global/music',
            name: 'MusicConfig',
            component: () => import('@/views/Config/Global/MusicConfig/index.vue'),
            meta: {
                title: i18n.global.t('sidebar.musicManagement'),
                icon: 'music',
            },
        },
        {
            path: '/ddc-luckydraw/config/server',
            name: 'Server',
            component: () => import('@/views/Config/Server/index.vue'),
            meta: {
                hidden: import.meta.env.VITE_ENABLE_WEBSOCKET !== 'true',
                title: i18n.global.t('sidebar.server'),
                icon: 'server',
            },
        },
        {
            path: '/ddc-luckydraw/config/readme',
            name: 'Readme',
            component: () => import('@/views/Config/Readme/index.vue'),
            meta: {
                title: i18n.global.t('sidebar.operatingInstructions'),
                icon: 'readme',
            },
        },
    ],
}
const routes = [
    {
        path: '/',
        redirect: '/ddc-luckydraw',
    },
    {
        path: '/ddc-luckydraw',
        component: Layout,
        redirect: '/ddc-luckydraw/home',
        children: [
            {
                path: '/ddc-luckydraw/home',
                name: 'Home',
                component: Home,
            },
            {
                path: '/ddc-luckydraw/demo',
                name: 'Demo',
                component: () => import('@/views/Demo/index.vue'),
            },
            {
                path: '/ddc-luckydraw/mobile',
                name: 'Mobile',
                meta: {
                    isMobile: true,
                },
                component: () => import('@/views/Mobile/index.vue'),
            },
            configRoutes,
        ],
    },
]
const envMode = import.meta.env.MODE
// Tauri 1.x 注入 TAURI_PLATFORM，Tauri 2.x 注入 TAURI_ENV_PLATFORM。
// 同时在运行时检测 window.__TAURI_INTERNALS__ 以覆盖所有打包场景。
// 使用 hash history 可避免 F5/刷新时白屏（hash 路径不会发往服务端）。
const isTauriEnv
    = envMode === 'file'
    || !!import.meta.env.TAURI_PLATFORM
    || !!import.meta.env.TAURI_ENV_PLATFORM
    || (typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__)
const router = createRouter({
    history: isTauriEnv ? createWebHashHistory() : createWebHistory(),
    routes,
})

export default router
