export const SUPPORTED_IMAGE_MIME = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
] as const

export const PREFERRED_IMAGE_MIME = ['image/jpeg', 'image/jpg', 'image/png'] as const

export const MAX_IMAGE_DIMENSION_PX = 2000
export const MAX_IMAGE_FILE_BYTES = 3 * 1024 * 1024

const SUPPORTED_SET = new Set<string>(SUPPORTED_IMAGE_MIME)
const PREFERRED_SET = new Set<string>(PREFERRED_IMAGE_MIME)

export function normalizeImageMime(mime: string): string {
    const normalized = mime.trim().toLowerCase()
    return normalized === 'image/jpg' ? 'image/jpeg' : normalized
}

export function isSupportedImageMime(mime: string): boolean {
    return SUPPORTED_SET.has(normalizeImageMime(mime))
}

export function isPreferredImageMime(mime: string): boolean {
    return PREFERRED_SET.has(normalizeImageMime(mime))
}

export function resolveFileMime(file: File): string {
    const normalizedType = normalizeImageMime(file.type)
    if (normalizedType) return normalizedType
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
    if (ext === 'png') return 'image/png'
    if (ext === 'webp') return 'image/webp'
    if (ext === 'gif') return 'image/gif'
    return ''
}

export function loadImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () => {
            resolve({ width: image.naturalWidth, height: image.naturalHeight })
            URL.revokeObjectURL(objectUrl)
        }
        image.onerror = () => {
            resolve(null)
            URL.revokeObjectURL(objectUrl)
        }
        image.src = objectUrl
    })
}
