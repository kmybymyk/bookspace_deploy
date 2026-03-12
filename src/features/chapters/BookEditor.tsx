import { useEditor, EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import { useDebounce } from '../../hooks/useDebounce'
import { useEffect, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChapterStore } from './useChapterStore'
import { useDesignStore } from '../design-panel/useDesignStore'
import { useProjectStore } from '../../store/projectStore'
import BubbleToolbar from './components/BubbleToolbar'
import SlashCommandMenu from './components/SlashCommandMenu'
import FindReplacePanel from './components/FindReplacePanel'
import { useEditorStore } from './useEditorStore'
import { chapterTypeToLayoutSection } from '../design-panel/useDesignStore'
import { getContrastFontCssStack, getFontCssStack } from '../design-panel/fontCatalog'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import {
    buildCopyrightPresetContent,
    EMPTY_EDITOR_DOC,
    isDefaultEmptyContent,
} from './utils/editorHelpers'
import BlockControlsOverlay, { BlockMenuState } from './components/BlockControlsOverlay'

import './editor.css'

import { useSlashMenu } from './hooks/useSlashMenu'
import { useEditorDragDrop } from './hooks/useEditorDragDrop'
import { useBlockCommands } from './hooks/useBlockCommands'
import { useBlockHandleController } from './hooks/useBlockHandleController'
import { useEditorCardWidth } from './hooks/useEditorCardWidth'
import { useBookEditorProps } from './hooks/useBookEditorProps'
import { useBookEditorExtensions } from './hooks/useBookEditorExtensions'
import { useFindReplace } from './hooks/useFindReplace'
import { useFloatingToolbar } from './hooks/useFloatingToolbar'
import { buildSharedTableCss } from './tableStylePolicy'
import {
    isPreferredImageMime,
    isSupportedImageMime,
    loadImageDimensions,
    MAX_IMAGE_DIMENSION_PX,
    MAX_IMAGE_FILE_BYTES,
    resolveFileMime,
} from '../../utils/imagePolicy'
import { showToast } from '../../utils/toast'

function findFirstImage(node: JSONContent | undefined): { src: string; alt: string } | null {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'image' && typeof node.attrs?.src === 'string' && node.attrs.src.trim()) {
        return { src: node.attrs.src, alt: String(node.attrs?.alt ?? '') }
    }
    if (!Array.isArray(node.content)) return null
    for (const child of node.content) {
        const found = findFirstImage(child)
        if (found) return found
    }
    return null
}

function updateFirstImageAlt(node: JSONContent, alt: string): JSONContent {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
        return { ...node, attrs: { ...node.attrs, alt } }
    }
    if (!Array.isArray(node.content)) return node
    let updated = false
    const nextContent = node.content.map((child) => {
        if (updated) return child
        const before = findFirstImage(child)
        if (!before) return child
        updated = true
        return updateFirstImageAlt(child, alt)
    })
    return updated ? { ...node, content: nextContent } : node
}

function imageOnlyDoc(src: string, alt = ''): JSONContent {
    return {
        type: 'doc',
        content: [{ type: 'image', attrs: { src, alt, widthPercent: 100 } }],
    }
}

function requestImageAlt(promptMessage: string): string {
    try {
        if (typeof window.prompt !== 'function') return ''
        return window.prompt(promptMessage, '') ?? ''
    } catch {
        return ''
    }
}

function resolveEditorTypography(
    activeChapter: ReturnType<typeof useChapterStore.getState>['chapters'][number] | undefined,
    settings: ReturnType<typeof useDesignStore.getState>['settings'],
    layoutSection: ReturnType<typeof chapterTypeToLayoutSection>,
) {
    const sectionTypography = settings.sectionTypography[layoutSection]
    return {
        sectionTypography,
        effectiveBodyFontFamily: activeChapter?.fontFamily ?? sectionTypography.h3FontFamily,
        effectiveSubheadFontFamily: activeChapter?.subheadFontFamily ?? sectionTypography.h2FontFamily,
        effectiveTitleFontFamily: activeChapter?.titleFontFamily ?? sectionTypography.h1FontFamily,
        effectiveBodyFontSize: activeChapter?.bodyFontSize ?? sectionTypography.h3FontSize,
        effectiveSubheadFontSize: activeChapter?.subheadFontSize ?? sectionTypography.h2FontSize,
        effectiveTitleFontSize: activeChapter?.titleFontSize ?? sectionTypography.h1FontSize,
        effectiveChapterTitleAlign: activeChapter?.chapterTitleAlign ?? settings.chapterTitleAlign,
        effectiveChapterTitleSpacing: activeChapter?.chapterTitleSpacing ?? settings.chapterTitleSpacing,
    }
}

const BODY_IMAGE_MIN_WIDTH = 800
const BODY_IMAGE_MIN_HEIGHT = 800
const MAX_IMAGE_FILE_MB = Math.floor(MAX_IMAGE_FILE_BYTES / (1024 * 1024))
const IMAGE_INSERT_METRICS_STORAGE_KEY = 'bookspace:image-insert-metrics:v1'

type ImageInsertRecoveryState = {
    visible: boolean
    message: string
}

