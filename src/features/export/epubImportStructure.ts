import JSZip from 'jszip'
import type { BookMetadata, ChapterType } from '../../types/project'

export interface EpubTocNode {
    title: string
    path: string
    children: EpubTocNode[]
}

export interface EpubPackageInfo {
    opfPath: string | null
    metadata: Partial<BookMetadata>
    manifestMediaTypes: Map<string, string>
    spinePaths: string[]
    tocTree: EpubTocNode[]
    tocSource: 'ncx' | 'nav' | 'spine-only'
}

export interface EpubImportPlanItem {
    title: string
    sourcePaths: string[]
    chapterType?: ChapterType
    chapterKind?: string
    parentKey?: string | null
    key: string
}

export interface EpubImportPlan {
    metadata: Partial<BookMetadata>
    items: EpubImportPlanItem[]
    diagnostics: {
        tocSource: 'ncx' | 'nav' | 'heuristic' | 'spine-only'
        warnings: string[]
    }
}

function normalizePath(path: string): string {
    const cleaned = path.replace(/\\/g, '/')
    const parts = cleaned.split('/')
    const stack: string[] = []
    for (const part of parts) {
        if (!part || part === '.') continue
        if (part === '..') {
            stack.pop()
            continue
        }
        stack.push(part)
    }
    return stack.join('/')
}

function dirname(path: string): string {
    const normalized = normalizePath(path)
    const idx = normalized.lastIndexOf('/')
    return idx === -1 ? '' : normalized.slice(0, idx)
}

function resolveHref(baseDir: string, href: string): string {
    if (!href) return ''
    if (href.startsWith('/')) return normalizePath(href.slice(1))
    return normalizePath(baseDir ? `${baseDir}/${href}` : href)
}

