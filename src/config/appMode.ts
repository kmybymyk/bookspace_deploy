function parseEnabled(value: string | undefined): boolean {
    const normalized = String(value ?? '')
        .toLowerCase()
        .trim()
    return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes'
}

export function isEditorOnlyRelease(): boolean {
    return parseEnabled(import.meta.env.VITE_EDITOR_ONLY_RELEASE)
}

