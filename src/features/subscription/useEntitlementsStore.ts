import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
    checkEntitlement,
    type EntitlementCheckOptions,
    type EntitlementDecision,
    type EntitlementsSnapshot,
    type FeatureId,
    type SubscriptionPlan,
} from '../../../shared/entitlements'

const DEFAULT_ENTITLEMENTS: EntitlementsSnapshot = {
    plan: 'FREE',
    aiCreditsRemaining: null,
}

interface EntitlementsStore {
    snapshot: EntitlementsSnapshot
    setSnapshot: (snapshot: EntitlementsSnapshot) => void
    updateSnapshot: (patch: Partial<EntitlementsSnapshot>) => void
    setPlan: (plan: SubscriptionPlan) => void
    checkFeature: (feature: FeatureId, options?: EntitlementCheckOptions) => EntitlementDecision
}

export const useEntitlementsStore = create<EntitlementsStore>()(
    persist(
        (set, get) => ({
            snapshot: DEFAULT_ENTITLEMENTS,
            setSnapshot: (snapshot) => set({ snapshot }),
            updateSnapshot: (patch) =>
                set((state) => ({
                    snapshot: {
                        ...state.snapshot,
                        ...patch,
                    },
                })),
            setPlan: (plan) =>
                set((state) => ({
                    snapshot: {
                        ...state.snapshot,
                        plan,
                    },
                })),
            checkFeature: (feature, options) => checkEntitlement(get().snapshot, feature, options),
        }),
        {
            name: 'bookspace_entitlements',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({ snapshot: state.snapshot }),
        },
    ),
)
