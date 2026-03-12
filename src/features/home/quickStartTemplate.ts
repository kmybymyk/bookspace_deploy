import type { BookMetadata, Chapter } from '../../types/project'

type TemplateTranslate = (key: string, defaultValue: string) => string

const TEMPLATE_DEFAULT_TEXT = {
  newManuscriptTitle: '새 원고',
  prologueTitle: '서문',
  prologueText: '여기에 서문을 작성하세요.',
  partIntroText: '이 파트의 소개를 작성하세요.',
  chapter1Text: '첫 번째 챕터 본문을 작성하세요.',
  chapter2Text: '두 번째 챕터 본문을 작성하세요.',
  epilogueTitle: '에필로그',
  epilogueText: '여기에 마무리 글을 작성하세요.',
  part1Title: 'Part 1',
  chapter1Title: 'Chapter 1',
  chapter2Title: 'Chapter 2',
} as const

function resolveTemplateText(key: keyof typeof TEMPLATE_DEFAULT_TEXT, translate?: TemplateTranslate): string {
  const defaultValue = TEMPLATE_DEFAULT_TEXT[key]
  if (!translate) return defaultValue
  const translated = translate(`quickStartTemplate.${key}`, defaultValue)
  return typeof translated === 'string' && translated.length > 0 ? translated : defaultValue
}

export interface QuickStartTemplate {
  metadata: BookMetadata
  chapters: Chapter[]
}

export function createEmptyMetadata(idFactory: () => string): BookMetadata {
  return {
    title: '',
    subtitle: '',
    authors: [{ id: idFactory(), name: '', role: 'author' }],
    identifierType: 'isbn',
    identifier: '',
    language: 'ko',
    publisher: '',
    isbn: '',
    link: '',
    description: '',
  }
}

export function createQuickStartTemplate(idFactory: () => string, translate?: TemplateTranslate): QuickStartTemplate {
  const frontId = idFactory()
  const partId = idFactory()
  const chapter1Id = idFactory()
  const chapter2Id = idFactory()
  const backId = idFactory()

  return {
    metadata: {
      ...createEmptyMetadata(idFactory),
      title: resolveTemplateText('newManuscriptTitle', translate),
    },
    chapters: [
      {
        id: frontId,
        title: resolveTemplateText('prologueTitle', translate),
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: resolveTemplateText('prologueText', translate) }] }] },
        order: 0,
        fileName: 'chapter-prologue.xhtml',
        chapterType: 'front',
        chapterKind: 'prologue',
        parentId: null,
      },
      {
        id: partId,
        title: resolveTemplateText('part1Title', translate),
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: resolveTemplateText('partIntroText', translate) }] }] },
        order: 1,
        fileName: 'chapter-part-1.xhtml',
        chapterType: 'part',
        chapterKind: 'part',
        parentId: null,
      },
      {
        id: chapter1Id,
        title: resolveTemplateText('chapter1Title', translate),
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: resolveTemplateText('chapter1Text', translate) }] }] },
        order: 2,
        fileName: 'chapter-1.xhtml',
        chapterType: 'chapter',
        chapterKind: 'chapter',
        parentId: partId,
      },
      {
        id: chapter2Id,
        title: resolveTemplateText('chapter2Title', translate),
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: resolveTemplateText('chapter2Text', translate) }] }] },
        order: 3,
        fileName: 'chapter-2.xhtml',
        chapterType: 'chapter',
        chapterKind: 'chapter',
        parentId: partId,
      },
      {
        id: backId,
        title: resolveTemplateText('epilogueTitle', translate),
        content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: resolveTemplateText('epilogueText', translate) }] }] },
        order: 4,
        fileName: 'chapter-epilogue.xhtml',
        chapterType: 'back',
        chapterKind: 'epilogue',
        parentId: null,
      },
    ],
  }
}
