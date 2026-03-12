import fs from 'fs'
import path from 'path'

function parseEnabled(value: string | undefined): boolean {
    const normalized = String(value ?? '')
        .toLowerCase()
        .trim()
    return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes'
}

function readPackageEditorOnlyFlag(): boolean {
    try {
        const packageJsonPath = path.resolve(__dirname, '../../package.json')
        const raw = fs.readFileSync(packageJsonPath, 'utf-8')
        const parsed = JSON.parse(raw) as { bookspaceEditorOnlyRelease?: boolean | string }
        if (typeof parsed.bookspaceEditorOnlyRelease === 'boolean') {
            return parsed.bookspaceEditorOnlyRelease
        }
        if (typeof parsed.bookspaceEditorOnlyRelease === 'string') {
            return parseEnabled(parsed.bookspaceEditorOnlyRelease)
        }
    } catch {
        // Ignore missing or malformed package metadata and fall back to env only.
    }
    return false
}

export function isEditorOnlyRelease(): boolean {
    return parseEnabled(process.env.BOOKSPACE_EDITOR_ONLY_RELEASE) || readPackageEditorOnlyFlag()
}
