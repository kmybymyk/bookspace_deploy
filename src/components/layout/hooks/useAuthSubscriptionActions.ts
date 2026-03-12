import { useCallback, useState } from 'react'
import type { TFunction } from 'i18next'
import type { EntitlementsSnapshot } from '../../../../shared/entitlements'
import type { AuthSessionSnapshot } from '../../../../shared/authIpc'
import { subscriptionApi } from '../../../features/subscription/subscriptionApi'
import { authApi } from '../../../features/auth/authApi'
import { showToast } from '../../../utils/toast'
import { formatErrorMessage } from '../../../utils/errorMessage'

interface UseAuthSubscriptionActionsArgs {
    t: TFunction
    setEntitlementSnapshot: (snapshot: EntitlementsSnapshot) => void
    setAuthSession: (session: AuthSessionSnapshot) => void
}

export function useAuthSubscriptionActions({
    t,
    setEntitlementSnapshot,
    setAuthSession,
}: UseAuthSubscriptionActionsArgs) {
    const [authBusy, setAuthBusy] = useState(false)

    const handleUpgradeClick = useCallback(async () => {
        if (!import.meta.env.DEV) {
            showToast(t('titleBar.upgradeComingSoon'), 'info')
            return
        }
        try {
            const result = await subscriptionApi.setSubscriptionPlan('PRO_LITE')
            setEntitlementSnapshot(result.snapshot)
            showToast(t('titleBar.upgradeDevApplied'), 'success')
        } catch (error) {
            showToast(
                t('titleBar.upgradeDevFailed', { error: formatErrorMessage(error, t('common.unknownError')) }),
                'error',
            )
        }
    }, [setEntitlementSnapshot, t])

    const handleGoogleSignIn = useCallback(async () => {
        if (authBusy) return
        setAuthBusy(true)
        try {
            const result = await authApi.signInWithGoogle()
            setAuthSession(result.session)

            if (!result.success) {
                showToast(t('appShell.toasts.signInUnavailable'), 'info')
                return
            }

            const entitlements = await subscriptionApi.getEntitlementsSnapshot()
            setEntitlementSnapshot(entitlements.snapshot)
            showToast(
                t('appShell.toasts.signInCompleted', {
                    email: result.session.user?.email ?? t('titleBar.signedIn'),
                }),
                'success',
            )
        } catch (error) {
            showToast(
                t('appShell.toasts.signInFailed', { error: formatErrorMessage(error, t('common.unknownError')) }),
                'error',
            )
        } finally {
            setAuthBusy(false)
        }
    }, [authBusy, setAuthSession, setEntitlementSnapshot, t])

    const handleSignOut = useCallback(async () => {
        if (authBusy) return
        setAuthBusy(true)
        try {
            const result = await authApi.signOutAuthSession()
            setAuthSession(result.session)
            const entitlements = await subscriptionApi.getEntitlementsSnapshot()
            setEntitlementSnapshot(entitlements.snapshot)
            showToast(t('appShell.toasts.signOutCompleted'), 'success')
        } catch (error) {
            showToast(
                t('appShell.toasts.signOutFailed', { error: formatErrorMessage(error, t('common.unknownError')) }),
                'error',
            )
        } finally {
            setAuthBusy(false)
        }
    }, [authBusy, setAuthSession, setEntitlementSnapshot, t])

    return {
        authBusy,
        handleUpgradeClick,
        handleGoogleSignIn,
        handleSignOut,
    }
}