type ImageInsertSource = 'inline-picker' | 'paste' | 'drop'
type ImageInsertStatus = 'attempt' | 'success' | 'failure' | 'retry'

type ImageInsertMetricPayload = {
    source: ImageInsertSource
    status: ImageInsertStatus
    latencyMs?: number
    reason?: string
}

type ImageInsertMetricSummary = {
    attempts: number
    success: number
    failure: number
    retry: number
    totalLatencyMs: number
    lastUpdatedAt: string
    lastReason: string | null
    bySource: Record<ImageInsertSource, { attempts: number; success: number; failure: number; retry: number }>
}

const DEFAULT_IMAGE_INSERT_METRICS: ImageInsertMetricSummary = {
    attempts: 0,
    success: 0,
    failure: 0,
    retry: 0,
    totalLatencyMs: 0,
    lastUpdatedAt: '',
    lastReason: null,
    bySource: {
        'inline-picker': { attempts: 0, success: 0, failure: 0, retry: 0 },
        paste: { attempts: 0, success: 0, failure: 0, retry: 0 },
        drop: { attempts: 0, success: 0, failure: 0, retry: 0 },
    },
}

function readImageInsertMetrics(): ImageInsertMetricSummary {
    try {
        const raw = window.localStorage.getItem(IMAGE_INSERT_METRICS_STORAGE_KEY)
        if (!raw) return { ...DEFAULT_IMAGE_INSERT_METRICS }
        const parsed = JSON.parse(raw) as Partial<ImageInsertMetricSummary>
        const bySource = {
            'inline-picker': {
                attempts: Number(parsed.bySource?.['inline-picker']?.attempts ?? 0),
                success: Number(parsed.bySource?.['inline-picker']?.success ?? 0),
                failure: Number(parsed.bySource?.['inline-picker']?.failure ?? 0),
                retry: Number(parsed.bySource?.['inline-picker']?.retry ?? 0),
            },
            paste: {
                attempts: Number(parsed.bySource?.paste?.attempts ?? 0),
                success: Number(parsed.bySource?.paste?.success ?? 0),
                failure: Number(parsed.bySource?.paste?.failure ?? 0),
                retry: Number(parsed.bySource?.paste?.retry ?? 0),
            },
            drop: {
                attempts: Number(parsed.bySource?.drop?.attempts ?? 0),
                success: Number(parsed.bySource?.drop?.success ?? 0),
                failure: Number(parsed.bySource?.drop?.failure ?? 0),
                retry: Number(parsed.bySource?.drop?.retry ?? 0),
            },
        }
        return {
            attempts: Number(parsed.attempts ?? 0),
            success: Number(parsed.success ?? 0),
            failure: Number(parsed.failure ?? 0),
            retry: Number(parsed.retry ?? 0),
            totalLatencyMs: Number(parsed.totalLatencyMs ?? 0),
            lastUpdatedAt: typeof parsed.lastUpdatedAt === 'string' ? parsed.lastUpdatedAt : '',
            lastReason: typeof parsed.lastReason === 'string' ? parsed.lastReason : null,
            bySource,
        }
    } catch {
        return { ...DEFAULT_IMAGE_INSERT_METRICS }
    }
}

function trackImageInsertMetrics(payload: ImageInsertMetricPayload) {
    try {
        const next = readImageInsertMetrics()
        const sourceBucket = next.bySource[payload.source]
        if (payload.status === 'attempt') {
            next.attempts += 1
            sourceBucket.attempts += 1
        }
        if (payload.status === 'success') {
            next.success += 1
            sourceBucket.success += 1
        }
        if (payload.status === 'failure') {
            next.failure += 1
            sourceBucket.failure += 1
        }
        if (payload.status === 'retry') {
            next.retry += 1
            sourceBucket.retry += 1
        }
        if (Number.isFinite(payload.latencyMs ?? NaN) && typeof payload.latencyMs === 'number' && payload.latencyMs >= 0) {
            next.totalLatencyMs += Math.round(payload.latencyMs)
        }
        next.lastReason = payload.reason ?? null
        next.lastUpdatedAt = new Date().toISOString()
        window.localStorage.setItem(IMAGE_INSERT_METRICS_STORAGE_KEY, JSON.stringify(next))
    } catch {
        // Metrics collection must not break editing flow.
    }
}

