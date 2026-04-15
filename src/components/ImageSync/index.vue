<script setup lang='ts'>
import type { IFileData } from '../FileUpload/type'
import type { IImage } from '@/types/storeType'
import localforage from 'localforage'
import { onBeforeUnmount, ref, watch } from 'vue'

interface IProps {
    imgItem: IImage
}
const props = defineProps<IProps>()
const imageDbStore = localforage.createInstance({
    name: 'imgStore',
})

const imgUrl = ref('')
const objectUrl = ref<string | null>(null)

function revokeObjectUrl() {
    if (!objectUrl.value)
        return
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
}

async function getImageStoreItem(item: IImage): Promise<string> {
    if (item.url === 'Storage') {
        const key = item.id
        const imageData = await imageDbStore.getItem<IFileData>(key)
        if (imageData?.data instanceof Blob) {
            objectUrl.value = URL.createObjectURL(imageData.data)
            return objectUrl.value
        }
        return ''
    }

    return item.url as string || ''
}

watch(() => props.imgItem, async (item) => {
    revokeObjectUrl()
    imgUrl.value = await getImageStoreItem(item)
}, { immediate: true, deep: true })

onBeforeUnmount(() => {
    revokeObjectUrl()
})
</script>

<template>
    <img v-bind="$attrs" :src="imgUrl" alt="Image" class="w-full h-full object-contain rounded-xl">
</template>

<style lang='scss' scoped>

</style>
