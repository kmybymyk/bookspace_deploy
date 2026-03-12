#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const failures = []
const warnings = []

function check(ok, message) {
    if (!ok) failures.push(message)
}

function warn(ok, message) {
    if (!ok) warnings.push(message)
}

function readText(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf-8')
}

function exists(relPath) {
    return fs.existsSync(path.join(root, relPath))
}

function extractRegexMatches(text, regex) {
    const out = []
    let match
    while ((match = regex.exec(text)) !== null) {
        out.push(match[1])
    }
    return out
}

function verifyCsp() {
    const html = readText('index.html')
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? ''
    check(Boolean(csp), 'index.html: Content-Security-Policy meta tag is missing.')
    if (!csp) return
    check(!csp.includes("'unsafe-eval'"), 'index.html: CSP must not include unsafe-eval.')
    check(csp.includes("script-src 'self'"), "index.html: CSP script-src must be restricted to 'self'.")
    check(csp.includes("object-src 'none'"), "index.html: CSP should set object-src 'none'.")
    check(csp.includes("frame-ancestors 'none'"), "index.html: CSP should set frame-ancestors 'none'.")
}

function verifyElectronHardening() {
    const mainTs = readText('electron/main.ts')
    check(mainTs.includes('assertTrustedSender('), 'electron/main.ts: trusted IPC sender guard is missing.')
    check(mainTs.includes('setWindowOpenHandler'), 'electron/main.ts: external window guard is missing.')
    check(mainTs.includes("win.webContents.on('will-navigate'"), 'electron/main.ts: navigation guard is missing.')
    check(mainTs.includes('sandbox: true'), 'electron/main.ts: BrowserWindow sandbox must be enabled.')
    check(mainTs.includes("headers['Content-Security-Policy'] = [buildProdCsp()]"), 'electron/main.ts: production CSP header injection is missing.')
    check(!mainTs.includes('BOOKSPACE_AUTH_ALLOW_DEV_STUB'), 'electron/main.ts: production-auth bypass env flag must be removed.')
}

function verifyBuildConfig() {
    const pkg = JSON.parse(readText('package.json'))
    const build = pkg.build ?? {}
    check(Boolean(build.appId), 'package.json: build.appId is required.')
    check(Boolean(build.productName), 'package.json: build.productName is required.')
    check(Array.isArray(build.files) && build.files.length > 0, 'package.json: build.files must be configured.')
    check(build.mac?.hardenedRuntime === true, 'package.json: mac.hardenedRuntime must be true for production notarization.')
    warn(Boolean(build.fileAssociations?.length), 'package.json: fileAssociations is empty.')
}

function verifyIconAssets() {
    const pkg = JSON.parse(readText('package.json'))
    const build = pkg.build ?? {}
    const macIcon = build?.mac?.icon
    const fileAssociationIcon = build?.fileAssociations?.[0]?.icon
    const extraResources = Array.isArray(build?.extraResources) ? build.extraResources : []
    const fileIconResource = extraResources.find((item) => item?.to === 'file.icns')

    check(typeof macIcon === 'string' && macIcon.length > 0, 'package.json: build.mac.icon is required.')
    if (typeof macIcon === 'string' && macIcon.length > 0) {
        check(exists(macIcon), `Missing mac icon asset: ${macIcon}`)
    }

    check(
        typeof fileAssociationIcon === 'string' && fileAssociationIcon.length > 0,
        'package.json: build.fileAssociations[0].icon is required.',
    )
    if (typeof fileAssociationIcon === 'string' && fileAssociationIcon.length > 0) {
        check(exists(fileAssociationIcon), `Missing file association icon asset: ${fileAssociationIcon}`)
    }

    check(Boolean(fileIconResource?.from), 'package.json: extraResources must include file.icns mapping.')
    if (fileIconResource?.from) {
        check(exists(fileIconResource.from), `Missing extra resource icon asset: ${fileIconResource.from}`)
    }
}

function verifyArtifacts() {
    check(exists('dist/index.html'), 'Build artifact missing: dist/index.html (run npm run build).')
    check(
        exists('dist-electron/electron/main.js'),
        'Build artifact missing: dist-electron/electron/main.js (run npm run build).',
    )
}

function verifyEmbeddedFontsManifest() {
    const catalog = readText('src/features/design-panel/fontCatalog.ts')
    const readme = readText('public/fonts/README.md')
    const assetPaths = extractRegexMatches(catalog, /publicPath:\s*'([^']+)'/g)
    check(assetPaths.length > 0, 'fontCatalog: no embedAssets publicPath entries found.')

    const uniqueAssets = [...new Set(assetPaths)]
    for (const rel of uniqueAssets) {
        const fullRel = path.join('public', rel)
        check(exists(fullRel), `Embedded font missing: ${fullRel}`)
        check(readme.includes(`public/${rel}`), `public/fonts/README.md missing font manifest line: public/${rel}`)
    }
}

