#!/usr/bin/env node
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function resolveDefaultDiagnosticsPath() {
  const home = os.homedir()
  const candidates = [
    path.join(home, 'Library', 'Application Support', 'bookspace', 'diagnostics', 'runtime-errors.ndjson'),
    path.join(home, 'Library', 'Application Support', 'BookSpace', 'diagnostics', 'runtime-errors.ndjson'),
    path.join(process.env.APPDATA ?? '', 'BookSpace', 'diagnostics', 'runtime-errors.ndjson'),
    path.join(home, '.config', 'BookSpace', 'diagnostics', 'runtime-errors.ndjson'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fssync.existsSync(candidate)) return candidate
  }
  return candidates[0] ?? ''
}

function timestampForFileName() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function main() {
  const logPath = process.env.QA_DIAGNOSTICS_LOG_PATH || resolveDefaultDiagnosticsPath()
  if (!logPath) {
    throw new Error('runtime diagnostics log path could not be resolved')
  }

  const diagnosticsDir = path.dirname(logPath)
  await ensureDir(diagnosticsDir)

  const archiveDir = path.join(diagnosticsDir, 'baseline-archives')
  await ensureDir(archiveDir)

  if (!fssync.existsSync(logPath)) {
    await fs.writeFile(logPath, '', 'utf-8')
    console.log(`[qa:runtime:reset] initialized empty log: ${logPath}`)
    return
  }

  const stat = await fs.stat(logPath)
  const archivePath = path.join(
    archiveDir,
    `runtime-errors.${timestampForFileName()}.ndjson`,
  )

  if (stat.size > 0) {
    await fs.copyFile(logPath, archivePath)
    console.log(`[qa:runtime:reset] archived: ${archivePath}`)
  } else {
    console.log('[qa:runtime:reset] source log already empty, archive skipped')
  }

  await fs.writeFile(logPath, '', 'utf-8')
  console.log(`[qa:runtime:reset] truncated: ${logPath}`)
}

main().catch((error) => {
  console.error('[qa:runtime:reset] failed')
  console.error(error)
  process.exit(1)
})

