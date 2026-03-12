import type { Editor, JSONContent } from '@tiptap/core'
import type { TFunction } from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChapterStore } from '../useChapterStore'
import {
    buildProjectMatchesFromContent,
    replaceAllOccurrencesInContent,
    replaceNthOccurrenceInContent,
    type FindMatch,
} from '../findReplaceCore'

interface SearchSegment {
    globalStart: number
    globalEnd: number
    docFrom: number
}

type FindScope = 'chapter' | 'project'

interface FindOptions {
    scope: FindScope
}

interface UseFindReplaceInput {
    editor: Editor | null
    t: TFunction
}

function buildSearchIndex(editor: Editor | null) {
    if (!editor) return { text: '', segments: [] as SearchSegment[] }
    let globalCursor = 0
    const chunks: string[] = []
    const segments: SearchSegment[] = []

    editor.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return
        const text = node.text
        const start = globalCursor
        const end = start + text.length
        chunks.push(text)
        segments.push({
            globalStart: start,
            globalEnd: end,
            docFrom: pos,
        })
        globalCursor = end
    })

    return {
        text: chunks.join(''),
        segments,
    }
}

function globalToDoc(globalPos: number, segments: SearchSegment[]) {
    for (const segment of segments) {
        if (globalPos >= segment.globalStart && globalPos <= segment.globalEnd) {
            return segment.docFrom + (globalPos - segment.globalStart)
        }
    }
    const last = segments[segments.length - 1]
    if (!last) return 0
    return last.docFrom + (last.globalEnd - last.globalStart)
}

