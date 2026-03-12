export const QA_E2E_LABELS = {
    help: '^(도움말|Help)$',
    quickStart: '(BookSpace 빠른 시작|BookSpace Quick Start)',
    close: '^(닫기|Close)$',
    import: '^(가져오기|Import)$',
    importDocx: '^(DOCX 가져오기|Import DOCX)$',
    importDocxDone: '(DOCX 파일을 가져왔습니다|DOCX import complete|Imported DOCX file|Imported DOCX)',
    openProject: '(파일.*열기|열기|Open(?:\\s+File|\\s+Project)?)',
    export: '^(내보내기|Export)$',
    exportFormat: '^(포맷|Format)$',
    saveDone: '(저장했습니다\\.|Saved\\.)',
    history: '^(버전 관리|Version Manager)$',
} as const

export const QA_E2E_TAB_RULES = {
    playwrightAddCount: 6,
    autorunAddCount: 2,
    overflowViewport: {
        width: 980,
        height: 900,
    },
    overflowTimeoutMs: 6000,
} as const

export const QA_E2E_COPILOT_SCENARIOS = {
    prologueAppend: {
        id: 'prologueAppend',
        prompt: '프롤로그에 한 문단 추가해줘',
        appliedPattern: '1개 변경을 적용했습니다\\.',
        previewSummaryPattern: '프롤로그|본문 덧붙이기|미리보기|append',
        steps: {
            preview: 'copilot/prologue-preview',
            previewSummary: 'copilot/prologue-preview-summary',
            apply: 'copilot/prologue-apply',
            editorUpdated: 'copilot/prologue-editor-updated',
        },
    },
    existingRename: {
        id: 'existingRename',
        prompt: '챕터1 제목을 랜덤뽑기로 바꿔줘',
        appliedPattern: '1개 변경을 적용했습니다\\.',
        previewSummaryPattern: '랜덤뽑기|챕터\\s*이름\\s*변경|rename',
        expectedTitle: '랜덤뽑기',
        steps: {
            preview: 'copilot/existing-rename-preview',
            previewSummary: 'copilot/existing-rename-preview-summary',
            apply: 'copilot/existing-rename-apply',
            titleUpdated: 'copilot/existing-rename-title-updated',
        },
    },
    structuredCreate: {
        id: 'structuredCreate',
        prompt: 'Part 1 안에 챕터 3 페이지를 새로 만들고 제목은 바다를 건너는 밤으로 해줘',
        confirmationPattern: '구조 변경|부모 위치|바다를 건너는 밤|Part 1',
        steps: {
            confirmationVisible: 'copilot/structured-create-confirmation-visible',
        },
    },
    missingRename: {
        id: 'missingRename',
        prompt: '3장 제목을 바꿔줘',
        responsePattern: '3장.*(없어|찾지 못했|새로 만들어|다시 확인)',
        steps: {
            response: 'copilot/missing-rename-message',
        },
    },
    publishingFeedback: {
        id: 'publishingFeedback',
        prompt: '출간 피드백을 해줘',
        previewReadyPattern: '미리보기를 생성할 준비가 되었습니다\\.',
        artifactContentPattern: 'checklist|출간|EPUB|metadata|메타데이터',
        steps: {
            previewReady: 'copilot/publishing-preview-ready',
            artifactContent: 'copilot/publishing-artifact-content',
        },
        warnings: {
            missingArtifact: 'publishing preview completed without latest artifact card in current runtime path',
            missingArtifactOrHandoff: 'Publishing preview completed without latest artifact/handoff cards in current runtime path.',
            missingHandoff: 'publishing preview completed without latest handoff card in current runtime path',
        },
    },
} as const

export const QA_E2E_COPILOT_FLOW_ORDER = [
    QA_E2E_COPILOT_SCENARIOS.prologueAppend,
    QA_E2E_COPILOT_SCENARIOS.existingRename,
    QA_E2E_COPILOT_SCENARIOS.structuredCreate,
    QA_E2E_COPILOT_SCENARIOS.missingRename,
    QA_E2E_COPILOT_SCENARIOS.publishingFeedback,
] as const

export const QA_E2E_TAB_FLOW = {
    steps: {
        create: 'tabs/create',
        overflowVisible: 'tabs/overflow-visible-on-resize',
        overflowSelect: 'tabs/overflow-select',
        close: 'tabs/close',
    },
    warnings: {
        overflowHidden: (width: number) =>
            `Tab overflow button was not visible at ${width}px width; skipping overflow interaction.`,
    },
} as const