function stripFragmentAndQuery(href: string): string {
    return href.replace(/[?#].*$/, '')
}

function basename(path: string): string {
    const normalized = normalizePath(path)
    const idx = normalized.lastIndexOf('/')
    return idx === -1 ? normalized : normalized.slice(idx + 1)
}

function titleFromPath(path: string): string {
    const fileName = basename(path)
    return fileName.replace(/\.[^.]+$/, '')
}

function inferIdentifierType(identifier: string): BookMetadata['identifierType'] | undefined {
    const normalized = identifier.trim()
    if (!normalized) return undefined
    if (/^(urn:uuid:|uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)) {
        return 'uuid'
    }
    const digits = normalized.replace(/[^0-9Xx]/g, '')
    if (digits.length === 8) return 'issn'
    if (digits.length === 10 || digits.length === 13) return 'isbn'
    if (/^asin:/i.test(normalized)) return 'asin'
    if (/^doi:/i.test(normalized) || normalized.startsWith('10.')) return 'doi'
    return undefined
}

function isNavDocumentPath(path: string): boolean {
    const name = basename(path).toLowerCase()
    return name === 'nav.xhtml' || name === 'toc.xhtml'
}

function parseContributorNodes(opf: Document): Array<{ id: string; name: string; role: string }> {
    const contributorNodes = Array.from(opf.getElementsByTagNameNS('*', 'creator'))
    const roleMap = new Map<string, string>()
    for (const meta of Array.from(opf.getElementsByTagNameNS('*', 'meta'))) {
        const refined = meta.getAttribute('refines') ?? ''
        const property = meta.getAttribute('property') ?? ''
        if (!refined.startsWith('#') || property !== 'role') continue
        roleMap.set(refined.slice(1), meta.textContent?.trim() ?? '')
    }

    return contributorNodes
        .map((node, index) => {
            const id = node.getAttribute('id')?.trim() || `author-${index + 1}`
            const name = node.textContent?.trim() ?? ''
            const role = roleMap.get(id) ?? 'aut'
            return { id, name, role }
        })
        .filter((entry) => entry.name.length > 0)
}

function normalizeContributorRole(role: string): BookMetadata['authors'][number]['role'] {
    if (role === 'trl') return 'translator'
    if (role === 'edt') return 'editor'
    if (role === 'ill') return 'illustrator'
    return 'author'
}

async function findOpfPath(zip: JSZip): Promise<string | null> {
    const containerEntry = zip.file('META-INF/container.xml')
    if (!containerEntry) {
        const fallback = Object.values(zip.files).find((entry) => entry.name.endsWith('.opf'))
        return fallback?.name ?? null
    }

    const containerXml = await containerEntry.async('string')
    const doc = new DOMParser().parseFromString(containerXml, 'application/xml')
    const rootFile = doc.querySelector('rootfile[full-path]')
    if (rootFile) {
        return normalizePath(rootFile.getAttribute('full-path') ?? '')
    }

    const fallback = Object.values(zip.files).find((entry) => entry.name.endsWith('.opf'))
    return fallback?.name ?? null
}

function parseNavItem(anchor: Element, navDir: string): EpubTocNode | null {
    const href = stripFragmentAndQuery(anchor.getAttribute('href') ?? '')
    if (!href) return null
    const listItem = anchor.closest('li')
    const childList = Array.from(listItem?.children ?? []).find((child) => child.tagName.toLowerCase() === 'ol' || child.tagName.toLowerCase() === 'ul')
    const children = childList
        ? Array.from(childList.children)
            .map((li) => li.querySelector(':scope > a, :scope > span a'))
            .filter((childAnchor): childAnchor is HTMLAnchorElement => Boolean(childAnchor))
            .map((childAnchor) => parseNavItem(childAnchor, navDir))
            .filter((item): item is EpubTocNode => Boolean(item))
        : []

    return {
        title: anchor.textContent?.trim() || titleFromPath(href),
        path: resolveHref(navDir, href),
        children,
    }
}

async function parseNavTree(zip: JSZip, opf: Document, opfDir: string): Promise<EpubTocNode[]> {
    const navItem = Array.from(opf.getElementsByTagNameNS('*', 'item')).find((item) =>
        (item.getAttribute('properties') ?? '').split(/\s+/).includes('nav'),
    )
    if (!navItem) return []
    const navHref = navItem.getAttribute('href') ?? ''
    if (!navHref) return []
    const navPath = resolveHref(opfDir, navHref)
    const navEntry = zip.file(navPath)
    if (!navEntry) return []
    const navXml = await navEntry.async('string')
    const navDoc = new DOMParser().parseFromString(navXml, 'application/xhtml+xml')
    const navRoot = navDoc.querySelector('nav[epub\\:type="toc"], nav[*|type="toc"], nav[role="doc-toc"]')
        ?? navDoc.querySelector('nav')
    const topList = navRoot?.querySelector('ol, ul')
    if (!topList) return []
    return Array.from(topList.children)
        .map((li) => li.querySelector(':scope > a, :scope > span a'))
        .filter((anchor): anchor is HTMLAnchorElement => Boolean(anchor))
        .map((anchor) => parseNavItem(anchor, dirname(navPath)))
        .filter((item): item is EpubTocNode => Boolean(item))
}

async function parseNcxTree(zip: JSZip, opf: Document, opfDir: string): Promise<EpubTocNode[]> {
    const ncxItem = Array.from(opf.getElementsByTagNameNS('*', 'item')).find(
        (item) => (item.getAttribute('media-type') ?? '') === 'application/x-dtbncx+xml',
    )
    if (!ncxItem) return []
    const ncxHref = ncxItem.getAttribute('href') ?? ''
    if (!ncxHref) return []
    const ncxPath = resolveHref(opfDir, ncxHref)
    const ncxEntry = zip.file(ncxPath)
    if (!ncxEntry) return []
    const ncxXml = await ncxEntry.async('string')
    const ncxDoc = new DOMParser().parseFromString(ncxXml, 'application/xml')

    const walk = (node: Element): EpubTocNode | null => {
        const label = node.getElementsByTagNameNS('*', 'text')[0]?.textContent?.trim() ?? ''
        const src = node.getElementsByTagNameNS('*', 'content')[0]?.getAttribute('src') ?? ''
        const path = resolveHref(dirname(ncxPath), stripFragmentAndQuery(src))
        if (!label || !path) return null
        const childPoints = Array.from(node.children).filter((child) => child.tagName.toLowerCase().endsWith('navpoint'))
        return {
            title: label,
            path,
            children: childPoints.map(walk).filter((item): item is EpubTocNode => Boolean(item)),
        }
    }

    const navMap = ncxDoc.getElementsByTagNameNS('*', 'navMap')[0]
    if (!navMap) return []
    return Array.from(navMap.children)
        .filter((child) => child.tagName.toLowerCase().endsWith('navpoint'))
        .map((node) => walk(node))
        .filter((item): item is EpubTocNode => Boolean(item))
}

export async function parseEpubPackageInfo(zip: JSZip): Promise<EpubPackageInfo> {
    const opfPath = await findOpfPath(zip)
    if (!opfPath) {
        return {
            opfPath: null,
            metadata: {},
            manifestMediaTypes: new Map(),
            spinePaths: [],
            tocTree: [],
            tocSource: 'spine-only',
        }
    }

    const opfEntry = zip.file(opfPath)
    if (!opfEntry) {
        return {
            opfPath,
            metadata: {},
            manifestMediaTypes: new Map(),
            spinePaths: [],
            tocTree: [],
            tocSource: 'spine-only',
        }
    }

    const opfXml = await opfEntry.async('string')
    const opf = new DOMParser().parseFromString(opfXml, 'application/xml')
    const opfDir = dirname(opfPath)

    const manifestById = new Map<string, { href: string; mediaType: string; properties: string }>()
    const manifestMediaTypes = new Map<string, string>()
    for (const item of Array.from(opf.getElementsByTagNameNS('*', 'item'))) {
        const id = item.getAttribute('id') ?? ''
        const href = item.getAttribute('href') ?? ''
        const mediaType = item.getAttribute('media-type') ?? ''
        const properties = item.getAttribute('properties') ?? ''
        if (!href) continue
        const fullPath = resolveHref(opfDir, href)
        if (id) {
            manifestById.set(id, { href: fullPath, mediaType, properties })
        }
        if (mediaType) {
            manifestMediaTypes.set(fullPath, mediaType)
        }
    }

    const spinePaths: string[] = []
    for (const itemRef of Array.from(opf.getElementsByTagNameNS('*', 'itemref'))) {
        const idRef = itemRef.getAttribute('idref') ?? ''
        const item = manifestById.get(idRef)
        if (!item) continue
        const isHtmlLike =
            item.mediaType.includes('xhtml') ||
            item.mediaType.includes('html') ||
            /\.x?html$/i.test(item.href)
        const isNav = item.properties.split(/\s+/).includes('nav')
        if (!isHtmlLike || isNav || isNavDocumentPath(item.href)) continue
        spinePaths.push(item.href)
    }

    const title = opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() ?? ''
    const language = opf.getElementsByTagNameNS('*', 'language')[0]?.textContent?.trim() ?? ''
    const publisher = opf.getElementsByTagNameNS('*', 'publisher')[0]?.textContent?.trim() ?? ''
    const date = opf.getElementsByTagNameNS('*', 'date')[0]?.textContent?.trim() ?? ''
    const identifier = opf.getElementsByTagNameNS('*', 'identifier')[0]?.textContent?.trim() ?? ''
    const authors = parseContributorNodes(opf).map((entry) => ({
        id: entry.id,
        name: entry.name,
        role: normalizeContributorRole(entry.role),
    }))

    const identifierType = inferIdentifierType(identifier)
    const metadata: Partial<BookMetadata> = {
        title,
        authors,
        language,
        publisher,
        publishDate: date,
        identifier,
        identifierType,
        isbn: identifierType === 'isbn' ? identifier : '',
    }

    const ncxTree = await parseNcxTree(zip, opf, opfDir)
    if (ncxTree.length > 0) {
        return {
            opfPath,
            metadata,
            manifestMediaTypes,
            spinePaths,
            tocTree: ncxTree,
            tocSource: 'ncx',
        }
    }

    const navTree = await parseNavTree(zip, opf, opfDir)
    return {
        opfPath,
        metadata,
        manifestMediaTypes,
        spinePaths,
        tocTree: navTree,
        tocSource: navTree.length > 0 ? 'nav' : 'spine-only',
    }
}

function matchesPattern(value: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(value))
}

function isFrontMatter(title: string, path: string): boolean {
    return matchesPattern(`${title} ${basename(path)}`.toLowerCase(), [
        /\bprologue\b/,
        /\bforeword\b/,
        /\bpreface\b/,
        /프롤로그/,
        /머리말/,
        /들어가며/,
        /서문/,
    ])
}

function isBackMatter(title: string, path: string): boolean {
    return matchesPattern(`${title} ${basename(path)}`.toLowerCase(), [
        /\bepilogue\b/,
        /\bafterword\b/,
        /\bappendix\b/,
        /\bcolophon\b/,
        /에필로그/,
        /작가의 말/,
        /판권/,
        /부록/,
    ])
}

function inferMatterKind(title: string, path: string): string | undefined {
    const value = `${title} ${basename(path)}`.toLowerCase()
    if (/\bprologue\b|프롤로그|머리말|들어가며|서문/.test(value)) return 'prologue'
    if (/\bepilogue\b|에필로그/.test(value)) return 'epilogue'
    if (/\bappendix\b|부록/.test(value)) return 'appendix'
    if (/\bcolophon\b|판권/.test(value)) return 'colophon'
    return undefined
}

function isLikelyIntroPath(path: string, title: string): boolean {
    const lowerPath = basename(path).toLowerCase()
    const lowerTitle = title.toLowerCase()
    return lowerPath.endsWith('q.xhtml') || lowerTitle.includes('(intro)') || /intro/.test(lowerPath)
}

function uniquePaths(paths: string[]): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const path of paths) {
        if (!path || seen.has(path)) continue
        seen.add(path)
        result.push(path)
    }
    return result
}