function verifyRuntimeSafeguards() {
    const appTs = readText('src/App.tsx')
    const autoSave = readText('src/hooks/useAutoSave.ts')
    const authApiTs = readText('src/features/auth/authApi.ts')
    const subscriptionApiTs = readText('src/features/subscription/subscriptionApi.ts')
    const copilotApiTs = readText('src/features/copilot/copilotApi.ts')
  check(appTs.includes('setDirtyState'), 'src/App.tsx: dirty-state sync to main process is missing.')
  check(
    autoSave.includes('window.electronAPI.saveFile') && autoSave.includes("createSnapshotSafe(targetPath, data, 'autosave'"),
    'src/hooks/useAutoSave.ts: file autosave + autosave history snapshot path is missing.',
  )
  check(
    appTs.includes('restoreDraftFromLocal') ||
      (appTs.includes('handleResumeLastSaved') && appTs.includes('getLastManualSaveProject')),
    'src/App.tsx: draft restore/resume flow is missing.',
  )
    check(authApiTs.includes('import.meta.env.DEV && httpFallbackToIpcEnabled'), 'authApi: production HTTP->IPC fallback must be fail-closed.')
    check(subscriptionApiTs.includes('import.meta.env.DEV && httpFallbackToIpcEnabled'), 'subscriptionApi: production HTTP->IPC fallback must be fail-closed.')
    check(
        copilotApiTs.includes('appServerGenerateCopilotCommands') &&
            copilotApiTs.includes('appServerChatCompletion'),
        'copilotApi: app-server bridge wiring is missing.',
    )
    check(
        !copilotApiTs.includes('/v1/ai/requests') && !copilotApiTs.includes('/v1/ai/chat'),
        'copilotApi: legacy HTTP AI endpoints must not be used in runtime path.',
    )
    check(
        !copilotApiTs.includes('directGenerateCopilotCommands') &&
            !copilotApiTs.includes('directChatCompletion'),
        'copilotApi: direct runtime fallback must be removed.',
    )
}

function verifyPaidAgentGuardrails() {
    const inspectorTs = readText('src/features/copilot/CopilotInspector.tsx')
    const actionsTs = readText('src/features/copilot/rightPaneActions.ts')
    const agentUtilsTs = readText('src/features/copilot/rightPaneAgentUtils.ts')

    check(
        !inspectorTs.includes('data-testid="copilot-runtime-status"'),
        'CopilotInspector.tsx: paid runtime status card should stay hidden in release UI.',
    )
    check(
        !inspectorTs.includes('data-testid="copilot-guardrail-status"'),
        'CopilotInspector.tsx: paid guardrail status card should stay hidden in release UI.',
    )
    check(
        actionsTs.includes('lastRuntimeStatus: buildRuntimeStatus'),
        'rightPaneActions.ts: runtime status must be persisted after turns.',
    )
    check(
        actionsTs.includes('lastGuardrailStatus: buildGuardrailStatus'),
        'rightPaneActions.ts: guardrail status must be persisted after gate checks.',
    )
    check(
        agentUtilsTs.includes('export function buildRuntimeStatus') &&
            agentUtilsTs.includes('export function buildGuardrailStatus'),
        'rightPaneAgentUtils.ts: paid runtime/guardrail helper exports are missing.',
    )
}

function verifyAgentV3LaunchReadiness() {
    const pkg = JSON.parse(readText('package.json'))
    const scripts = pkg.scripts ?? {}
    const routingTs = readText('src/features/copilot/agentV3Routing.ts')
    const profileTs = readText('shared/copilotServiceProfile.ts')
    const featureGuidesTs = readText('shared/copilotFeatureGuides.ts')
    const launchQaTs = readText('scripts/qa-agent-v3-launch-readiness.mjs')

    check(Boolean(scripts['qa:agent:v3:launch']), 'package.json: qa:agent:v3:launch script is missing.')
    check(exists('scripts/fixtures/agent-v3-launch-readiness.v1.json'), 'Agent V3 launch readiness fixture is missing.')
    check(routingTs.includes("'book_context_review'"), 'agentV3Routing: book_context_review mode is missing.')
    check(profileTs.includes('[Stage:BookContextReview]'), 'copilotServiceProfile: book context stage is missing.')
    check(featureGuidesTs.includes("title: '프로젝트 저장'"), 'copilotFeatureGuides: save guide coverage is missing.')
    check(
        launchQaTs.includes('agent-v3-launch-readiness.v1.json') &&
            launchQaTs.includes('buildBookContextReviewSnapshot') &&
            launchQaTs.includes('formatCopilotFeatureGuideReply'),
        'qa-agent-v3-launch-readiness.mjs: launch readiness coverage is incomplete.',
    )
}

verifyCsp()
verifyElectronHardening()
verifyBuildConfig()
verifyIconAssets()
verifyArtifacts()
verifyEmbeddedFontsManifest()
verifyRuntimeSafeguards()
verifyPaidAgentGuardrails()
verifyAgentV3LaunchReadiness()

if (warnings.length > 0) {
    console.log('Release gate warnings:')
    for (const message of warnings) {
        console.log(`- ${message}`)
    }
}

if (failures.length > 0) {
    console.error('Release gate failed:')
    for (const message of failures) {
        console.error(`- ${message}`)
    }
    process.exit(1)
}

console.log('Release gate passed.')
