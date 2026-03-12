import i18n from '../i18n'
import type { BookMetadata, ExportFormat, EpubExportVersion } from '../types/project'
import { useChapterStore, useDesignStore, useProjectStore } from '../store'

export async function exportProjectPayload(
    metadata: BookMetadata,
    options: { format: ExportFormat; embedFonts: boolean },
): Promise<{ cancelled: boolean; savePath: string | null; warnings: string[] }> {
    const { chapters } = useChapterStore.getState()
    const { settings } = useDesignStore.getState()
    const extension = options.format === 'docx' ? 'docx' : 'epub'
    const fileTypeLabel =
        options.format === 'docx'
            ? 'DOCX'
            : options.format === 'epub2'
                ? 'EPUB 2.0'
                : 'EPUB 3.0'
    const savePath = await window.electronAPI.showSaveDialog({
        filters: [{ name: fileTypeLabel, extensions: [extension] }],
        defaultPath: `${metadata.title || i18n.t('appShell.defaults.bookTitle')}.${extension}`,
    })
    if (!savePath) {
        return { cancelled: true, savePath: null, warnings: [] }
    }

    if (options.format === 'docx') {
        const { exportDocx } = await import('../features/export/docxExporter')
        const blob = await exportDocx(
            chapters,
            metadata,
            (key, params) => i18n.t(key, params as Record<string, unknown>) as string,
        )
        await window.electronAPI.saveFileBinary(await blob.arrayBuffer(), savePath)
        useProjectStore.getState().setMetadata(metadata)
        return { cancelled: false, savePath, warnings: [] }
    }

    const { exportEpub } = await import('../features/export/epubExporter')
    const exportSettings = {
        ...settings,
        fontEmbedMode: options.embedFonts ? 'selected' : 'none',
    } as typeof settings
    const version: EpubExportVersion = options.format === 'epub2' ? '2.0' : '3.0'
    const { blob, warnings } = await exportEpub(chapters, metadata, exportSettings, { version })
    await window.electronAPI.saveFileBinary(await blob.arrayBuffer(), savePath)
    useProjectStore.getState().setMetadata(metadata)
    return { cancelled: false, savePath, warnings }
}
