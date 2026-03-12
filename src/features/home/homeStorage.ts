import { PROJECT_FILE_EXTENSION } from '../../../shared/filePolicy'

const RECENT_KEY = 'bookspace_recent'
const LAST_MANUAL_SAVE_KEY = 'bookspace_last_manual_save'
export const MAX_RECENT_FILES = 10

type LastManualSaveInfo = {
  path: string
  savedAt: string
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function readRecentList(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    if (!Array.isArray(parsed)) throw new Error('invalid recent list')
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    localStorage.setItem(RECENT_KEY, '[]')
    return []
  }
}

export function promoteRecentFile(path: string): void {
  const recent = readRecentList()
  const newRecent = [path, ...recent.filter((item) => item !== path)].slice(0, MAX_RECENT_FILES)
  localStorage.setItem(RECENT_KEY, JSON.stringify(newRecent))
}

export function getRecentProjectFiles(): string[] {
  const recent = readRecentList()
  const seen = new Set<string>()

  return recent.filter((filePath) => {
    const normalized = normalizePath(filePath)
    if (!normalized.toLowerCase().endsWith(`.${PROJECT_FILE_EXTENSION}`)) return false
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

export function removeRecentFile(path: string): void {
  const normalizedTarget = normalizePath(path)
  const recent = readRecentList()
  const next = recent.filter((item) => normalizePath(item) !== normalizedTarget)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

export function setLastManualSaveProject(path: string, savedAt = new Date().toISOString()): void {
  const payload: LastManualSaveInfo = {
    path,
    savedAt,
  }
  localStorage.setItem(LAST_MANUAL_SAVE_KEY, JSON.stringify(payload))
}

export function getLastManualSaveProject(): LastManualSaveInfo | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_MANUAL_SAVE_KEY) ?? 'null') as LastManualSaveInfo | null
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.path !== 'string' || typeof parsed.savedAt !== 'string') return null
    const normalized = normalizePath(parsed.path)
    if (!normalized.toLowerCase().endsWith(`.${PROJECT_FILE_EXTENSION}`)) return null
    if (Number.isNaN(new Date(parsed.savedAt).getTime())) return null
    return {
      path: parsed.path,
      savedAt: parsed.savedAt,
    }
  } catch {
    localStorage.removeItem(LAST_MANUAL_SAVE_KEY)
    return null
  }
}

export function basenameCrossPlatform(filePath: string): string {
  return normalizePath(filePath).split('/').pop() ?? filePath
}

export function dirnameCrossPlatform(filePath: string): string {
  const normalized = normalizePath(filePath)
  const segments = normalized.split('/')
  if (segments.length <= 1) return normalized
  return segments.slice(0, -1).join('/') || '/'
}
