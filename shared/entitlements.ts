export type SubscriptionPlan = 'FREE' | 'PRO_LITE' | 'PRO'

export type CoreFeatureId =
  | 'core.project.create'
  | 'core.project.open'
  | 'core.project.save'
  | 'core.editor.write'
  | 'core.editor.rewrite_manual'
  | 'core.chapter.manage'
  | 'core.preview.reflow'
  | 'core.preview.spread'
  | 'core.import.epub'
  | 'core.import.docx'
  | 'core.export.epub'
  | 'core.export.docx'
  | 'core.history.versioning'
  | 'core.autosave'

export type AiFeatureId =
  | 'ai.chat.ask'
  | 'ai.rewrite.selection'
  | 'ai.feedback.chapter'
  | 'ai.chapter.create'
  | 'ai.table.insert'
  | 'ai.illustration.insert_uploaded'
  | 'ai.illustration.generate'
  | 'ai.fast_apply'

export type FeatureId = CoreFeatureId | AiFeatureId

export type EntitlementDecisionReason =
  | 'plan-allows-feature'
  | 'plan-does-not-allow-feature'
  | 'feature-disabled-by-flag'
  | 'insufficient-ai-credits'

export interface EntitlementsSnapshot {
  plan: SubscriptionPlan
  enabledFeatures?: Partial<Record<FeatureId, boolean>>
  disabledFeatures?: Partial<Record<FeatureId, boolean>>
  aiCreditsRemaining?: number | null
}

export interface EntitlementDecision {
  allowed: boolean
  reason: EntitlementDecisionReason
}

export interface EntitlementCheckOptions {
  consumeCredit?: boolean
  requiredCredits?: number
}

export const CORE_FEATURES: readonly CoreFeatureId[] = [
  'core.project.create',
  'core.project.open',
  'core.project.save',
  'core.editor.write',
  'core.editor.rewrite_manual',
  'core.chapter.manage',
  'core.preview.reflow',
  'core.preview.spread',
  'core.import.epub',
  'core.import.docx',
  'core.export.epub',
  'core.export.docx',
  'core.history.versioning',
  'core.autosave',
] as const

export const AI_FEATURES: readonly AiFeatureId[] = [
  'ai.chat.ask',
  'ai.rewrite.selection',
  'ai.feedback.chapter',
  'ai.chapter.create',
  'ai.table.insert',
  'ai.illustration.insert_uploaded',
  'ai.illustration.generate',
  'ai.fast_apply',
] as const

export const ALL_FEATURES: readonly FeatureId[] = [...CORE_FEATURES, ...AI_FEATURES] as const

const PLAN_DEFAULT_FEATURES: Readonly<Record<SubscriptionPlan, ReadonlySet<FeatureId>>> = {
  FREE: new Set(CORE_FEATURES),
  PRO_LITE: new Set([...CORE_FEATURES, ...AI_FEATURES]),
  PRO: new Set([...CORE_FEATURES, ...AI_FEATURES]),
}

function applyFeatureOverrides(
  base: ReadonlySet<FeatureId>,
  snapshot: EntitlementsSnapshot,
): Set<FeatureId> {
  const features = new Set<FeatureId>(base)
  const enabled = snapshot.enabledFeatures ?? {}
  const disabled = snapshot.disabledFeatures ?? {}

  for (const feature of ALL_FEATURES) {
    if (disabled[feature] === true) {
      features.delete(feature)
      continue
    }
    if (enabled[feature] === true) {
      features.add(feature)
    }
  }

  return features
}

export function resolveEntitledFeatures(snapshot: EntitlementsSnapshot): Set<FeatureId> {
  const base = PLAN_DEFAULT_FEATURES[snapshot.plan]
  return applyFeatureOverrides(base, snapshot)
}

export function hasFeature(snapshot: EntitlementsSnapshot, feature: FeatureId): boolean {
  return resolveEntitledFeatures(snapshot).has(feature)
}

export function requiresAiCredit(feature: FeatureId): boolean {
  return feature.startsWith('ai.')
}

export function checkEntitlement(
  snapshot: EntitlementsSnapshot,
  feature: FeatureId,
  options?: EntitlementCheckOptions,
): EntitlementDecision {
  if (!hasFeature(snapshot, feature)) {
    if ((snapshot.disabledFeatures ?? {})[feature] === true) {
      return { allowed: false, reason: 'feature-disabled-by-flag' }
    }
    return { allowed: false, reason: 'plan-does-not-allow-feature' }
  }

  if (requiresAiCredit(feature) && options?.consumeCredit) {
    const requiredCredits = Math.max(1, options.requiredCredits ?? 1)
    const remaining = snapshot.aiCreditsRemaining
    if (remaining !== null && remaining !== undefined && remaining < requiredCredits) {
      return { allowed: false, reason: 'insufficient-ai-credits' }
    }
  }

  return { allowed: true, reason: 'plan-allows-feature' }
}

export function isPaidFeature(feature: FeatureId): boolean {
  return feature.startsWith('ai.')
}