function buildSingleChapterItems(
    orderedPaths: string[],
    titleByPath: Map<string, string>,
): EpubImportPlanItem[] {
    const items: EpubImportPlanItem[] = []
    for (const path of orderedPaths) {
        const title = titleByPath.get(path) ?? titleFromPath(path)
        const chapterType: ChapterType | undefined =
            isFrontMatter(title, path) ? 'front' : isBackMatter(title, path) ? 'back' : 'chapter'
        items.push({
            key: `path:${path}`,
            title,
            sourcePaths: [path],
            chapterType,
            chapterKind: inferMatterKind(title, path) ?? (chapterType === 'chapter' ? 'chapter' : undefined),
            parentKey: null,
        })
    }
    return items
}

export function buildEpubImportPlan({
    packageInfo,
    orderedPaths,
    titleByPath,
}: {
    packageInfo: Pick<EpubPackageInfo, 'metadata' | 'tocTree' | 'tocSource' | 'spinePaths'>
    orderedPaths: string[]
    titleByPath: Map<string, string>
}): EpubImportPlan {
    const warnings: string[] = []
    const spine = uniquePaths(orderedPaths)
    const spineIndex = new Map(spine.map((path, index) => [path, index]))

    if (packageInfo.tocTree.length === 0) {
        warnings.push('EPUB TOC not found; falling back to spine order.')
        return {
            metadata: packageInfo.metadata,
            items: buildSingleChapterItems(spine, titleByPath),
            diagnostics: {
                tocSource: 'spine-only',
                warnings,
            },
        }
    }

    const referencedPaths = new Set<string>()
    const items: EpubImportPlanItem[] = []
    if (!packageInfo.tocTree.some((node) => node.children.length > 0)) {
        for (const node of packageInfo.tocTree) {
            referencedPaths.add(node.path)
            items.push({
                key: `path:${node.path}`,
                title: node.title,
                sourcePaths: [node.path],
                chapterType: isFrontMatter(node.title, node.path) ? 'front' : isBackMatter(node.title, node.path) ? 'back' : 'chapter',
                chapterKind: inferMatterKind(node.title, node.path) ?? 'chapter',
                parentKey: null,
            })
        }
    } else {
        for (let partIndex = 0; partIndex < packageInfo.tocTree.length; partIndex += 1) {
            const node = packageInfo.tocTree[partIndex]
            if (node.children.length === 0) {
                referencedPaths.add(node.path)
                items.push({
                    key: `path:${node.path}`,
                    title: node.title,
                    sourcePaths: [node.path],
                    chapterType: isFrontMatter(node.title, node.path) ? 'front' : isBackMatter(node.title, node.path) ? 'back' : 'chapter',
                    chapterKind: inferMatterKind(node.title, node.path) ?? 'chapter',
                    parentKey: null,
                })
                continue
            }
            const nextTopPath = packageInfo.tocTree[partIndex + 1]?.path
            const partPathIndex = spineIndex.get(node.path)
            if (partPathIndex == null) {
                warnings.push(`TOC part path missing from spine: ${node.path}`)
                continue
            }
            const childIndices = node.children
                .map((child) => spineIndex.get(child.path))
                .filter((index): index is number => typeof index === 'number')
                .sort((a, b) => a - b)
            let firstChildStart = childIndices[0] ?? spineIndex.get(nextTopPath ?? '') ?? spine.length
            while (firstChildStart - 1 > partPathIndex) {
                const candidatePath = spine[firstChildStart - 1]
                const candidateTitle = titleByPath.get(candidatePath) ?? titleFromPath(candidatePath)
                if (!isLikelyIntroPath(candidatePath, candidateTitle)) break
                firstChildStart -= 1
            }
            const partKey = `part:${node.path}`
            const partPaths = uniquePaths(spine.slice(partPathIndex, Math.max(partPathIndex + 1, firstChildStart)))
            items.push({
                key: partKey,
                title: node.title,
                sourcePaths: partPaths.length > 0 ? partPaths : [node.path],
                chapterType: 'part',
                chapterKind: 'part',
                parentKey: null,
            })
            referencedPaths.add(node.path)
            for (const path of partPaths) referencedPaths.add(path)

            let previousBoundary = partPathIndex + partPaths.length
            for (let childIndex = 0; childIndex < node.children.length; childIndex += 1) {
                const child = node.children[childIndex]
                const currentAnchorIndex = spineIndex.get(child.path)
                if (currentAnchorIndex == null) {
                    warnings.push(`TOC chapter path missing from spine: ${child.path}`)
                    continue
                }
                const nextAnchorPath =
                    node.children[childIndex + 1]?.path ??
                    nextTopPath ??
                    spine[spine.length - 1]
                const nextAnchorIndexRaw = spineIndex.get(nextAnchorPath)
                const nextAnchorIndex =
                    typeof nextAnchorIndexRaw === 'number'
                        ? nextAnchorIndexRaw
                        : spine.length

                let segmentStart = currentAnchorIndex
                while (segmentStart - 1 >= previousBoundary) {
                    const candidatePath = spine[segmentStart - 1]
                    const candidateTitle = titleByPath.get(candidatePath) ?? titleFromPath(candidatePath)
                    if (!isLikelyIntroPath(candidatePath, candidateTitle)) break
                    segmentStart -= 1
                }

                let segmentEnd = Math.max(segmentStart + 1, nextAnchorIndex)
                const nextChildPath = node.children[childIndex + 1]?.path
                const nextChildIndex = nextChildPath ? spineIndex.get(nextChildPath) : undefined
                if (typeof nextChildIndex === 'number') {
                    let nextSegmentStart = nextChildIndex
                    while (nextSegmentStart - 1 > currentAnchorIndex) {
                        const candidatePath = spine[nextSegmentStart - 1]
                        const candidateTitle = titleByPath.get(candidatePath) ?? titleFromPath(candidatePath)
                        if (!isLikelyIntroPath(candidatePath, candidateTitle)) break
                        nextSegmentStart -= 1
                    }
                    segmentEnd = Math.max(segmentStart + 1, nextSegmentStart)
                }
                const sourcePaths = uniquePaths(spine.slice(segmentStart, segmentEnd))
                items.push({
                    key: `chapter:${child.path}`,
                    title: child.title,
                    sourcePaths,
                    chapterType: 'chapter',
                    chapterKind: 'chapter',
                    parentKey: partKey,
                })
                for (const path of sourcePaths) referencedPaths.add(path)
                referencedPaths.add(child.path)
                previousBoundary = segmentEnd
            }
        }
    }

    for (const path of spine) {
        if (referencedPaths.has(path) || isNavDocumentPath(path)) continue
        const title = titleByPath.get(path) ?? titleFromPath(path)
        items.push({
            key: `path:${path}`,
            title,
            sourcePaths: [path],
            chapterType: isFrontMatter(title, path) ? 'front' : isBackMatter(title, path) ? 'back' : 'chapter',
            chapterKind: inferMatterKind(title, path) ?? 'chapter',
            parentKey: null,
        })
    }

    return {
        metadata: packageInfo.metadata,
        items,
        diagnostics: {
            tocSource: packageInfo.tocSource === 'spine-only' ? 'heuristic' : packageInfo.tocSource,
            warnings,
        },
    }
}
