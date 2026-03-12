export type CopilotFeatureGuideAvailability = 'supported' | 'unsupported'

export interface CopilotFeatureGuide {
  id: string
  title: string
  availability: CopilotFeatureGuideAvailability
  summary: string
  location: string
  steps: string[]
  limitations: string[]
  alternatives?: string[]
  matchers: RegExp[]
}

export interface ResolvedCopilotFeatureGuides {
  guides: CopilotFeatureGuide[]
  ambiguity: 'clear' | 'ambiguous' | 'unknown'
}

const FEATURE_GUIDES: CopilotFeatureGuide[] = [
  {
    id: 'import_external_files',
    title: '외부 파일 가져오기',
    availability: 'supported',
    summary: 'EPUB, DOCX, Markdown 파일을 현재 편집 워크스페이스로 가져올 수 있습니다.',
    location: '왼쪽 세로 툴바의 가져오기 버튼',
    steps: [
      '왼쪽 세로 툴바에서 가져오기를 엽니다.',
      'EPUB 가져오기, DOCX 가져오기, Markdown 가져오기 중 하나를 고릅니다.',
      '파일을 선택하면 현재 워크스페이스를 해당 원고로 교체합니다.',
    ],
    limitations: [
      '기존 작업물이 있으면 가져오기 전에 교체 확인을 먼저 합니다.',
      'BKSP 프로젝트 파일은 가져오기가 아니라 파일 열기로 여는 흐름입니다.',
    ],
    matchers: [
      /(epub|docx|markdown|md).*(가져오기|import)/i,
      /(가져오기|import).*(epub|docx|markdown|md)/i,
      /(외부\s*파일|원고).*(가져오기|불러오기)/i,
    ],
  },
  {
    id: 'export_epub_docx',
    title: 'EPUB/DOCX 내보내기',
    availability: 'supported',
    summary: '편집한 책을 EPUB 2.0, EPUB 3.0, DOCX 형식으로 내보낼 수 있습니다.',
    location: '왼쪽 세로 툴바의 내보내기 버튼',
    steps: [
      '왼쪽 세로 툴바에서 내보내기를 엽니다.',
      '형식을 EPUB 2.0, EPUB 3.0, DOCX 중에서 고릅니다.',
      '필요하면 EPUB 폰트 내장 옵션을 조정한 뒤 저장 경로를 선택합니다.',
    ],
    limitations: [
      'EPUB은 내보내기 중 경고가 있을 수 있어 메타데이터와 자산을 함께 점검하는 편이 안전합니다.',
      'DOCX는 제목을 기본 파일명으로 사용하고, 상세 메타데이터는 EPUB 내보내기보다 단순합니다.',
    ],
    matchers: [
      /(epub|docx).*(내보내기|export)/i,
      /(내보내기|export).*(epub|docx)/i,
      /(폰트\s*내장|embed\s*fonts)/i,
    ],
  },
  {
    id: 'save_project',
    title: '프로젝트 저장',
    availability: 'supported',
    summary: '현재 작업 중인 BookSpace 프로젝트를 저장할 수 있고, 작업 내용은 자동 저장도 지원합니다.',
    location: '상단 타이틀바의 저장 버튼 또는 Cmd/Ctrl + S',
    steps: [
      '상단 타이틀바의 저장 버튼을 누르거나 Cmd/Ctrl + S를 사용합니다.',
      '처음 저장이면 저장 위치와 파일명을 정합니다.',
      '이후에는 같은 프로젝트 파일에 계속 저장됩니다.',
    ],
    limitations: [
      '버전 관리는 저장된 프로젝트에서만 사용할 수 있습니다.',
      '자동 저장이 있어도 큰 구조 변경 전에는 수동 저장을 해두는 편이 안전합니다.',
    ],
    matchers: [
      /(저장|save|autosave|자동\s*저장)/i,
    ],
  },
  {
    id: 'version_manager',
    title: '버전 관리',
    availability: 'supported',
    summary: '이전 상태를 확인하고 복구할 수 있는 버전 관리 화면이 있습니다.',
    location: '왼쪽 세로 툴바의 버전 관리 또는 Cmd/Ctrl + Shift + V',
    steps: [
      '저장된 프로젝트에서 왼쪽 세로 툴바의 버전 관리를 엽니다.',
      '원하는 시점의 스냅샷을 확인합니다.',
      '필요하면 현재 프로젝트를 교체하거나 새 파일로 복원합니다.',
    ],
    limitations: [
      '버전 관리는 저장된 프로젝트에서만 사용할 수 있습니다.',
      '가장 큰 구조 변경 전에는 수동 저장까지 해두면 더 안전합니다.',
    ],
    matchers: [
      /(버전\s*관리|history|snapshot|스냅샷|복구|restore)/i,
    ],
  },
  {
    id: 'cover_assets',
    title: '표지와 로고 자산',
    availability: 'supported',
    summary: '앞표지, 뒷표지, 출판사 로고를 설정하거나 교체할 수 있습니다.',
    location: '왼쪽 세로 툴바의 표지 또는 책 정보 패널',
    steps: [
      '왼쪽 세로 툴바에서 표지를 엽니다.',
      '앞표지나 뒷표지 슬롯을 눌러 이미지를 추가하거나 교체합니다.',
      '출판사 로고는 책 정보 패널에서 함께 관리할 수 있습니다.',
    ],
    limitations: [
      '지원 이미지는 JPG, PNG, WEBP, GIF이며 크기 제한이 있습니다.',
      '표지 이미지 품질은 내보내기 결과에 직접 영향을 줍니다.',
    ],
    matchers: [
      /(표지|커버|cover|뒷표지|back\s*cover|로고|logo)/i,
    ],
  },
  {
    id: 'book_info',
    title: '책 정보',
    availability: 'supported',
    summary: '제목, 부제, 저자, 언어, 출판사, 링크, 설명 같은 메타데이터를 수정할 수 있습니다.',
    location: '왼쪽 세로 툴바의 책 정보 패널',
    steps: [
      '왼쪽 세로 툴바에서 책 정보를 엽니다.',
      '제목, 저자, 언어, 출판사 등 필요한 항목을 입력합니다.',
      '내보내기 전에 비어 있는 항목이 없는지 한 번 더 확인합니다.',
    ],
    limitations: [
      '언어 코드는 EPUB 표준 BCP47 형식을 권장합니다.',
      '책 정보 품질은 EPUB 메타데이터와 내보내기 결과 품질에 영향을 줍니다.',
    ],
    matchers: [
      /(책\s*정보|metadata|메타데이터|저자|출판사|언어\s*코드|isbn|제목)/i,
    ],
  },
  {
    id: 'design_controls',
    title: '테마와 타이포그래피',
    availability: 'supported',
    summary: '현재 책 디자인에서 테마, 타이포그래피, 페이지 배경을 조정할 수 있습니다.',
    location: '왼쪽 세로 툴바의 디자인 패널',
    steps: [
      '왼쪽 세로 툴바에서 디자인을 엽니다.',
      '테마, 타이포그래피, 페이지 섹션에서 원하는 값을 조정합니다.',
      '필요하면 현재 페이지 섹션과 책 전체 톤이 맞는지 미리보기로 확인합니다.',
    ],
    limitations: [
      '디자인 변경은 책 전반 인상에 영향을 주므로 한 번에 크게 바꾸기 전에 확인이 필요합니다.',
      '페이지 배경은 현재 페이지 섹션 기준으로 보이는 결과를 먼저 점검하는 편이 안전합니다.',
    ],
    matchers: [
      /(테마|theme|타이포그래피|typography|폰트|글꼴|배경|page\s*background|디자인)/i,
    ],
  },
  {
    id: 'find_replace',
    title: '찾아 바꾸기',
    availability: 'supported',
    summary: '편집 화면에서 현재 원고의 텍스트를 찾아 바꿀 수 있습니다.',
    location: '왼쪽 세로 툴바의 검색 버튼',
    steps: [
      '편집 화면에서 왼쪽 세로 툴바의 검색 버튼을 누릅니다.',
      '찾을 텍스트와 바꿀 텍스트를 입력합니다.',
      '적용 전에 바뀔 범위를 확인하고 진행합니다.',
    ],
    limitations: [
      '편집 모드에서 사용하는 흐름입니다.',
      '자동 치환 전에는 대상 범위를 한번 눈으로 확인하는 편이 안전합니다.',
    ],
    matchers: [
      /(찾아\s*바꾸기|find\s*replace|검색|치환)/i,
    ],
  },
]

