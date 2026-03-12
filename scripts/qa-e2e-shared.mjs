import fs from 'node:fs/promises'
import fssync from 'node:fs'
import JSZip from 'jszip'

export const QA_E2E_RUNTIME_ENV = {
  BOOKSPACE_PLAN: 'PRO',
  BOOKSPACE_AI_CREDITS: '300',
  BOOKSPACE_COPILOT_RUNTIME_MODE: 'ipc',
}

export async function waitForFile(filePath, timeoutMs = 7000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (fssync.existsSync(filePath)) {
      const stat = await fs.stat(filePath)
      if (stat.size > 0) return true
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  return false
}

export async function waitForCondition(checkFn, timeoutMs = 5000, intervalMs = 120) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await checkFn()) return true
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

export async function verifyEpubTableWidth(filePath) {
  try {
    const source = await fs.readFile(filePath)
    const zip = await JSZip.loadAsync(source)
    const textEntries = Object.keys(zip.files).filter(
      (entry) => entry.startsWith('OEBPS/Text/') && entry.endsWith('.xhtml'),
    )
    if (textEntries.length === 0) {
      return { ok: false, details: 'text/xhtml entry not found in exported EPUB' }
    }

    const tableEntries = []
    for (const textEntry of textEntries) {
      const xhtml = await zip.file(textEntry)?.async('string')
      if (!xhtml) {
        tableEntries.push(`${textEntry}:empty`)
        continue
      }

      const hasTable = /<table\b/i.test(xhtml)
      const hasColgroup = /<colgroup>[\s\S]*?<\/colgroup>/.test(xhtml)
      const hasColWidthStyle = /<col[^>]*style="width:\s*\d+(?:\.\d+)?(?:px|%)"[^>]*>/i.test(xhtml)
      const hasCellColwidth = /colwidth="\d+(?:,\d+)*"/i.test(xhtml)

      if (hasTable) {
        tableEntries.push(
          `entry=${textEntry},hasColgroup=${hasColgroup},hasColWidthStyle=${hasColWidthStyle},hasCellColwidth=${hasCellColwidth}`,
        )
      }

      if (hasTable && hasColgroup && hasColWidthStyle && hasCellColwidth) {
        return {
          ok: true,
          details: `found colgroup and width attrs in ${textEntry}`,
        }
      }
    }

    if (tableEntries.length === 0) {
      return { ok: false, details: 'no <table> element found in exported XHTML entries' }
    }

    return {
      ok: false,
      details: `no table with complete width metadata; samples: ${tableEntries.join(' | ')}`,
    }
  } catch (error) {
    return {
      ok: false,
      details: `epub parse error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function makeFixtureProject() {
  const baseTable = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '표 셀 폭 조절 테스트용 목업' }] },
      {
        type: 'table',
        attrs: { class: 'table-gap-md' },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                attrs: {
                  colwidth: [160],
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '헤더 1' }] }],
              },
              {
                type: 'tableHeader',
                attrs: {
                  colwidth: [220],
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '헤더 2' }] }],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: {
                  colwidth: [160],
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '첫 번째 셀 값' }] }],
              },
              {
                type: 'tableCell',
                attrs: {
                  colwidth: [220],
                },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '두 번째 셀 값' }] }],
              },
            ],
          },
        ],
      },
    ],
  }

  const simpleParagraph = (text) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

  return {
    version: '0.1.0',
    metadata: {
      title: 'E2E Fixture',
      subtitle: '',
      authors: [{ id: 'author-1', name: 'QA Bot', role: 'author' }],
      language: 'ko',
      publisher: '',
      isbn: '',
      link: '',
      description: '',
    },
    chapters: [
      {
        id: 'prologue',
        title: '프롤로그',
        content: simpleParagraph('프롤로그 기본 문단입니다.'),
        order: 0,
        fileName: 'prologue.xhtml',
        chapterType: 'front',
        chapterKind: 'prologue',
        parentId: null,
      },
      {
        id: 'chapter-1',
        title: '1장',
        content: baseTable,
        order: 1,
        fileName: 'chapter-1.xhtml',
        chapterType: 'chapter',
        chapterKind: 'chapter',
        parentId: null,
      },
      {
        id: 'chapter-2',
        title: '2장',
        content: simpleParagraph('두 번째 장 기본 문단입니다.'),
        order: 2,
        fileName: 'chapter-2.xhtml',
        chapterType: 'chapter',
        chapterKind: 'chapter',
        parentId: null,
      },
    ],
    designSettings: {},
  }
}
