type UriKind = 'href' | 'image'

const DATA_URI_PREFIX = 'data:'
const FRAGMENT_PREFIX = '#'

const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
const SAFE_IMAGE_SCHEMES = new Set(['http', 'https', 'blob', 'file'])

function parseScheme(value: string): string | null {
    const match = value.match(/^([a-z][a-z0-9+.-]*):/i)
    return match?.[1]?.toLowerCase() ?? null
}

function isDangerousScheme(value: string): boolean {
    return value.startsWith('javascript:') || value.startsWith('vbscript:')
}

function sanitizeUri(raw: string, kind: UriKind): string | null {
    const value = raw.trim()
    if (!value) return null
    const lowered = value.toLowerCase()

    if (lowered.startsWith(FRAGMENT_PREFIX) && kind === 'href') return value
    if (lowered.startsWith(DATA_URI_PREFIX)) {
        return kind === 'image' && lowered.startsWith('data:image/') ? value : null
    }

    const scheme = parseScheme(lowered)
    if (scheme) {
        if (isDangerousScheme(lowered)) return null
        if (kind === 'href') {
            return SAFE_LINK_SCHEMES.has(scheme) ? value : null
        }

        return SAFE_IMAGE_SCHEMES.has(scheme) ? value : null
    }

    // Relative URL. Allowed for image sources, but not for safe links.
    return kind === 'image' ? value : null
}

export function sanitizeHref(raw: string): string | null {
    return sanitizeUri(raw, 'href')
}

export function sanitizeImageSrc(raw: string): string | null {
    return sanitizeUri(raw, 'image')
}
