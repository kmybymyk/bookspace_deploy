#!/usr/bin/env node
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'assertions.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'assertions.latest.md')

const failures = []
const warnings = []
const checks = []

function fail(message) {
  failures.push(message)
}

function warn(message) {
  warnings.push(message)
}

function check(ok, name, details) {
  checks.push({ name, ok, details })
  if (!ok) fail(`${name}: ${details}`)
}

function checkWarn(ok, name, details) {
  if (!ok) warn(`${name}: ${details}`)
}

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf-8')
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath))
}

function collectFiles(dir, matcher, out = []) {
  const fullDir = path.join(root, dir)
  if (!fs.existsSync(fullDir)) return out
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(rel, matcher, out)
      continue
    }
    if (matcher(rel)) out.push(rel)
  }
  return out
}

function countPatternInFiles(files, regex) {
  let count = 0
  for (const rel of files) {
    const text = read(rel)
    const hits = text.match(regex)
    if (hits) count += hits.length
  }
  return count
}

function checkNoAlertCalls() {
  const files = collectFiles('src', (p) => /\.(ts|tsx)$/.test(p))
  const alertCount = countPatternInFiles(files, /\balert\s*\(/g)
  check(alertCount === 0, 'ui/no-alert', `found ${alertCount} alert() calls in src/`)
}

function checkSecurityCriticalGuards() {
  const mainTs = read('electron/main.ts')
  const ipcHandlerTexts = [
    'electron/ipc/coreHandlers.ts',
    'electron/ipc/authHandlers.ts',
    'electron/ipc/subscriptionHandlers.ts',
    'electron/ipc/copilotHandlers.ts',
    'electron/ipc/historyHandlers.ts',
  ]
    .filter((rel) => exists(rel))
    .map((rel) => read(rel))
    .join('\n')
  check(
    mainTs.includes('assertTrustedSender(event)') || ipcHandlerTexts.includes('assertTrustedSender(event)'),
    'security/ipc-guard',
    'trusted IPC sender guard missing',
  )
  check(mainTs.includes('setWindowOpenHandler'), 'security/window-open-guard', 'external window guard missing')
  check(mainTs.includes("win.webContents.on('will-navigate'"), 'security/navigation-guard', 'navigation guard missing')
  check(mainTs.includes('sandbox: true'), 'security/browser-sandbox', 'BrowserWindow sandbox must be true')
}

function checkAutosaveAndDraftFlow() {
  const autosaveTs = read('src/hooks/useAutoSave.ts')
  check(
    autosaveTs.includes('if (!projectPath)') &&
      autosaveTs.includes('if (!targetPath) return') &&
      autosaveTs.includes("showToast(t('common.autoSaved'), 'success')"),
    'draft/autosave-project-path-guard',
    'autosave should guard projectPath/targetPath and emit autoSaved toast',
  )
  check(autosaveTs.includes('savingRef') && autosaveTs.includes('pendingRef'), 'draft/concurrency-guard', 'save concurrency guard missing')

  const appTs = read('src/App.tsx')
  check(
    appTs.includes('restoreDraftFromLocal') ||
      (appTs.includes('handleResumeLastSaved') && appTs.includes('getLastManualSaveProject')),
    'draft/restore-flow',
    'draft restore/resume flow missing',
  )
  check(appTs.includes('setDirtyState'), 'app/dirty-sync', 'dirty-state bridge sync missing')
}

function checkToastCopyAndLocaleConsistency() {
  const ko = JSON.parse(read('src/i18n/locales/ko.json'))
  const en = JSON.parse(read('src/i18n/locales/en.json'))
  const appFiles = collectFiles('src', (p) => /\.(ts|tsx)$/.test(p))
  const savedStateToastCount = countPatternInFiles(
    appFiles,
    /showToast\s*\(\s*t\(\s*['"]common\.saved['"]/g,
  )

  check(
    typeof ko.common?.savedToast === 'string' && ko.common.savedToast.trim().length > 0,
    'toast/ko-saved-toast-key',
    'ko common.savedToast key missing',
  )
  check(
    typeof en.common?.savedToast === 'string' && en.common.savedToast.trim().length > 0,
    'toast/en-saved-toast-key',
    'en common.savedToast key missing',
  )
  check(
    typeof ko.common?.unknownError === 'string' && ko.common.unknownError.trim().length > 0,
    'toast/ko-unknown-error-key',
    'ko common.unknownError key missing',
  )
  check(
    typeof en.common?.unknownError === 'string' && en.common.unknownError.trim().length > 0,
    'toast/en-unknown-error-key',
    'en common.unknownError key missing',
  )
  check(
    !Object.prototype.hasOwnProperty.call(ko.home?.messages ?? {}, 'recentFileRemoved'),
    'toast/ko-duplicate-recent-file-key-removed',
    'ko home.messages.recentFileRemoved should be removed',
  )
  check(
    !Object.prototype.hasOwnProperty.call(en.home?.messages ?? {}, 'recentFileRemoved'),
    'toast/en-duplicate-recent-file-key-removed',
    'en home.messages.recentFileRemoved should be removed',
  )
  check(
    savedStateToastCount === 0,
    'toast/no-common-saved-toast-call',
    `showToast(t('common.saved')) calls should be 0, found ${savedStateToastCount}`,
  )
}

function checkProjectPolicyConsistency() {
  const policy = read('shared/filePolicy.ts')
  const appTs = read('src/App.tsx')
  const appShellTs = read('src/components/layout/AppShell.tsx')
  const projectFileActionsTs = read('src/components/layout/hooks/useProjectFileActions.ts')
  const historyActionsTs = exists('src/components/layout/hooks/useHistoryActions.ts')
    ? read('src/components/layout/hooks/useHistoryActions.ts')
    : ''
  const mainTs = read('electron/main.ts')

  check(policy.includes("PROJECT_FILE_EXTENSION = 'bksp'"), 'policy/project-extension', 'project extension must be bksp')
  check(policy.includes("IMPORT_FILE_EXTENSIONS = ['epub', 'docx', 'md', 'markdown']"), 'policy/import-extension', 'import extension list mismatch')
  check(appTs.includes('isProjectExtension') && appTs.includes('isImportExtension'), 'policy/app-open-routing', 'open routing must use centralized policy helpers')
  check(
    appShellTs.includes('PROJECT_FILE_FILTER') ||
      projectFileActionsTs.includes('PROJECT_FILE_FILTER') ||
      historyActionsTs.includes('PROJECT_FILE_FILTER'),
    'policy/save-dialog-filter',
    'save dialog should use PROJECT_FILE_FILTER',
  )
  check(mainTs.includes('PROJECT_FILE_EXTENSION') && mainTs.includes('IMPORT_FILE_EXTENSIONS'), 'policy/electron-alignment', 'electron main should import shared file policy')
}

function checkQAScriptsRegistered() {
  const pkg = JSON.parse(read('package.json'))
  const scripts = pkg.scripts ?? {}
  const required = [
    'qa:assertions',
    'qa:server:schema',
    'qa:server:runtime',
    'qa:docx',
    'qa:markdown',
    'qa:perf',
    'qa:functional',
    'qa:copilot:eval',
    'qa:copilot:nlu',
    'qa:copilot:chapter-slots',
    'qa:copilot:workflow',
    'qa:copilot:action',
    'qa:copilot:renderer',
    'qa:copilot:stability',
    'qa:epub:integrity',
    'qa:epub:check',
    'qa:epub:policy',
    'qa:subscription:http',
    'qa:e2e',
    'qa:runtime',
    'qa:report',
    'qa:all',
  ]
  for (const key of required) {
    check(Boolean(scripts[key]), `qa/script/${key}`, 'missing npm script')
  }
  check(Boolean(scripts['dev:subscription-mock']), 'dev/script/subscription-mock', 'missing npm script dev:subscription-mock')
  check(
    Boolean(scripts['dev:subscription-runtime']),
    'dev/script/subscription-runtime',
    'missing npm script dev:subscription-runtime',
  )
}

function checkBuildArtifacts() {
  check(exists('dist/index.html'), 'build/artifact-renderer', 'missing dist/index.html (run npm run build)')
  check(
    exists('dist-electron/electron/main.js'),
    'build/artifact-electron',
    'missing dist-electron/electron/main.js (run npm run build)',
  )
}

function checkIconResources() {
  const pkg = JSON.parse(read('package.json'))
  const build = pkg.build ?? {}
  const macIcon = build?.mac?.icon
  const fileAssociationIcon = build?.fileAssociations?.[0]?.icon
  const extraResources = Array.isArray(build?.extraResources) ? build.extraResources : []
  const fileIconResource = extraResources.find((item) => item?.to === 'file.icns')

  check(typeof macIcon === 'string' && macIcon.length > 0, 'release/icon-config-mac', 'package.json build.mac.icon is missing')
  if (typeof macIcon === 'string' && macIcon.length > 0) {
    check(exists(macIcon), 'release/icon-mac', `missing ${macIcon}`)
  }

  check(
    typeof fileAssociationIcon === 'string' && fileAssociationIcon.length > 0,
    'release/icon-config-file-association',
    'package.json build.fileAssociations[0].icon is missing',
  )
  if (typeof fileAssociationIcon === 'string' && fileAssociationIcon.length > 0) {
    check(exists(fileAssociationIcon), 'release/icon-file-association', `missing ${fileAssociationIcon}`)
  }

  check(Boolean(fileIconResource?.from), 'release/icon-config-extra-resource', 'package.json extraResources should map file.icns')
  if (fileIconResource?.from) {
    check(exists(fileIconResource.from), 'release/icon-extra-resource', `missing ${fileIconResource.from}`)
  }
}

function checkUnsafeEvalDisabled() {
  const html = read('index.html')
  check(!html.includes("'unsafe-eval'"), 'security/csp-unsafe-eval', 'index.html CSP still contains unsafe-eval')
}

function checkServerSchemaAssets() {
  check(exists('server/sql/001_subscription_core.sql'), 'server-schema/sql-baseline', 'missing server/sql/001_subscription_core.sql')
  check(exists('server/sql/002_subscription_runtime_functions.sql'), 'server-schema/sql-runtime-functions', 'missing server/sql/002_subscription_runtime_functions.sql')
  check(exists('server/sql/003_billing_webhook_runtime.sql'), 'server-schema/sql-billing-webhook', 'missing server/sql/003_billing_webhook_runtime.sql')
  check(exists('server/sql/004_billing_binding_runtime.sql'), 'server-schema/sql-billing-binding', 'missing server/sql/004_billing_binding_runtime.sql')
  check(exists('server/.env.example'), 'server-runtime/env-template', 'missing server/.env.example')
  check(exists('server/runtime/subscriptionRuntimeAdapter.ts'), 'server-runtime/adapter-file', 'missing server/runtime/subscriptionRuntimeAdapter.ts')
  check(exists('server/runtime/billingWebhookAdapter.ts'), 'server-runtime/billing-adapter-file', 'missing server/runtime/billingWebhookAdapter.ts')
  check(exists('server/runtime/billingBindingAdapter.ts'), 'server-runtime/billing-binding-adapter-file', 'missing server/runtime/billingBindingAdapter.ts')
  check(exists('scripts/subscription-runtime-api.mjs'), 'server-runtime/http-entrypoint-file', 'missing scripts/subscription-runtime-api.mjs')
  const qaServerSchemaScript = read('scripts/qa-server-schema.mjs')
  check(
    qaServerSchemaScript.includes('server/sql/001_subscription_core.sql') &&
      qaServerSchemaScript.includes('server/sql/002_subscription_runtime_functions.sql') &&
      qaServerSchemaScript.includes('server/sql/003_billing_webhook_runtime.sql') &&
      qaServerSchemaScript.includes('server/sql/004_billing_binding_runtime.sql') &&
      qaServerSchemaScript.includes('bookspace_gate_check_and_consume') &&
      qaServerSchemaScript.includes('bookspace_credit_refund') &&
      qaServerSchemaScript.includes('bookspace_apply_billing_webhook') &&
      qaServerSchemaScript.includes('bookspace_register_billing_binding') &&
      qaServerSchemaScript.includes('QA server schema passed.'),
    'server-schema/qa-script-wiring',
    'qa-server-schema baseline checks missing',
  )
  const qaServerRuntimeScript = read('scripts/qa-server-runtime.mjs')
  check(
    qaServerRuntimeScript.includes('server/runtime/subscriptionRuntimeAdapter.ts') &&
      qaServerRuntimeScript.includes('server/runtime/billingWebhookAdapter.ts') &&
      qaServerRuntimeScript.includes('server/runtime/billingBindingAdapter.ts') &&
      qaServerRuntimeScript.includes('bookspace_gate_check_and_consume') &&
      qaServerRuntimeScript.includes('bookspace_credit_refund') &&
      qaServerRuntimeScript.includes('bookspace_apply_billing_webhook') &&
      qaServerRuntimeScript.includes('bookspace_register_billing_binding') &&
      qaServerRuntimeScript.includes('QA server runtime passed.'),
    'server-runtime/qa-script-wiring',
    'qa-server-runtime baseline checks missing',
  )
}

function checkAuthWiring() {
  const mainTs = read('electron/main.ts')
  const authHandlersTs = exists('electron/ipc/authHandlers.ts') ? read('electron/ipc/authHandlers.ts') : ''
  const preloadTs = read('electron/preload.ts')
  const viteEnvTs = read('src/vite-env.d.ts')
  const appTs = read('src/App.tsx')
  const appShellTs = read('src/components/layout/AppShell.tsx')
  const titleBarTs = read('src/components/layout/TitleBar.tsx')
  const authApiTs = read('src/features/auth/authApi.ts')
  const authHttpSessionTs = read('src/features/auth/authHttpSession.ts')
  const authStoreTs = read('src/features/auth/useAuthStore.ts')
  const authIpcTs = read('shared/authIpc.ts')

  check(authIpcTs.includes('AuthSessionSnapshot') && authIpcTs.includes('AuthGoogleSignInResponse'), 'auth/contract-shared', 'shared auth ipc contract missing')
  check(
    (mainTs.includes('auth:session:get') && mainTs.includes('auth:google:signIn') && mainTs.includes('auth:signOut')) ||
      (mainTs.includes('registerAuthIpcHandlers') &&
        authHandlersTs.includes('auth:session:get') &&
        authHandlersTs.includes('auth:google:signIn') &&
        authHandlersTs.includes('auth:signOut')),
    'auth/main-ipc-handlers',
    'auth ipc handlers missing in main process',
  )
  check(preloadTs.includes('getAuthSession') && preloadTs.includes('signInWithGoogle') && preloadTs.includes('signOutAuthSession'), 'auth/preload-bridge', 'auth preload bridge missing')
  check(viteEnvTs.includes('getAuthSession') && viteEnvTs.includes('signInWithGoogle') && viteEnvTs.includes('signOutAuthSession'), 'auth/window-type-bridge', 'auth window bridge type missing')
  check(authApiTs.includes('VITE_AUTH_API_MODE') && authApiTs.includes('signInWithGoogle') && authApiTs.includes('/v1/auth/google/sign-in'), 'auth/api-adapter', 'auth api adapter mode/http endpoint wiring missing')
  check(authHttpSessionTs.includes('buildAuthHttpHeaders') && authHttpSessionTs.includes('X-Bookspace-Session-Token'), 'auth/http-session-header', 'http auth session header utility missing')
  check(authApiTs.includes('buildAuthHttpHeaders') && authApiTs.includes('readAuthHttpSessionTokenFromResponse'), 'auth/http-session-token-flow', 'auth api should persist/reuse http session token')
  check(authStoreTs.includes('bookspace_auth_session') && authStoreTs.includes('setSession'), 'auth/store-session', 'auth session store missing')
  check(appTs.includes('authApi.getAuthSession') && appTs.includes('setAuthSession'), 'auth/app-sync', 'app should sync auth session on startup')
  check(
    (appShellTs.includes('handleGoogleSignIn') && appShellTs.includes('handleSignOut')) ||
      titleBarTs.includes('onGoogleSignIn') ||
      titleBarTs.includes('onSignOut') ||
      titleBarTs.includes('signInWithGoogle'),
    'auth/appshell-actions',
    'app shell/title bar auth actions missing',
  )
  check(titleBarTs.includes('signInWithGoogle') || titleBarTs.includes('signInGoogle'), 'auth/titlebar-action', 'title bar auth action UI missing')
}

function checkAiSchemaWiring() {
  const aiSchemaTs = read('shared/aiCommandSchema.ts')
  const copilotIpcTs = read('shared/copilotIpc.ts')
  const copilotApiTs = read('src/features/copilot/copilotApi.ts')
  const copilotIntentRouterTs = read('src/features/copilot/intentRouter.ts')
  const copilotRuleMapJson = read('shared/copilotIntentRuleMap.v1.json')
  const copilotIntentEvalScript = read('scripts/qa-copilot-intent-eval.mjs')
  const copilotIntentFixtures = read('scripts/fixtures/copilot-intent-fixtures.v1.json')
  const copilotNluEvalScript = read('scripts/qa-copilot-nlu-e2e.mjs')
  const copilotNluFixtures = read('scripts/fixtures/copilot-nlu-regression.v1.json')
  const copilotLiveFixtures = read('scripts/fixtures/copilot-live-regression.v1.json')
  const copilotHarvestScript = read('scripts/qa-copilot-log-harvest.mjs')
  const copilotLiveRegressionScript = read('scripts/qa-copilot-live-regression.mjs')
  const copilotChapterSlotEvalScript = read('scripts/qa-copilot-create-chapter-slots.mjs')
  const copilotChapterSlotFixtures = read('scripts/fixtures/copilot-create-chapter-slots.v1.json')
  const copilotWorkflowEvalScript = read('scripts/qa-copilot-workflow-eval.mjs')
  const copilotStorageFixtures = read('scripts/fixtures/copilot-storage-fixtures.v1.json')
  const copilotActionEvalScript = read('scripts/qa-copilot-action-eval.mjs')
  const copilotActionFixtures = read('scripts/fixtures/copilot-action-fixtures.v1.json')
  const copilotRendererEvalScript = read('scripts/qa-copilot-renderer-snapshots.mjs')
  const copilotRendererFixtures = read('scripts/fixtures/copilot-renderer-snapshots.v1.json')
  const epubIntegrityScript = read('scripts/qa-epub-integrity.mjs')
  const functionalQaScript = read('scripts/qa-functional-core.mjs')

  check(aiSchemaTs.includes('validateAiCommandEnvelope'), 'ai-schema/validator-export', 'shared ai command validator export missing')
  check(aiSchemaTs.includes('MAX_COMMANDS_PER_REQUEST'), 'ai-schema/constants', 'shared ai command schema constants missing')
  check(copilotIpcTs.includes('CopilotGenerateRequest') && copilotIpcTs.includes('CopilotGenerateResponse'), 'ai-schema/copilot-ipc-contract', 'copilot ipc request/response contract missing')
  check(
    copilotApiTs.includes('appServerGenerateCopilotCommands') &&
      copilotApiTs.includes('appServerChatCompletion') &&
      copilotApiTs.includes('generateCommands'),
    'ai-schema/copilot-api-adapter',
    'copilot api adapter app-server wiring missing',
  )
  check(
    copilotIntentRouterTs.includes('resolveCopilotIntent') && copilotIntentRouterTs.includes('resolveCopilotIntentPlan'),
    'ai-schema/intent-router',
    'copilot intent router missing',
  )
  check(copilotRuleMapJson.includes('"defaultRoute": "chat"') && copilotRuleMapJson.includes('"create_chapter"'), 'ai-schema/intent-rulemap', 'copilot intent rulemap missing required defaults/intents')
  check(copilotIntentEvalScript.includes('copilot-intent-fixtures.v1.json') && copilotIntentEvalScript.includes('[qa:copilot:eval]'), 'ai-schema/intent-eval-script', 'copilot intent eval script missing fixture/report wiring')
  check(copilotIntentFixtures.includes('"cases"') && copilotIntentFixtures.includes('"create-page-ko"'), 'ai-schema/intent-fixtures', 'copilot intent fixtures missing baseline cases')
  check(copilotNluEvalScript.includes('copilot-nlu-regression.v1.json') && copilotNluEvalScript.includes('[qa:copilot:nlu-e2e]'), 'ai-schema/nlu-eval-script', 'copilot nlu e2e script missing fixture/report wiring')
  check(copilotNluFixtures.includes('"cases"') && copilotNluFixtures.includes('"create-12"'), 'ai-schema/nlu-fixtures', 'copilot nlu regression fixtures missing expanded coverage')
  check(copilotHarvestScript.includes('copilot-live-regression.v1.json') && copilotHarvestScript.includes('[qa:copilot:harvest]'), 'ai-schema/log-harvest-script', 'copilot log harvest script missing fixture/report wiring')
  check(copilotLiveRegressionScript.includes('copilot-live-regression.v1.json') && copilotLiveRegressionScript.includes('[qa:copilot:live]'), 'ai-schema/live-regression-script', 'copilot live regression script missing fixture/report wiring')
  check(copilotLiveFixtures.includes('"cases"') && copilotLiveFixtures.includes('"source"'), 'ai-schema/live-regression-fixture', 'copilot live regression fixture missing structure')
  check(copilotChapterSlotEvalScript.includes('copilot-create-chapter-slots.v1.json') && copilotChapterSlotEvalScript.includes('[qa:copilot:chapter-slots]'), 'ai-schema/chapter-slot-eval-script', 'copilot chapter slot eval script missing fixture/report wiring')
  check(copilotChapterSlotFixtures.includes('"prologue-with-title-content"') && copilotChapterSlotFixtures.includes('"chapterType": "front"'), 'ai-schema/chapter-slot-fixtures', 'copilot chapter slot fixtures missing prologue case')
  check(copilotWorkflowEvalScript.includes('copilot-storage-fixtures.v1.json') && copilotWorkflowEvalScript.includes('copilot-workflow-eval.latest.json'), 'ai-schema/workflow-eval-script', 'copilot workflow eval script missing fixture/report wiring')
  check(copilotStorageFixtures.includes('"different-draft-session-must-differ"'), 'ai-schema/storage-fixtures', 'copilot storage fixtures missing session isolation case')
  check(copilotActionEvalScript.includes('copilot-action-fixtures.v1.json') && copilotActionEvalScript.includes('copilot-action-eval.latest.json'), 'ai-schema/action-eval-script', 'copilot action eval script missing fixture/report wiring')
  check(copilotActionFixtures.includes('"insert-illustration"'), 'ai-schema/action-fixtures', 'copilot action fixtures missing illustration case')
  check(copilotRendererEvalScript.includes('copilot-renderer-snapshots.v1.json') && copilotRendererEvalScript.includes('copilot-renderer-snapshots.latest.json'), 'ai-schema/renderer-eval-script', 'copilot renderer eval script missing fixture/report wiring')
  check(copilotRendererFixtures.includes('"inline-strikethrough"') && copilotRendererFixtures.includes('"checklist"'), 'ai-schema/renderer-fixtures', 'copilot renderer fixtures missing expanded markdown cases')
  check(epubIntegrityScript.includes('epub-integrity.latest.json') && epubIntegrityScript.includes('content.opf'), 'ai-schema/epub-integrity-script', 'epub integrity script missing manifest checks')
  check(functionalQaScript.includes('runAiCommandSchemaCheck'), 'ai-schema/qa-functional', 'qa:functional should validate ai command schema')
}

function checkCopilotRuntimeWiring() {
  const mainTs = read('electron/main.ts')
  const copilotHandlersTs = exists('electron/ipc/copilotHandlers.ts') ? read('electron/ipc/copilotHandlers.ts') : ''
  const preloadTs = read('electron/preload.ts')
  const viteEnvTs = read('src/vite-env.d.ts')
  const rightPaneTs = read('src/components/layout/RightPane.tsx')
  const copilotInspectorTs = read('src/features/copilot/CopilotInspector.tsx')
  const rightPaneActionsTs = read('src/features/copilot/rightPaneActions.ts')
  const promptFlowTs = read('src/features/copilot/useCopilotPromptFlow.ts')
  const copilotApplyTs = read('src/features/copilot/applyCopilotCommands.ts')
  const copilotApiTs = read('src/features/copilot/copilotApi.ts')
  const copilotPreviewModalTs = read('src/components/ui/CopilotPreviewModal.tsx')

  check(
    mainTs.includes('copilot:commands:generate') ||
      (mainTs.includes('registerCopilotIpcHandlers') &&
        copilotHandlersTs.includes('copilot:commands:generate')),
    'copilot/ipc-handler',
    'main process copilot ipc handler missing',
  )
  check(preloadTs.includes('generateCopilotCommands'), 'copilot/preload-bridge', 'preload copilot bridge missing')
  check(viteEnvTs.includes('generateCopilotCommands'), 'copilot/window-type-bridge', 'window.electronAPI copilot bridge type missing')
  check(preloadTs.includes('appServerGenerateCopilotCommands'), 'copilot/preload-appserver-bridge', 'preload app-server generate bridge missing')
  check(preloadTs.includes('appServerChatCompletion'), 'copilot/preload-appserver-chat-bridge', 'preload app-server chat bridge missing')
  check(viteEnvTs.includes('appServerGenerateCopilotCommands'), 'copilot/window-appserver-bridge', 'window.electronAPI app-server generate bridge type missing')
  check(viteEnvTs.includes('appServerChatCompletion'), 'copilot/window-appserver-chat-bridge', 'window.electronAPI app-server chat bridge type missing')
  check(
    (rightPaneTs.includes('copilotApi.generateCommands') ||
      rightPaneActionsTs.includes('copilotApi.generateCommands') ||
      copilotInspectorTs.includes('createRightPaneCopilotActions')) &&
      (rightPaneTs.includes('createRightPaneCopilotActions') ||
        copilotInspectorTs.includes('createRightPaneCopilotActions')) &&
      (rightPaneTs.includes('useCopilotPromptFlow') ||
        copilotInspectorTs.includes('useCopilotPromptFlow')),
    'copilot/rightpane-request',
    'RightPane should call copilot generate API',
  )
  check(
    (rightPaneTs.includes('previewEnvelope') || copilotInspectorTs.includes('previewEnvelope')) &&
      (rightPaneTs.includes('applyPreview') || rightPaneActionsTs.includes('applyPreview')) &&
      rightPaneActionsTs.includes('applyCopilotEnvelope'),
    'copilot/preview-apply-flow',
    'RightPane preview/apply flow wiring missing',
  )
  check(
    copilotApplyTs.includes('commandDispatchers') &&
      copilotApplyTs.includes('rewrite_selection:') &&
      copilotApplyTs.includes('applyRewriteSelectionCommand'),
    'copilot/apply-rewrite-selection',
    'rewrite_selection apply implementation missing',
  )
  check(
    copilotApplyTs.includes('commandDispatchers') &&
      copilotApplyTs.includes('create_chapter:') &&
      copilotApplyTs.includes('applyCreateChapterCommand'),
    'copilot/apply-create-chapter',
    'create_chapter apply implementation missing',
  )
  check(
    copilotApplyTs.includes('commandDispatchers') &&
      copilotApplyTs.includes('insert_table:') &&
      copilotApplyTs.includes('applyInsertTableCommand'),
    'copilot/apply-insert-table',
    'insert_table apply implementation missing',
  )
  check(
    copilotApplyTs.includes('commandDispatchers') &&
      copilotApplyTs.includes('insert_illustration:') &&
      copilotApplyTs.includes('applyInsertIllustrationCommand'),
    'copilot/apply-insert-illustration',
    'insert_illustration apply implementation missing',
  )
  check(copilotApplyTs.includes('validateAiCommandEnvelope'), 'copilot/apply-schema-validation', 'apply flow should validate envelope before mutation')
  check(copilotApplyTs.includes('rollbackSnapshot') && copilotApplyTs.includes('rollbackChapters'), 'copilot/apply-rollback', 'apply flow rollback guard missing')
  check(copilotPreviewModalTs.includes('AI Command Preview') || copilotPreviewModalTs.includes("t('centerPane.aiPreviewTitle')"), 'copilot/preview-modal', 'copilot preview modal missing')
  check(copilotApiTs.includes('appServerGenerateCopilotCommands') && copilotApiTs.includes('appServerChatCompletion'), 'copilot/appserver-runtime', 'copilot runtime should call app-server IPC')
  check(!copilotApiTs.includes('/v1/ai/requests') && !copilotApiTs.includes('/v1/ai/chat'), 'copilot/no-legacy-http-runtime', 'copilot runtime should not call legacy HTTP AI endpoints')
  check(!copilotApiTs.includes('directGenerateCopilotCommands') && !copilotApiTs.includes('directChatCompletion'), 'copilot/no-direct-runtime', 'copilot runtime should not call direct IPC endpoints')
  check(
    promptFlowTs.includes('runGeneratePreview') && promptFlowTs.includes('runGeneralChatReply'),
    'copilot/prompt-flow-hook',
    'copilot prompt flow hook wiring missing',
  )
}

function checkSubscriptionGateWiring() {
  const mainTs = read('electron/main.ts')
  const subscriptionHandlersTs = exists('electron/ipc/subscriptionHandlers.ts')
    ? read('electron/ipc/subscriptionHandlers.ts')
    : ''
  const preloadTs = read('electron/preload.ts')
  const viteEnvTs = read('src/vite-env.d.ts')
  const appTs = read('src/App.tsx')
  const rightPaneTs = read('src/components/layout/RightPane.tsx')
  const copilotInspectorTs = read('src/features/copilot/CopilotInspector.tsx')
  const rightPaneActionsTs = read('src/features/copilot/rightPaneActions.ts')
  const adapterTs = read('src/features/subscription/subscriptionApi.ts')
  const aiExecutionGateTs = read('src/features/subscription/aiExecutionGate.ts')
  const gateRuntimeTs = read('shared/subscriptionGateRuntime.ts')

  check(
    mainTs.includes("subscription:entitlements:get") ||
      (mainTs.includes('registerSubscriptionIpcHandlers') &&
        subscriptionHandlersTs.includes('subscription:entitlements:get')),
    'subscription/ipc-entitlements',
    'missing entitlements ipc handler',
  )
  check(
    mainTs.includes("subscription:gate:check") ||
      (mainTs.includes('registerSubscriptionIpcHandlers') &&
        subscriptionHandlersTs.includes('subscription:gate:check')),
    'subscription/ipc-gate-check',
    'missing gate check ipc handler',
  )
  check(
    mainTs.includes("subscription:credits:refund") ||
      (mainTs.includes('registerSubscriptionIpcHandlers') &&
        subscriptionHandlersTs.includes('subscription:credits:refund')),
    'subscription/ipc-credits-refund',
    'missing credits refund ipc handler',
  )
  check(mainTs.includes("new SubscriptionGateRuntime"), 'subscription/runtime-used', 'main should use shared gate runtime')
  check(
    preloadTs.includes('getEntitlementsSnapshot') &&
      preloadTs.includes('checkSubscriptionGate') &&
      preloadTs.includes('refundSubscriptionCredits'),
    'subscription/preload-bridge',
    'preload subscription bridge missing',
  )
  check(viteEnvTs.includes('refundSubscriptionCredits'), 'subscription/window-type-bridge', 'window.electronAPI refund bridge type missing')
  check(
    adapterTs.includes('VITE_SUBSCRIPTION_API_MODE') &&
      adapterTs.includes('VITE_SUBSCRIPTION_HTTP_FALLBACK_TO_IPC') &&
      adapterTs.includes("'/v1/subscription/gate/check'") &&
      adapterTs.includes("'/v1/subscription/credits/refund'") &&
      adapterTs.includes('buildAuthHttpHeaders') &&
      adapterTs.includes('refundSubscriptionCredits'),
    'subscription/adapter-mode',
    'subscription adapter mode/fallback/http endpoint missing',
  )
  check(
    aiExecutionGateTs.includes('reserveAiExecutionCredits') &&
      aiExecutionGateTs.includes('refundAiExecutionCredits') &&
      aiExecutionGateTs.includes('consumeCredit: true') &&
      aiExecutionGateTs.includes('idempotencyKey') &&
      aiExecutionGateTs.includes('MAX_OPERATION_IDEMPOTENCY_KEYS'),
    'subscription/ai-execution-credit-reserve',
    'AI execution credit reservation utility missing',
  )
  check(appTs.includes('subscriptionApi.getEntitlementsSnapshot'), 'subscription/app-sync', 'App should sync entitlements via adapter')
  check(
    (rightPaneTs.includes('previewAiFeatureAccess') &&
      rightPaneTs.includes('reserveAiExecutionCredits') &&
      rightPaneTs.includes('refundAiExecutionCredits')) ||
      ((rightPaneTs.includes('createRightPaneCopilotActions') ||
        copilotInspectorTs.includes('createRightPaneCopilotActions')) &&
        rightPaneActionsTs.includes('previewAiFeatureAccess') &&
        rightPaneActionsTs.includes('reserveAiExecutionCredits') &&
        rightPaneActionsTs.includes('refundAiExecutionCredits')),
    'subscription/runtime-gate-call',
    'RightPane should invoke AI execution/refund gate utility',
  )
  check(gateRuntimeTs.includes('DEFAULT_IDEMPOTENCY_TTL_MS'), 'subscription/runtime-ttl', 'idempotency TTL constant missing in runtime')
  check(
    gateRuntimeTs.includes('refundByIdempotencyKey') && gateRuntimeTs.includes('already-refunded'),
    'subscription/runtime-refund',
    'runtime refund/idempotency handling missing',
  )
}

function checkBillingWebhookWiring() {
  const billingAdapterTs = read('server/runtime/billingWebhookAdapter.ts')
  const mockApiScript = read('scripts/mock-subscription-api.mjs')
  const qaSubscriptionHttpScript = read('scripts/qa-subscription-http.mjs')
  const runtimeApiScript = read('scripts/subscription-runtime-api.mjs')

  check(
    billingAdapterTs.includes('verifyPortoneWebhookSignature') &&
      billingAdapterTs.includes('parsePortoneBillingWebhook') &&
      billingAdapterTs.includes('applyPortoneBillingWebhookEvent') &&
      billingAdapterTs.includes('bookspace_apply_billing_webhook'),
    'billing/runtime-adapter',
    'billing webhook runtime adapter verification/parse/apply wiring missing',
  )

  check(
    mockApiScript.includes('/v1/billing/webhooks/portone') &&
      mockApiScript.includes('/v1/billing/webhooks/stripe') &&
      mockApiScript.includes('/v1/billing/bindings/register') &&
      mockApiScript.includes('/v1/auth/google/sign-in') &&
      mockApiScript.includes('/v1/auth/session') &&
      mockApiScript.includes('X-Bookspace-Session-Token') &&
      mockApiScript.includes('webhook-signature') &&
      mockApiScript.includes('verifyPortoneWebhookSignature') &&
      mockApiScript.includes('x-bookspace-mock-token') &&
      mockApiScript.includes('isLoopbackAddress') &&
      mockApiScript.includes('binding not found for provider identifiers'),
    'billing/mock-endpoint-security',
    'mock api should enforce webhook signature + loopback/token auth + binding checks',
  )

  check(
    qaSubscriptionHttpScript.includes('/v1/billing/bindings/register') &&
      qaSubscriptionHttpScript.includes('billing-binding-register') &&
      qaSubscriptionHttpScript.includes('billing-binding-register-conflict') &&
      qaSubscriptionHttpScript.includes('/v1/billing/webhooks/portone') &&
      qaSubscriptionHttpScript.includes('buildPortoneWebhookHeaders') &&
      qaSubscriptionHttpScript.includes('webhook-portone-duplicate') &&
      qaSubscriptionHttpScript.includes('webhook-portone-unknown-binding') &&
      qaSubscriptionHttpScript.includes('webhook-portone-invalid-signature') &&
      qaSubscriptionHttpScript.includes('webhook-portone-expired-signature') &&
      qaSubscriptionHttpScript.includes('auth-missing-token'),
    'billing/http-qa-coverage',
    'qa:subscription:http should validate webhook success/duplicate/unknown-binding/auth/signature failure paths',
  )

  check(
    runtimeApiScript.includes('/v1/billing/webhooks/portone') &&
      runtimeApiScript.includes('/v1/billing/payments/{paymentId}/sync') &&
      runtimeApiScript.includes('fetchPortonePayment') &&
      runtimeApiScript.includes('bookspace_apply_billing_webhook') &&
      runtimeApiScript.includes('x-bookspace-api-token'),
    'billing/runtime-http-revalidation',
    'runtime api should include portone webhook + payment sync revalidation flow',
  )
}

async function writeReport() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true })
  const report = {
    createdAt: new Date().toISOString(),
    checks,
    warnings,
    failures,
  }
  await fsp.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')

  const md = [
    '# QA Assertions',
    '',
    `- createdAt: ${report.createdAt}`,
    `- checks: ${checks.length}`,
    `- failures: ${failures.length}`,
    `- warnings: ${warnings.length}`,
    '',
    '## Checks',
    ...checks.map((item) => `- ${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.details}`),
    '',
    warnings.length ? '## Warnings' : '## Warnings (none)',
    ...warnings.map((item) => `- ${item}`),
    '',
    failures.length ? '## Result: FAIL' : '## Result: PASS',
    ...failures.map((item) => `- ${item}`),
    '',
  ]
  await fsp.writeFile(OUTPUT_MD, md.join('\n'), 'utf-8')
}

async function main() {
  checkNoAlertCalls()
  checkSecurityCriticalGuards()
  checkAutosaveAndDraftFlow()
  checkToastCopyAndLocaleConsistency()
  checkProjectPolicyConsistency()
  checkQAScriptsRegistered()
  checkBuildArtifacts()
  checkIconResources()
  checkUnsafeEvalDisabled()
  checkServerSchemaAssets()
  checkAuthWiring()
  checkAiSchemaWiring()
  checkCopilotRuntimeWiring()
  checkSubscriptionGateWiring()
  checkBillingWebhookWiring()

  await writeReport()

  if (warnings.length > 0) {
    console.log('QA warnings:')
    for (const message of warnings) console.log(`- ${message}`)
  }

  if (failures.length > 0) {
    console.error('QA assertions failed:')
    for (const message of failures) console.error(`- ${message}`)
    process.exit(1)
  }

  console.log('QA assertions passed.')
  console.log(` - ${path.relative(root, OUTPUT_JSON)}`)
  console.log(` - ${path.relative(root, OUTPUT_MD)}`)
}

main().catch((error) => {
  console.error('QA assertions failed with exception:')
  console.error(error)
  process.exit(1)
})
