import type { Ref } from 'vue'
import type { IPrizeConfig } from '@/types/storeType'
import * as XLSX from 'xlsx'
import { useToast } from 'vue-toast-notification'
import { readFileBinary } from '@/utils/file'

// Excel 列头定义（导入/导出共用）
const COL_NAME = '奖品名称'
const COL_COUNT = '奖品数量'
const COL_DESC = '描述'
const COL_IMAGE = '图片'

/** 动态生成并下载 Excel 模板 */
export function downloadPrizeTemplate() {
    const toast = useToast()
    const templateRows = [
        { [COL_NAME]: '三等奖', [COL_COUNT]: 3, [COL_DESC]: '三等奖描述', [COL_IMAGE]: '三等奖' },
        { [COL_NAME]: '二等奖', [COL_COUNT]: 2, [COL_DESC]: '二等奖描述', [COL_IMAGE]: '二等奖' },
        { [COL_NAME]: '一等奖', [COL_COUNT]: 1, [COL_DESC]: '一等奖描述', [COL_IMAGE]: '一等奖' },
    ]
    const ws = XLSX.utils.json_to_sheet(templateRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'prizes')
    XLSX.writeFile(wb, '奖品配置模板.xlsx')
    toast.success('模板下载成功')
}

/** 从 Excel 文件导入奖品列表，返回解析结果 */
export async function importPrizeFromFile(
    file: File,
): Promise<{ ok: boolean; data?: (Omit<IPrizeConfig, 'picture' | 'separateCount' | 'isUsed' | 'isUsedCount'> & { image?: string })[]; error?: string }> {
    try {
        const binary = await readFileBinary(file)
        const wb = XLSX.read(binary, { type: 'binary', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[] = XLSX.utils.sheet_to_json(ws)

        if (!rows.length) {
            return { ok: false, error: '文件内容为空' }
        }

        // 校验列头
        const firstRow = rows[0]
        if (!(COL_NAME in firstRow)) {
            return { ok: false, error: `列头不匹配，请使用模板文件（需含"${COL_NAME}"列）` }
        }

        const prizes = rows.map((row, idx) => ({
            id: `import_${Date.now()}_${idx}`,
            name: String(row[COL_NAME] ?? '').trim() || `奖品${idx + 1}`,
            count: Math.max(1, Number(row[COL_COUNT]) || 1),
            desc: String(row[COL_DESC] ?? '').trim(),
            sort: idx,
            isAll: false,
            isShow: true,
            frequency: 1,
            image: String(row[COL_IMAGE] ?? '').trim(),
        }))

        return { ok: true, data: prizes }
    }
    catch (e: any) {
        return { ok: false, error: `文件解析失败：${e?.message ?? e}` }
    }
}

/** 将当前 prizeList 导出为 Excel */
export function exportPrizeToExcel(prizeList: IPrizeConfig[]) {
    const toast = useToast()
    if (!prizeList.length) {
        toast.error('奖品列表为空，无法导出')
        return
    }
    const rows = prizeList.map(p => ({
        [COL_NAME]: p.name,
        [COL_COUNT]: p.count,
        已抽取: p.isUsedCount,
        [COL_DESC]: p.desc ?? '',
        [COL_IMAGE]: (p.picture?.name ?? '').replace(/\.[^/.]+$/, ''),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'prizes')
    XLSX.writeFile(wb, '奖品配置.xlsx')
    toast.success('导出成功')
}

/** 供 PrizeConfig.vue 使用的统一封装 hook */
export function usePrizeImportExport(
    prizeList: Ref<IPrizeConfig[]>,
    importFileRef: Ref<HTMLInputElement | undefined>,
    localImageList: Ref<any[]>,
) {
    const toast = useToast()

    function handleDownloadTemplate() {
        downloadPrizeTemplate()
    }

    async function handleFileChange(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        const result = await importPrizeFromFile(file)
        // 清空 file input，允许重复导入同一文件
        if (importFileRef.value) importFileRef.value.value = ''
        if (!result.ok) {
            toast.error(result.error ?? '导入失败')
            return
        }
        // 将导入的奖品（补全缺省字段）追加还是替换——此处选择【替换】以与"下载模板→填写→导入"的工作流一致
        const imported: IPrizeConfig[] = (result.data ?? []).map(p => {
            const imageName = String((p as any).image ?? '').trim()
            // normalize helper: strip extension and lowercase
            const strip = (s: string) => String(s ?? '').replace(/\.[^/.]+$/, '').toLowerCase().trim()
            let pictureObj = { id: '', name: imageName, url: imageName }
            if (imageName && localImageList?.value?.length) {
                const match = localImageList.value.find((mi: any) => strip(mi.name) === strip(imageName))
                if (match) pictureObj = { ...match }
            }
            return {
                ...p,
                isUsedCount: 0,
                isUsed: false,
                picture: pictureObj,
                separateCount: { enable: false, countList: [] },
            } as IPrizeConfig
        })
        prizeList.value = imported
        toast.success(`导入成功，共 ${imported.length} 条奖品`)
    }

    function handleExport() {
        exportPrizeToExcel(prizeList.value)
    }

    return {
        handleDownloadTemplate,
        handleFileChange,
        handleExport,
    }
}
