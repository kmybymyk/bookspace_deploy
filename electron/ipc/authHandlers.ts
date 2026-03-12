import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { UiErrorKey } from '../uiErrorCopy'
import type {
    AuthGoogleSignInRequest,
    AuthGoogleSignInResponse,
    AuthSessionSnapshot,
    AuthSignOutResponse,
    AuthUserProfile,
} from '../../shared/authIpc'

interface AuthSessionState {
    user: AuthUserProfile | null
    updatedAt: string
}

export interface RegisterAuthIpcHandlersDeps {
    ipcMain: IpcMain
    assertTrustedSender: (event: IpcMainInvokeEvent) => void
    isDevelopment: boolean
    buildAuthSessionSnapshot: () => AuthSessionSnapshot
    normalizeEmail: (value: unknown) => string
    normalizeDisplayName: (value: unknown) => string
    createGoogleUserId: (email: string) => string
    setAuthSessionState: (next: AuthSessionState) => void
    persistAuthSessionState: () => Promise<void>
    devGoogleEmail?: string
    devGoogleName?: string
    getUiErrorCopy: (key: UiErrorKey) => string
}

export function registerAuthIpcHandlers(deps: RegisterAuthIpcHandlersDeps) {
    const {
        ipcMain,
        assertTrustedSender,
        isDevelopment,
        buildAuthSessionSnapshot,
        normalizeEmail,
        normalizeDisplayName,
        createGoogleUserId,
        setAuthSessionState,
        persistAuthSessionState,
        devGoogleEmail,
        devGoogleName,
        getUiErrorCopy,
    } = deps

    ipcMain.handle(
        'auth:session:get',
        async (event): Promise<AuthSessionSnapshot> => {
            assertTrustedSender(event)
            return buildAuthSessionSnapshot()
        },
    )

    ipcMain.handle(
        'auth:google:signIn',
        async (event, request?: AuthGoogleSignInRequest): Promise<AuthGoogleSignInResponse> => {
            assertTrustedSender(event)

            if (!isDevelopment) {
                return {
                    success: false,
                    mode: 'backend-required',
                    session: buildAuthSessionSnapshot(),
                    message: getUiErrorCopy('googleOAuthBackendRequired'),
                }
            }

            const email =
                normalizeEmail(request?.email) ||
                normalizeEmail(devGoogleEmail) ||
                'dev.google@bookspace.local'
            const displayName =
                normalizeDisplayName(request?.displayName) ||
                normalizeDisplayName(devGoogleName) ||
                'Google User'
            const avatarUrl = String(request?.avatarUrl ?? '').trim() || undefined

            setAuthSessionState({
                user: {
                    userId: createGoogleUserId(email),
                    provider: 'google',
                    email,
                    displayName,
                    avatarUrl,
                },
                updatedAt: new Date().toISOString(),
            })
            await persistAuthSessionState()

            return {
                success: true,
                mode: 'development-stub',
                session: buildAuthSessionSnapshot(),
                message: 'development stub session created',
            }
        },
    )

    ipcMain.handle(
        'auth:signOut',
        async (event): Promise<AuthSignOutResponse> => {
            assertTrustedSender(event)
            setAuthSessionState({
                user: null,
                updatedAt: new Date().toISOString(),
            })
            await persistAuthSessionState()
            return {
                success: true,
                session: buildAuthSessionSnapshot(),
                signedOutAt: new Date().toISOString(),
            }
        },
    )
}