export default function BookEditor() {
    const { t } = useTranslation()
    const activeChapterId = useChapterStore((state) => state.activeChapterId)
    const updateContent = useChapterStore((state) => state.updateContent)
    const renameChapter = useChapterStore((state) => state.renameChapter)
    const setEditorInstance = useEditorStore((state) => state.setEditor)
    const activeChapterTitle = useChapterStore((state) => {
        if (!state.activeChapterId) return null
        return state.chapters.find((c) => c.id === state.activeChapterId)?.title ?? null
    })
    const activeChapter = useChapterStore((state) => {
        if (!state.activeChapterId) return undefined
        return state.chapters.find((c) => c.id === state.activeChapterId)
    })
    const metadata = useProjectStore((state) => state.metadata)
    const { settings } = useDesignStore()
    const layoutSection = chapterTypeToLayoutSection(activeChapter?.chapterType)
    const {
        sectionTypography,
        effectiveBodyFontFamily,
        effectiveSubheadFontFamily,
        effectiveTitleFontFamily,
        effectiveBodyFontSize,
        effectiveSubheadFontSize,
        effectiveTitleFontSize,
        effectiveChapterTitleAlign,
        effectiveChapterTitleSpacing,
    } = useMemo(
        () => resolveEditorTypography(activeChapter, settings, layoutSection),
        [activeChapter, settings, layoutSection],
    )
    const fontCssStack = useMemo(() => getFontCssStack(effectiveBodyFontFamily), [effectiveBodyFontFamily])
    const contrastFontCssStack = useMemo(() => getContrastFontCssStack(effectiveBodyFontFamily), [effectiveBodyFontFamily])
    const serifFontCssStack = useMemo(() => getFontCssStack('Noto Serif KR'), [])
    const sansFontCssStack = useMemo(() => getFontCssStack('Pretendard'), [])
    const subheadFontCssStack = useMemo(() => getFontCssStack(effectiveSubheadFontFamily), [effectiveSubheadFontFamily])
    const titleFontCssStack = useMemo(() => getFontCssStack(effectiveTitleFontFamily), [effectiveTitleFontFamily])
    const effectivePageBackground = activeChapter?.pageBackgroundColor ?? '#ffffff'
    const activeChapterContentType = activeChapter?.chapterContentType ?? 'text'
    const isImagePage = activeChapterContentType === 'image'
    const firstImage = useMemo(() => findFirstImage(activeChapter?.content), [activeChapter?.content])
    const imageAlt = firstImage?.alt ?? ''
    const [title, setTitle] = useState('')
    const [showCopyrightPresetConfirm, setShowCopyrightPresetConfirm] = useState(false)
    const imageInputRef = useRef<HTMLInputElement | null>(null)
    const inlineImageInputRef = useRef<HTMLInputElement | null>(null)
    const [imageInsertRecovery, setImageInsertRecovery] = useState<ImageInsertRecoveryState>({
        visible: false,
        message: '',
    })
    const loadedChapterIdRef = useRef<string | null>(null)
    const activeChapterIdRef = useRef<string | null>(activeChapterId)
    const { editorProps, imeComposingRef } = useBookEditorProps()

    useEffect(() => {
        if (!activeChapterId) {
            setTitle('')
            loadedChapterIdRef.current = null
            return
        }
        if (activeChapterTitle !== null) {
            setTitle(activeChapterTitle === t('editor.untitled') ? '' : activeChapterTitle)
        }
    }, [activeChapterId, activeChapterTitle, t])

    useEffect(() => {
        activeChapterIdRef.current = activeChapterId
    }, [activeChapterId])

    const editorCardRef = useRef<HTMLDivElement | null>(null)
    const editorScrollRef = useRef<HTMLDivElement | null>(null)
    const singleCardWidth = useEditorCardWidth(editorCardRef)

    const singleTypographyScale = useMemo(() => {
        // Keep defaults at typical canvas widths; scale up only when canvas is wider.
        const raw = singleCardWidth / 760
        return Math.max(1, Math.min(1.22, raw))
    }, [singleCardWidth])

    const {
        slashMenu: { isOpen: slashMenuVisible, position: slashMenuPosition, query: slashMenuQuery },
        closeSlashMenu,
        toggleSlashMenu,
        checkSlashCommand,
    } = useSlashMenu()

    const [blockMenu, setBlockMenu] = useState<BlockMenuState>({
        visible: false,
        top: 0,
        left: 0,
        blockPos: 0,
    })
    const [showBlockTypeMenu, setShowBlockTypeMenu] = useState(false)

    const saveContent = useCallback(
        (content: JSONContent) => {
            const chapterId = activeChapterIdRef.current
            if (chapterId) {
                updateContent(chapterId, content)
            }
        },
        [updateContent]
    )

    const debouncedUpdate = useDebounce((content: JSONContent) => {
        saveContent(content)
    }, 1000)

    const extensions = useBookEditorExtensions(t)

    const editor = useEditor({
        extensions,
        content: EMPTY_EDITOR_DOC,
        editorProps,
        onUpdate: ({ editor }) => {
            if (editor.view.composing || imeComposingRef.current) {
                return
            }

            // 내용 변경 시 Debounce 저장
            debouncedUpdate(editor.getJSON())

            // 슬래시 커맨드 감지 위임
            checkSlashCommand(editor)
        },
    })

    const applyCopyrightPreset = useCallback(() => {
        if (!activeChapterId || !editor) return
        const existing = activeChapter?.content
        if (!isDefaultEmptyContent(existing)) {
            setShowCopyrightPresetConfirm(true)
            return
        }
        const presetContent = buildCopyrightPresetContent(metadata)
        editor.commands.setContent(presetContent, { emitUpdate: false })
        updateContent(activeChapterId, presetContent)
        editor.commands.focus('end')
    }, [activeChapter?.content, activeChapterId, editor, metadata, updateContent])

    const {
        showFindReplace,
        setShowFindReplace,
        findQuery,
        setFindQuery,
        replaceText,
        setReplaceText,
        findStatus,
        findInputRef,
        runSearch,
        runFindNext,
        runFindPrev,
        runReplaceOne,
        runReplaceAll,
        options,
        updateOptions,
        hasSelectionScope,
        matches,
        statusCount,
        pendingReplaceAllConfirm,
        refreshMatches,
    } = useFindReplace({ editor, t })
    const {
        floatingToolbar,
        floatingToolbarRef,
        updateFloatingToolbarPosition,
    } = useFloatingToolbar({
        editor,
        editorScrollRef,
    })

    const confirmApplyCopyrightPreset = useCallback(() => {
        if (!activeChapterId || !editor) return
        const presetContent = buildCopyrightPresetContent(metadata)
        editor.commands.setContent(presetContent, { emitUpdate: false })
        updateContent(activeChapterId, presetContent)
        editor.commands.focus('end')
        setShowCopyrightPresetConfirm(false)
    }, [activeChapterId, editor, metadata, updateContent])

    const commitChapterTitle = useCallback(
        (focusEditorAfterCommit = false) => {
            const chapterId = activeChapterIdRef.current
            if (!chapterId) return
            const currentTitle = useChapterStore
                .getState()
                .chapters.find((c) => c.id === chapterId)?.title
            const normalizedTitle = title.trim()
            const nextTitle = normalizedTitle.length > 0 ? normalizedTitle : t('editor.untitled')
            if (currentTitle !== undefined && nextTitle !== currentTitle) {
                renameChapter(chapterId, nextTitle)
            }
            if (focusEditorAfterCommit) {
                editor?.commands.focus()
            }
        },
        [editor, renameChapter, t, title],
    )

    const setSelectionAtBlock = useCallback(
        (blockPos: number) => {
            if (!editor) return
            const { doc, tr } = editor.state
            const maxPos = Math.max(0, doc.content.size)
            const safePos = Math.min(Math.max(0, blockPos), maxPos)
            const nodeAt = doc.nodeAt(safePos)

            let nextSelection: Selection
            if (nodeAt?.type?.name === 'table') {
                nextSelection = NodeSelection.create(doc, safePos)
            } else if (nodeAt && nodeAt.isBlock && !nodeAt.isTextblock) {
                nextSelection = Selection.near(doc.resolve(Math.min(safePos + 1, maxPos)), 1)
            } else {
                const target = Math.min(Math.max(1, safePos + 1), Math.max(1, maxPos))
                nextSelection = TextSelection.create(doc, target)
            }

            editor.view.dispatch(tr.setSelection(nextSelection))
            editor.view.focus()
        },
        [editor]
    )

    const {
        blockDrag,
        setBlockDrag,
        attachDragPreview,
        cleanupDragPreview,
        findTopLevelBlockIndex,
        pickBlockElement,
        handleEditorDragOver,
        handleEditorDrop,
    } = useEditorDragDrop(editor, editorCardRef, editorScrollRef, setSelectionAtBlock)

    const {
        blockHandle,
        didDragHandleRef,
        closeBlockMenu,
        clearHideHandleTimer,
        scheduleHideHandle,
        handleEditorMouseMove,
        handleEditorMouseLeave,
        handleEditorScroll,
    } = useBlockHandleController({
        editor,
        editorCardRef,
        blockMenu,
        setBlockMenu,
        pickBlockElement,
        updateFloatingToolbarPosition,
        cleanupDragPreview,
    })

    const {
        splitBlockAtCursor,
        duplicateBlock,
        deleteBlock,
        insertSiblingParagraphAfterBlock,
        convertBlockType,
        getAvailableBlockTypes,
    } = useBlockCommands({
        editor,
        blockPos: blockMenu.blockPos,
        findTopLevelBlockIndex,
        setSelectionAtBlock,
        closeBlockMenu,
    })

    // 챕터 전환 시 에디터 컨텐츠 교체
    useEffect(() => {
        if (!editor || !activeChapterId) return
        if (loadedChapterIdRef.current === activeChapterId) return
        const chapter = useChapterStore
            .getState()
            .chapters.find((c) => c.id === activeChapterId)
        if (!chapter) return

        editor.commands.setContent(chapter.content, { emitUpdate: false })
        loadedChapterIdRef.current = activeChapterId
        closeSlashMenu()
    }, [editor, activeChapterId, closeSlashMenu])

    useEffect(() => {
        setEditorInstance(editor ?? null)
        return () => setEditorInstance(null)
    }, [editor, setEditorInstance])

    const upsertImageContent = useCallback(
        (src: string) => {
            if (!activeChapterId) return
            const currentAlt = firstImage?.alt ?? ''
            updateContent(activeChapterId, imageOnlyDoc(src, currentAlt))
        },
        [activeChapterId, firstImage?.alt, updateContent],
    )

    const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            const value = String(reader.result ?? '')
            if (!value) return
            upsertImageContent(value)
        }
        reader.readAsDataURL(file)
        event.target.value = ''
    }, [upsertImageContent])

    const handleImageRemove = useCallback(() => {
        if (!activeChapterId) return
        updateContent(activeChapterId, EMPTY_EDITOR_DOC)
    }, [activeChapterId, updateContent])

    const handleAltChange = useCallback(
        (nextAlt: string) => {
            if (!activeChapterId || !activeChapter?.content) return
            const nextContent = updateFirstImageAlt(activeChapter.content, nextAlt)
            updateContent(activeChapterId, nextContent)
        },
        [activeChapter?.content, activeChapterId, updateContent],
    )
    const closeFindReplace = useCallback(() => {
        setShowFindReplace(false)
    }, [setShowFindReplace])

    const sharedTableCss = useMemo(
        () => buildSharedTableCss('.book-editor .ProseMirror', sansFontCssStack, 'editor'),
        [sansFontCssStack],
    )

    const showImageInsertRecovery = useCallback(
        (message: string) => {
            setImageInsertRecovery({ visible: true, message })
        },
        [],
    )

    const insertImageFromFile = useCallback(
        async (file: File, dropPos?: number, source: ImageInsertSource = 'inline-picker') => {
            if (!editor) return
            const startedAt = performance.now()
            trackImageInsertMetrics({ source, status: 'attempt' })
            const fail = (message: string, reason: string) => {
                showToast(message, 'error')
                showImageInsertRecovery(message)
                trackImageInsertMetrics({
                    source,
                    status: 'failure',
                    reason,
                    latencyMs: performance.now() - startedAt,
                })
            }
            if (file.size > MAX_IMAGE_FILE_BYTES) {
                const message = t('rightPane.imageMaxFileSize', { sizeMB: MAX_IMAGE_FILE_MB })
                fail(message, 'file-size-limit')
                return
            }
            const mime = resolveFileMime(file)
            if (!mime || !isSupportedImageMime(mime)) {
                const message = t('rightPane.unsupportedImageType')
                fail(message, 'unsupported-mime')
                return
            }
            if (!isPreferredImageMime(mime)) {
                showToast(t('rightPane.imagePreferredFormatHint'), 'info')
            }
            const size = await loadImageDimensions(file)
            if (!size) {
                const message = t('rightPane.unsupportedImageType')
                fail(message, 'unreadable-image')
                return
            }
            if (size.width > MAX_IMAGE_DIMENSION_PX || size.height > MAX_IMAGE_DIMENSION_PX) {
                const message = t('rightPane.imageMaxDimensions', {
                    width: size.width,
                    height: size.height,
                    max: MAX_IMAGE_DIMENSION_PX,
                })
                fail(message, 'pixel-size-limit')
                return
            }
            if (size.width < BODY_IMAGE_MIN_WIDTH || size.height < BODY_IMAGE_MIN_HEIGHT) {
                showToast(
                    t('rightPane.imageMinDimensions', {
                        label: t('slashCommand.items.image.label'),
                        width: size.width,
                        height: size.height,
                        minWidth: BODY_IMAGE_MIN_WIDTH,
                        minHeight: BODY_IMAGE_MIN_HEIGHT,
                    }),
                    'info',
                )
            }

            const src = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onload = () => resolve(String(reader.result ?? ''))
                reader.onerror = () => resolve('')
                reader.readAsDataURL(file)
            })
            if (!src) {
                const message = t('rightPane.unsupportedImageType')
                fail(message, 'file-reader-failed')
                return
            }
            const alt = requestImageAlt(
                t('bookEditor.imageAltPrompt', {
                    defaultValue: '이미지 설명(대체 텍스트)을 입력하세요. 필요 없으면 비워두세요.',
                }),
            )
            const chain = editor.chain().focus()
            if (Number.isFinite(dropPos) && typeof dropPos === 'number') {
                chain.setTextSelection(dropPos)
            }
            const imageAttrs = { src, alt: alt.trim(), widthPercent: 100 }
            const inserted = chain.setImage(imageAttrs).run()
            if (!inserted) {
                const fallbackInserted = editor
                    .chain()
                    .focus('end')
                    .insertContent({ type: 'image', attrs: imageAttrs })
                    .run()
                if (!fallbackInserted) {
                    const message = t('bookEditor.imageInsertCommandFailed', {
                        defaultValue: '이미지 삽입 위치를 찾지 못했습니다. 커서를 본문에 두고 다시 시도해 주세요.',
                    })
                    fail(message, 'command-rejected')
                    return
                }
            }
            setImageInsertRecovery({ visible: false, message: '' })
            trackImageInsertMetrics({
                source,
                status: 'success',
                latencyMs: performance.now() - startedAt,
            })
        },
        [editor, showImageInsertRecovery, t],
    )

    const handleEditorPasteCapture = useCallback(
        (event: React.ClipboardEvent<HTMLDivElement>) => {
            if (!editor) return
            const files = Array.from(event.clipboardData?.files ?? [])
            const imageFile = files.find((file) => {
                const mime = resolveFileMime(file)
                return Boolean(mime && isSupportedImageMime(mime))
            })
            if (!imageFile) return
            event.preventDefault()
            event.stopPropagation()
            void insertImageFromFile(imageFile, undefined, 'paste')
        },
        [editor, insertImageFromFile],
    )

    const handleEditorDropCapture = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            if (!editor) return
            const isBlockMove = event.dataTransfer.types.includes('application/x-epub-block-move')
            if (isBlockMove) {
                handleEditorDrop(event)
                return
            }
            const files = Array.from(event.dataTransfer.files ?? [])
            const imageFile = files.find((file) => {
                const mime = resolveFileMime(file)
                return Boolean(mime && isSupportedImageMime(mime))
            })
            if (!imageFile) {
                handleEditorDrop(event)
                return
            }
            event.preventDefault()
            event.stopPropagation()
            const coords = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
            const dropPos = coords?.pos ?? editor.state.selection.from
            void insertImageFromFile(imageFile, dropPos, 'drop')
        },
        [editor, handleEditorDrop, insertImageFromFile],
    )

    const handleInlineImageInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            if (!file) return
            void insertImageFromFile(file, undefined, 'inline-picker')
            event.target.value = ''
        },
        [insertImageFromFile],
    )

    useEffect(() => {
        const focusTimers: number[] = []
        const canOpenFindReplace = () => Boolean(activeChapterIdRef.current)
        if (typeof window.electronAPI.onMenuAction !== 'function') return
        const unsubscribe = window.electronAPI.onMenuAction((action) => {
            if (action === 'open-find-replace') {
                if (!canOpenFindReplace()) {
                    setShowFindReplace(false)
                    return
                }
                setShowFindReplace(true)
                focusTimers.push(
                    window.setTimeout(() => {
                        findInputRef.current?.focus()
                        refreshMatches(findQuery)
                    }, 0),
                )
                return
            }
            if (action === 'find-next') {
                if (!canOpenFindReplace()) {
                    setShowFindReplace(false)
                    return
                }
                if (!showFindReplace) {
                    setShowFindReplace(true)
                }
                if (findQuery.trim()) {
                    runFindNext(findQuery)
                } else {
                    focusTimers.push(
                        window.setTimeout(() => {
                            findInputRef.current?.focus()
                            refreshMatches(findQuery)
                        }, 0),
                    )
                }
                return
            }
            if (action === 'find-prev') {
                if (!canOpenFindReplace()) {
                    setShowFindReplace(false)
                    return
                }
                if (!showFindReplace) {
                    setShowFindReplace(true)
                }
                if (findQuery.trim()) {
                    runFindPrev(findQuery)
                } else {
                    focusTimers.push(
                        window.setTimeout(() => {
                            findInputRef.current?.focus()
                            refreshMatches(findQuery)
                        }, 0),
                    )
                }
            }
        })
        return () => {
            unsubscribe()
            for (const timeoutId of focusTimers) {
                window.clearTimeout(timeoutId)
            }
        }
    }, [findInputRef, findQuery, refreshMatches, runFindNext, runFindPrev, setShowFindReplace, showFindReplace])

    useEffect(() => {
        const handleOpenFindReplace = () => {
            if (!activeChapterIdRef.current) {
                setShowFindReplace(false)
                return
            }
            setShowFindReplace(true)
            window.setTimeout(() => {
                findInputRef.current?.focus()
                refreshMatches(findQuery)
            }, 0)
        }
        window.addEventListener('bookspace:open-find-replace', handleOpenFindReplace as EventListener)
        return () => {
            window.removeEventListener('bookspace:open-find-replace', handleOpenFindReplace as EventListener)
        }
    }, [findInputRef, findQuery, refreshMatches, setShowFindReplace])

    if (!activeChapterId) {
        return (
            <div className="flex flex-1 items-center justify-center bg-neutral-100 px-6">
                <div className="w-full max-w-[560px] rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-6 text-left shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-text-neutral-muted)]">
                        {t('bookEditor.emptyEyebrow')}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-[var(--ds-text-neutral-primary)]">
                        {t('bookEditor.emptyTitle')}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--ds-text-neutral-muted)]">
                        {t('bookEditor.selectChapterHint')}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div
            ref={editorScrollRef}
            className="relative flex-1 overflow-y-auto flex justify-center py-10 px-6 md:px-10 bg-neutral-100"
            style={{ backgroundColor: effectivePageBackground }}
            onScroll={handleEditorScroll}
        >
            <style>{sharedTableCss}</style>
            {editor && floatingToolbar.visible && (
                <div
                    ref={floatingToolbarRef}
                    data-floating-toolbar="true"
                    className="fixed z-30"
                    style={{
                        left: floatingToolbar.left,
                        top: floatingToolbar.top,
                        transform:
                            floatingToolbar.placement === 'above'
                                ? 'translate(-50%, calc(-100% - 8px))'
                                : 'translate(-50%, 8px)',
                    }}
                >
                    <BubbleToolbar editor={editor} />
                </div>
            )}
            <div className="w-full max-w-[1040px] flex flex-col gap-6">
                <div
                    ref={editorCardRef}
                    className={`book-editor w-full h-auto px-12 md:px-16 py-8 md:py-10 text-neutral-900 ${settings.suppressFirstParagraphIndent ? 'no-first-indent' : ''
                        } relative`}
                    onMouseMove={handleEditorMouseMove}
                    onMouseLeave={handleEditorMouseLeave}
                    onDragOverCapture={handleEditorDragOver}
                    onPasteCapture={handleEditorPasteCapture}
                    onDropCapture={handleEditorDropCapture}
                    onDragOver={handleEditorDragOver}
                    onDrop={handleEditorDrop}
                    style={{
                        fontFamily: fontCssStack,
                        fontSize: effectiveBodyFontSize,
                        lineHeight: settings.lineHeight,
                        letterSpacing: `${settings.letterSpacing}em`,
                        ['--editor-font-family' as string]: fontCssStack,
                        ['--editor-subhead-font-family' as string]: subheadFontCssStack,
                        ['--editor-title-font-family' as string]: titleFontCssStack,
                        ['--editor-contrast-font-family' as string]: contrastFontCssStack,
                        ['--editor-serif-font-family' as string]: serifFontCssStack,
                        ['--editor-sans-font-family' as string]: sansFontCssStack,
                        ['--editor-font-size' as string]: `${Math.round(effectiveBodyFontSize * singleTypographyScale * 100) / 100}px`,
                        ['--editor-subhead-font-size' as string]: `${Math.round(effectiveSubheadFontSize * singleTypographyScale * 100) / 100}px`,
                        ['--editor-title-font-size' as string]: `${Math.round(effectiveTitleFontSize * singleTypographyScale * 100) / 100}px`,
                        ['--editor-h4-font-family' as string]: getFontCssStack(sectionTypography.h4FontFamily),
                        ['--editor-h5-font-family' as string]: getFontCssStack(sectionTypography.h5FontFamily),
                        ['--editor-h6-font-family' as string]: getFontCssStack(sectionTypography.h6FontFamily),
                        ['--editor-h4-font-size' as string]: `${Math.round(sectionTypography.h4FontSize * singleTypographyScale * 100) / 100}px`,
                        ['--editor-h5-font-size' as string]: `${Math.round(sectionTypography.h5FontSize * singleTypographyScale * 100) / 100}px`,
                        ['--editor-h6-font-size' as string]: `${Math.round(sectionTypography.h6FontSize * singleTypographyScale * 100) / 100}px`,
                        ['--editor-line-height' as string]: String(settings.lineHeight),
                        ['--editor-letter-spacing' as string]: `${settings.letterSpacing}em`,
                        ['--editor-paragraph-spacing' as string]: `${settings.paragraphSpacing}em`,
                        ['--editor-text-indent' as string]: `${settings.textIndent}em`,
                        ['--editor-image-max-width' as string]: `${settings.imageMaxWidth}%`,
                        ['--editor-content-min-height' as string]: `${Math.max(280, Math.round(singleCardWidth * 0.42))}px`,
                    }}
                >
                    <input
                        type="text"
                        className="w-full pl-[2.2rem] pr-8 text-2xl font-bold mb-8 text-neutral-800 outline-none placeholder-neutral-300 bg-transparent"
                        style={{
                            textAlign: effectiveChapterTitleAlign,
                            marginBottom: `${effectiveChapterTitleSpacing}em`,
                            borderBottom: settings.chapterTitleDivider ? '1px solid #e5e7eb' : '0',
                            paddingBottom: settings.chapterTitleDivider ? '0.45em' : '0',
                            fontSize: `${Math.round(effectiveTitleFontSize * singleTypographyScale * 100) / 100}px`,
                            fontFamily: titleFontCssStack,
                        }}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={() => commitChapterTitle()}
                        onKeyUp={(e) => {
                            const nativeEvent = e.nativeEvent as KeyboardEvent & { keyCode?: number }
                            const isImeComposing =
                                nativeEvent.isComposing || nativeEvent.keyCode === 229

                            if (e.key === 'Enter' && !isImeComposing) {
                                // 엔터 시 저장
                                commitChapterTitle(true)
                            }
                        }}
                        placeholder={t('editor.untitled')}
                    />
                    {!isImagePage && imageInsertRecovery.visible ? (
                        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <p className="font-medium">
                                {t('bookEditor.imageInsertFailedTitle', {
                                    defaultValue: '이미지 삽입에 실패했습니다.',
                                })}
                            </p>
                            <p className="mt-1 text-amber-800">{imageInsertRecovery.message}</p>
                            <div className="mt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        trackImageInsertMetrics({
                                            source: 'inline-picker',
                                            status: 'retry',
                                            reason: 'banner-retry',
                                        })
                                        inlineImageInputRef.current?.click()
                                    }}
                                    className="rounded-md border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                                >
                                    {t('bookEditor.imageInsertRetry', { defaultValue: '다시 선택' })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setImageInsertRecovery({ visible: false, message: '' })}
                                    className="rounded-md px-2 py-1 text-[11px] text-amber-900 hover:bg-amber-100"
                                >
                                    {t('common.close', { defaultValue: '닫기' })}
                                </button>
                            </div>
                        </div>
                    ) : null}
                    {!isImagePage ? (
                        <input
                            ref={inlineImageInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            className="hidden"
                            onChange={handleInlineImageInputChange}
                        />
                    ) : null}
                    {activeChapter?.chapterKind === 'copyright' && !isImagePage && (
                        <div className="mb-4 flex justify-end">
                            <button
                                type="button"
                                onClick={applyCopyrightPreset}
                                className="text-xs px-2.5 py-1.5 rounded border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors"
                            >
                                {t('bookEditor.applyCopyrightPreset')}
                            </button>
                        </div>
                    )}

                    {isImagePage ? (
                        <div className="rounded-xl border border-neutral-200 bg-white/90 p-4 md:p-5">
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageUpload}
                            />
                            {firstImage?.src ? (
                                <div className="flex flex-col gap-3">
                                    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                                        <img
                                            src={firstImage.src}
                                            alt={imageAlt || t('bookEditor.imagePageFallbackAlt')}
                                            className="mx-auto max-h-[60vh] w-auto max-w-full object-contain"
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => imageInputRef.current?.click()}
                                            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
                                        >
                                            {t('bookEditor.imagePageReplace')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleImageRemove}
                                            className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
                                        >
                                            {t('bookEditor.imagePageRemove')}
                                        </button>
                                    </div>
                                    <label className="flex flex-col gap-1 text-xs text-neutral-500">
                                        <span>{t('bookEditor.imagePageAltLabel')}</span>
                                        <input
                                            value={imageAlt}
                                            onChange={(e) => handleAltChange(e.target.value)}
                                            placeholder={t('bookEditor.imagePageAltPlaceholder')}
                                            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </label>
                                </div>
                            ) : (
                                <div className="flex flex-col items-start gap-3">
                                    <p className="text-sm text-neutral-500">{t('bookEditor.imagePageHint')}</p>
                                    <button
                                        type="button"
                                        onClick={() => imageInputRef.current?.click()}
                                        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                                    >
                                        {t('bookEditor.imagePageUpload')}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* 에디터 본문 */}
                            <EditorContent editor={editor} className="tiptap-root" />
                            {editor && (
                                <BlockControlsOverlay
                                    editor={editor}
                                    blockHandle={blockHandle}
                                    blockMenu={blockMenu}
                                    blockDrag={blockDrag}
                                    showBlockTypeMenu={showBlockTypeMenu}
                                    didDragHandleRef={didDragHandleRef}
                                    clearHideHandleTimer={clearHideHandleTimer}
                                    scheduleHideHandle={scheduleHideHandle}
                                    insertSiblingParagraphAfterBlock={insertSiblingParagraphAfterBlock}
                                    toggleSlashMenu={toggleSlashMenu}
                                    attachDragPreview={attachDragPreview}
                                    setSelectionAtBlock={setSelectionAtBlock}
                                    setBlockMenu={setBlockMenu}
                                    closeBlockMenu={closeBlockMenu}
                                    setBlockDrag={setBlockDrag}
                                    cleanupDragPreview={cleanupDragPreview}
                                    setShowBlockTypeMenu={setShowBlockTypeMenu}
                                    convertBlockType={convertBlockType}
                                    splitBlockAtCursor={splitBlockAtCursor}
                                    availableBlockTypes={getAvailableBlockTypes()}
                                    duplicateBlock={duplicateBlock}
                                    deleteBlock={deleteBlock}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* 슬래시 커맨드 메뉴 */}
            {slashMenuVisible && editor && !isImagePage && (
                <SlashCommandMenu
                    editor={editor}
                    visible={slashMenuVisible}
                    position={{ top: slashMenuPosition?.top ?? 0, left: slashMenuPosition?.left ?? 0 }}
                    query={slashMenuQuery}
                    onClose={closeSlashMenu}
                />
            )}
            <ConfirmDialog
                open={showCopyrightPresetConfirm}
                title={t('bookEditor.confirmTitle')}
                description={t('bookEditor.confirmDescription')}
                confirmLabel={t('bookEditor.overwrite')}
                cancelLabel={t('common.cancel')}
                onConfirm={confirmApplyCopyrightPreset}
                onCancel={() => setShowCopyrightPresetConfirm(false)}
            />
            {showFindReplace && (
                <FindReplacePanel
                    t={t}
                    findInputRef={findInputRef}
                    findQuery={findQuery}
                    replaceText={replaceText}
                    findStatus={findStatus}
                    countCurrent={statusCount.current}
                    countTotal={statusCount.total}
                    pendingReplaceAllConfirm={pendingReplaceAllConfirm}
                    scope={options.scope}
                    hasSelectionScope={hasSelectionScope}
                    matchPreviews={matches.slice(0, 5).map((match) => match.preview)}
                    onClose={closeFindReplace}
                    onFindQueryChange={setFindQuery}
                    onSearch={runSearch}
                    onReplaceTextChange={setReplaceText}
                    onScopeChange={(scope) => updateOptions({ scope })}
                    onFindPrev={() => runFindPrev(findQuery)}
                    onFindNext={() => runFindNext(findQuery)}
                    onReplaceOne={runReplaceOne}
                    onReplaceAll={runReplaceAll}
                />
            )}
        </div>
    )
}