function scoreGuide(prompt: string, guide: CopilotFeatureGuide): number {
  return guide.matchers.reduce((score, matcher) => (matcher.test(prompt) ? score + 1 : score), 0)
}

export function resolveCopilotFeatureGuides(prompt: string, limit = 2): ResolvedCopilotFeatureGuides {
  const normalizedPrompt = String(prompt ?? '').trim()
  if (!normalizedPrompt) {
    return {
      guides: [],
      ambiguity: 'unknown',
    }
  }

  const ranked = FEATURE_GUIDES
    .map((guide) => ({ guide, score: scoreGuide(normalizedPrompt, guide) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  if (ranked.length === 0) {
    return {
      guides: [],
      ambiguity: 'unknown',
    }
  }

  const guides = ranked.slice(0, limit).map((entry) => entry.guide)
  const ambiguity = ranked.length > 1 && ranked[0].score === ranked[1].score ? 'ambiguous' : 'clear'
  return {
    guides,
    ambiguity,
  }
}

export function formatCopilotFeatureGuideReply(prompt: string): string | null {
  const normalizedPrompt = String(prompt ?? '').trim()
  if (!normalizedPrompt) return null

  const { guides, ambiguity } = resolveCopilotFeatureGuides(normalizedPrompt, 2)
  if (guides.length === 0) {
    return '현재 확인된 BookSpace 기능 목록 안에서는 질문하신 기능을 특정하지 못했습니다. 찾고 싶은 기능명을 한 문장으로 더 구체적으로 적어주시면, 있는지 여부와 사용 경로를 바로 정리해드리겠습니다.'
  }

  const primary = guides[0]
  const lines = [
    primary.availability === 'supported' ? '있습니다.' : '현재는 지원하지 않습니다.',
    `기능: ${primary.title}`,
    `설명: ${primary.summary}`,
    `위치: ${primary.location}`,
    '사용 방법:',
    ...primary.steps.map((step, index) => `${index + 1}. ${step}`),
  ]

  if (primary.limitations.length > 0) {
    lines.push('제한 및 참고:')
    primary.limitations.forEach((item) => lines.push(`- ${item}`))
  }

  if (primary.alternatives && primary.alternatives.length > 0) {
    lines.push('대안:')
    primary.alternatives.forEach((item) => lines.push(`- ${item}`))
  }

  if (ambiguity === 'ambiguous' && guides[1]) {
    lines.push(`참고: 질문이 ${guides[1].title}와도 겹쳐 보입니다. 원하시면 그 기능 기준으로도 이어서 설명해드리겠습니다.`)
  }

  return lines.join('\n')
}