export function useFindReplace({ editor, t }: UseFindReplaceInput) {
    const chapters = useChapterStore((state) => state.chapters)
    const activeChapterId = useChapterStore((state) => state.activeChapterId)
    const setActiveChapter = useChapterStore((state) => state.setActiveChapter)
    const updateContent = useChapterStore((state) => state.updateContent)

    const [showFindReplace, setShowFindReplace] = useState(false)
    const [findQuery, setFindQuery] = useState('')
    const [replaceText, setReplaceText] = useState('')
    const [findStatus, setFindStatus] = useState('')
    const [options, setOptions] = useState<FindOptions>({ scope: 'chapter' })
    const [matches, setMatches] = useState<FindMatch[]>([])
    const [activeMatchIndex, setActiveMatchIndex] = useState(-1)
    const [pendingReplaceAllConfirm, setPendingReplaceAllConfirm] = useState(false)
    const [pendingProjectSelection, setPendingProjectSelection] = useState<
        { chapterId: string; occurrenceInChapter: number } | null
    >(null)
    const findInputRef = useRef<HTMLInputElement | null>(null)

    const buildChapterMatches = useCallback(
        (query: string, targetEditor = editor): FindMatch[] => {
            if (!targetEditor || !activeChapterId) return []
            const needleRaw = query.trim()
            if (!needleRaw) return []

            const { text, segments } = buildSearchIndex(targetEditor)
            if (!text || segments.length === 0) return []

            const source = text.toLocaleLowerCase()
            const needle = needleRaw.toLocaleLowerCase()
            let cursor = 0
            let occurrenceInChapter = 0
            const found: FindMatch[] = []

            while (cursor <= source.length - needle.length) {
                const foundIndex = source.indexOf(needle, cursor)
                if (foundIndex < 0) break
                const globalStart = foundIndex
                const globalEnd = globalStart + needle.length
                found.push({
                    chapterId: activeChapterId,
                    occurrenceInChapter,
                    from: globalToDoc(globalStart, segments),
                    to: globalToDoc(globalEnd, segments),
                    preview: buildPreview(text, globalStart, globalEnd),
                })
                occurrenceInChapter += 1
                cursor = foundIndex + Math.max(needle.length, 1)
            }

            return found
        },
        [activeChapterId, editor],
    )

    const buildProjectMatches = useCallback(
        (query: string): FindMatch[] => {
            if (!query.trim()) return []
            const sorted = [...chapters].sort((a, b) => a.order - b.order)
            const found: FindMatch[] = []
            for (const chapter of sorted) {
                found.push(...buildProjectMatchesFromContent(chapter.id, chapter.content, query))
            }
            return found
        },
        [chapters],
    )

    const selectMatch = useCallback(
        (nextMatches: FindMatch[], index: number) => {
            if (nextMatches.length === 0) return false
            const safeIndex = Math.max(0, Math.min(index, nextMatches.length - 1))
            const target = nextMatches[safeIndex]

            if (options.scope === 'chapter') {
                if (!editor || typeof target.from !== 'number' || typeof target.to !== 'number') return false
                editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).run()
                setActiveMatchIndex(safeIndex)
                setFindStatus('')
                return true
            }

            setActiveMatchIndex(safeIndex)
            setFindStatus('')

            if (target.chapterId === activeChapterId && editor) {
                const currentChapterMatches = buildChapterMatches(findQuery)
                const local = currentChapterMatches[target.occurrenceInChapter]
                if (local && typeof local.from === 'number' && typeof local.to === 'number') {
                    editor.chain().focus().setTextSelection({ from: local.from, to: local.to }).run()
                }
                return true
            }

            setPendingProjectSelection({
                chapterId: target.chapterId,
                occurrenceInChapter: target.occurrenceInChapter,
            })
            setActiveChapter(target.chapterId)
            return true
        },
        [activeChapterId, buildChapterMatches, editor, findQuery, options.scope, setActiveChapter],
    )

    const refreshMatches = useCallback(
        (query = findQuery, nextOptions = options) => {
            const nextMatches = nextOptions.scope === 'project' ? buildProjectMatches(query) : buildChapterMatches(query)
            setMatches(nextMatches)
            if (nextMatches.length === 0) {
                setActiveMatchIndex(-1)
                if (query.trim()) {
                    if (!findStatus || findStatus === t('findReplace.notFound')) {
                        setFindStatus(t('findReplace.notFound'))
                    }
                } else {
                    setFindStatus('')
                }
            } else if (activeMatchIndex >= nextMatches.length) {
                setActiveMatchIndex(0)
                setFindStatus('')
            } else {
                setFindStatus('')
            }
            return nextMatches
        },
        [activeMatchIndex, buildChapterMatches, buildProjectMatches, findQuery, findStatus, options, t],
    )

    useEffect(() => {
        if (!pendingProjectSelection || options.scope !== 'project') return
        if (!editor || activeChapterId !== pendingProjectSelection.chapterId) return

        const chapterMatches = buildChapterMatches(findQuery)
        const local = chapterMatches[pendingProjectSelection.occurrenceInChapter]
        if (local && typeof local.from === 'number' && typeof local.to === 'number') {
            editor.chain().focus().setTextSelection({ from: local.from, to: local.to }).run()
        }
        setPendingProjectSelection(null)
    }, [
        activeChapterId,
        buildChapterMatches,
        editor,
        findQuery,
        options.scope,
        pendingProjectSelection,
    ])

    const runFindNext = useCallback(
        (query: string) => {
            const nextMatches = refreshMatches(query)
            if (nextMatches.length === 0) return false
            const nextIndex = activeMatchIndex >= 0 ? (activeMatchIndex + 1) % nextMatches.length : 0
            return selectMatch(nextMatches, nextIndex)
        },
        [activeMatchIndex, refreshMatches, selectMatch],
    )

    const runFindPrev = useCallback(
        (query: string) => {
            const nextMatches = refreshMatches(query)
            if (nextMatches.length === 0) return false
            const prevIndex =
                activeMatchIndex >= 0
                    ? (activeMatchIndex - 1 + nextMatches.length) % nextMatches.length
                    : nextMatches.length - 1
            return selectMatch(nextMatches, prevIndex)
        },
        [activeMatchIndex, refreshMatches, selectMatch],
    )

    const runSearch = useCallback(() => {
        const query = findQuery.trim()
        if (!query) {
            setMatches([])
            setActiveMatchIndex(-1)
            setFindStatus('')
            return false
        }
        const nextMatches = refreshMatches(findQuery)
        if (nextMatches.length === 0) return false
        return selectMatch(nextMatches, 0)
    }, [findQuery, refreshMatches, selectMatch])

    const runReplaceOne = useCallback(() => {
        const needle = findQuery.trim()
        if (!needle) return
        if (!replaceText.trim()) {
            setFindStatus(t('findReplace.replaceTextRequired'))
            return
        }

        const nextMatches = refreshMatches(findQuery)
        if (nextMatches.length === 0) return
        const targetIndex = activeMatchIndex >= 0 ? activeMatchIndex : 0
        const target = nextMatches[targetIndex]

        if (options.scope === 'project') {
            const chapter = chapters.find((item) => item.id === target.chapterId)
            if (!chapter) return

            if (target.chapterId === activeChapterId && editor) {
                const chapterMatches = buildChapterMatches(findQuery)
                const local = chapterMatches[target.occurrenceInChapter]
                if (local && typeof local.from === 'number' && typeof local.to === 'number') {
                    editor.chain().focus().insertContentAt({ from: local.from, to: local.to }, replaceText).run()
                }
            } else {
                const replaced = replaceNthOccurrenceInContent(
                    chapter.content,
                    findQuery,
                    replaceText,
                    target.occurrenceInChapter,
                )
                if (replaced.replaced) {
                    updateContent(chapter.id, replaced.content)
                }
            }

            const updatedMatches = refreshMatches(findQuery)
            if (updatedMatches.length > 0) {
                const nextIndex = Math.min(targetIndex, updatedMatches.length - 1)
                void selectMatch(updatedMatches, nextIndex)
            } else {
                setActiveMatchIndex(-1)
            }
            setPendingReplaceAllConfirm(false)
            return
        }

        if (!editor) return
        const chapterMatches = buildChapterMatches(findQuery)
        if (chapterMatches.length === 0) return
        const localTarget = chapterMatches[targetIndex]
        if (!localTarget || typeof localTarget.from !== 'number' || typeof localTarget.to !== 'number') return

        editor.chain().focus().insertContentAt({ from: localTarget.from, to: localTarget.to }, replaceText).run()
        const updatedMatches = refreshMatches(findQuery)
        if (updatedMatches.length > 0) {
            const nextIndex = Math.min(targetIndex, updatedMatches.length - 1)
            void selectMatch(updatedMatches, nextIndex)
        }
        setPendingReplaceAllConfirm(false)
    }, [
        activeChapterId,
        activeMatchIndex,
        buildChapterMatches,
        chapters,
        editor,
        findQuery,
        options.scope,
        refreshMatches,
        replaceText,
        selectMatch,
        t,
        updateContent,
    ])

    const runReplaceAll = useCallback(() => {
        if (!findQuery.trim()) return
        if (!replaceText.trim()) {
            setFindStatus(t('findReplace.replaceTextRequired'))
            return
        }
        const nextMatches = refreshMatches(findQuery)
        if (nextMatches.length === 0) return

        if (!pendingReplaceAllConfirm) {
            setPendingReplaceAllConfirm(true)
            setFindStatus(t('findReplace.replaceAllPreview', { count: nextMatches.length }))
            return
        }

        if (options.scope === 'project') {
            const sorted = [...chapters].sort((a, b) => a.order - b.order)
            let replacedCount = 0
            for (const chapter of sorted) {
                const sourceContent =
                    chapter.id === activeChapterId && editor
                        ? (editor.getJSON() as JSONContent)
                        : chapter.content
                const replaced = replaceAllOccurrencesInContent(sourceContent, findQuery, replaceText)
                if (replaced.count <= 0) continue
                replacedCount += replaced.count
                if (chapter.id === activeChapterId && editor) {
                    editor.commands.setContent(replaced.content, { emitUpdate: false })
                }
                updateContent(chapter.id, replaced.content)
            }
            setPendingReplaceAllConfirm(false)
            const refreshed = refreshMatches(findQuery)
            setFindStatus(t('findReplace.replaceAllDone', { count: replacedCount }))
            if (refreshed.length > 0) {
                void selectMatch(refreshed, 0)
            } else {
                setActiveMatchIndex(-1)
            }
            return
        }

        if (!editor) return
        for (let i = nextMatches.length - 1; i >= 0; i -= 1) {
            const range = nextMatches[i]
            if (typeof range.from !== 'number' || typeof range.to !== 'number') continue
            editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, replaceText).run()
        }
        setPendingReplaceAllConfirm(false)
        const refreshed = refreshMatches(findQuery)
        setFindStatus(t('findReplace.replaceAllDone', { count: nextMatches.length }))
        if (refreshed.length > 0) {
            void selectMatch(refreshed, 0)
        } else {
            setActiveMatchIndex(-1)
        }
    }, [
        activeChapterId,
        chapters,
        editor,
        findQuery,
        options.scope,
        pendingReplaceAllConfirm,
        refreshMatches,
        replaceText,
        selectMatch,
        t,
        updateContent,
    ])

    const updateFindQuery = useCallback(
        (value: string) => {
            setFindQuery(value)
            setPendingReplaceAllConfirm(false)
            setPendingProjectSelection(null)
            setFindStatus('')
        },
        [],
    )

    const updateReplaceText = useCallback((value: string) => {
        setReplaceText(value)
        setPendingReplaceAllConfirm(false)
    }, [])

    const updateOptions = useCallback(
        (patch: Partial<FindOptions>) => {
            const nextOptions = { ...options, ...patch }
            setOptions(nextOptions)
            setPendingReplaceAllConfirm(false)
            setPendingProjectSelection(null)
            refreshMatches(findQuery, nextOptions)
        },
        [findQuery, options, refreshMatches],
    )

    const statusCount = useMemo(() => {
        if (matches.length === 0) return { current: 0, total: 0 }
        return { current: Math.max(1, activeMatchIndex + 1), total: matches.length }
    }, [activeMatchIndex, matches.length])

    return {
        showFindReplace,
        setShowFindReplace,
        findQuery,
        setFindQuery: updateFindQuery,
        replaceText,
        setReplaceText: updateReplaceText,
        findStatus,
        findInputRef,
        runSearch,
        runFindNext,
        runFindPrev,
        runReplaceOne,
        runReplaceAll,
        options,
        updateOptions,
        hasSelectionScope: true,
        matches,
        activeMatchIndex,
        statusCount,
        pendingReplaceAllConfirm,
        refreshMatches,
    }
}
