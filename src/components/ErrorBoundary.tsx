import React from 'react'
import i18n from '../i18n'

interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
    constructor(props: React.PropsWithChildren) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[ErrorBoundary]', error, info)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className="flex flex-col items-center justify-center h-screen gap-4 bg-[var(--ds-surface-canvas)] px-6 text-center"
                    role="alert"
                >
                    <h1 className="text-2xl font-bold">{i18n.t('errorBoundary.title')}</h1>
                    <p className="text-sm max-w-md text-[var(--ds-text-neutral-secondary)]">
                        {this.state.error?.message}
                    </p>
                    <button
                        type="button"
                        onClick={() => this.setState({ hasError: false, error: undefined })}
                        className="rounded-lg bg-[var(--ds-button-primary-bg)] px-4 py-2 text-sm text-[var(--ds-text-neutral-inverse)] transition-colors hover:bg-[var(--ds-button-primary-bg-hover)]"
                    >
                        {i18n.t('errorBoundary.retry')}
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}
