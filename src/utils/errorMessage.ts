export function formatErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'string') {
        const message = error.trim()
        return message.length > 0 ? message : fallback
    }

    if (error instanceof Error) {
        const message = error.message?.trim()
        return message && message.length > 0 ? message : fallback
    }

    if (error && typeof error === 'object') {
        const maybeMessage = Reflect.get(error, 'message')
        if (typeof maybeMessage === 'string') {
            const message = maybeMessage.trim()
            return message.length > 0 ? message : fallback
        }
    }

    return fallback
}
