import { Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

export type MenuAction =
    | 'new-project'
    | 'save-project'
    | 'save-project-as'
    | 'import-epub'
    | 'import-docx'
    | 'import-md'
    | 'open-export'
    | 'open-version-manager'
    | 'view-edit'
    | 'view-preview-reflow'
    | 'view-preview-spread'
    | 'toggle-left-pane'
    | 'toggle-right-pane'
    | 'open-find-replace'
    | 'find-next'
    | 'find-prev'
    | 'check-for-updates'
    | 'dev-ai-enable'
    | 'dev-ai-disable'
    | 'dev-plan-free'
    | 'dev-plan-pro-lite'
    | 'dev-plan-pro'
    | 'dev-lang-ko'
    | 'dev-lang-en'
    | 'update-test-reset'
    | 'update-test-available'
    | 'update-test-not-available'
    | 'update-test-downloading'
    | 'update-test-downloaded'
    | 'update-test-error'
    | 'open-help'

interface BuildApplicationMenuArgs {
    appName: string
    isDevelopment: boolean
    isMac: boolean
    isKorean: boolean
    emitMenuAction: (action: MenuAction) => void
    runEditorCommand: (
        command: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'delete' | 'selectAll',
    ) => void
    runViewCommand: (
        command:
            | 'reload'
            | 'forceReload'
            | 'toggleDevTools'
            | 'resetZoom'
            | 'zoomIn'
            | 'zoomOut'
            | 'toggleFullscreen',
    ) => void
    openProjectFromDialog: () => Promise<void>
    openReportIssue: () => void
    openLogFolder: () => void
}

export function buildApplicationMenu({
    appName,
    isDevelopment,
    isMac,
    isKorean,
    emitMenuAction,
    runEditorCommand,
    runViewCommand,
    openProjectFromDialog,
    openReportIssue,
    openLogFolder,
}: BuildApplicationMenuArgs) {
    const labels = isKorean
        ? {
            topFile: '파일',
            topEdit: '편집',
            topView: '보기',
            topWindow: '창',
            topDeveloper: '개발자',
            topHelp: '도움말',
            newProject: '새 프로젝트',
            open: '열기...',
            importEpub: 'EPUB 가져오기...',
            importDocx: 'DOCX 가져오기...',
            importMarkdown: 'Markdown 가져오기...',
            save: '저장',
            saveAs: '다른 이름으로 저장...',
            export: '내보내기...',
            versionManager: '버전 관리',
            undo: '실행 취소',
            redo: '다시 실행',
            findReplace: '찾기/바꾸기...',
            findNext: '다음 찾기',
            findPrev: '이전 찾기',
            cut: '잘라내기',
            copy: '복사',
            paste: '붙여넣기',
            remove: '삭제',
            selectAll: '전체 선택',
            editView: '편집 화면',
            previewReflow: '미리보기(리플로우)',
            previewSpread: '미리보기(펼침)',
            toggleLeftPane: '왼쪽 패널 보이기/숨기기',
            toggleRightPane: '오른쪽 패널 보이기/숨기기',
            reload: '새로고침',
            forceReload: '강력 새로고침',
            toggleDevTools: '개발자 도구 보기/숨기기',
            resetZoom: '실제 크기',
            zoomIn: '확대',
            zoomOut: '축소',
            toggleFullscreen: '전체 화면 전환',
            minimize: '최소화',
            zoomWindow: '확대/축소',
            bringAllToFront: '모두 앞으로 가져오기',
            closeWindow: '창 닫기',
            quickHelp: '빠른 도움말',
            checkForUpdates: '업데이트 확인...',
            reportIssue: '문제 보고',
            openLogFolder: '오류 로그 폴더 열기',
            developerAiTitle: 'AI 기능',
            developerAiEnable: 'AI 기능 켜기',
            developerAiDisable: 'AI 기능 끄기',
            developerPlanTitle: '계정 그레이드',
            developerPlanFree: 'FREE',
            developerPlanProLite: 'PRO LITE',
            developerPlanPro: 'PRO',
            developerLanguageTitle: '표시 언어',
            developerLanguageKo: '한국어',
            developerLanguageEn: 'English',
            developerUpdateTitle: '업데이트 상태 테스트',
            updateTestReset: '실제 상태 복귀',
            updateTestAvailable: '업데이트 있음',
            updateTestNotAvailable: '업데이트 없음',
            updateTestDownloading: '다운로드 중',
            updateTestDownloaded: '적용 준비 완료',
            updateTestError: '오류',
        }
        : {
            topFile: 'File',
            topEdit: 'Edit',
            topView: 'View',
            topWindow: 'Window',
            topDeveloper: 'Developer',
            topHelp: 'Help',
            newProject: 'New Project',
            open: 'Open...',
            importEpub: 'Import EPUB...',
            importDocx: 'Import DOCX...',
            importMarkdown: 'Import Markdown...',
            save: 'Save',
            saveAs: 'Save As...',
            export: 'Export...',
            versionManager: 'Version Manager',
            undo: 'Undo',
            redo: 'Redo',
            findReplace: 'Find/Replace...',
            findNext: 'Find Next',
            findPrev: 'Find Previous',
            cut: 'Cut',
            copy: 'Copy',
            paste: 'Paste',
            remove: 'Delete',
            selectAll: 'Select All',
            editView: 'Edit View',
            previewReflow: 'Preview (Reflow)',
            previewSpread: 'Preview (Spread)',
            toggleLeftPane: 'Toggle Left Panel',
            toggleRightPane: 'Toggle Right Panel',
            reload: 'Reload',
            forceReload: 'Force Reload',
            toggleDevTools: 'Toggle Developer Tools',
            resetZoom: 'Actual Size',
            zoomIn: 'Zoom In',
            zoomOut: 'Zoom Out',
            toggleFullscreen: 'Toggle Full Screen',
            minimize: 'Minimize',
            zoomWindow: 'Zoom',
            bringAllToFront: 'Bring All to Front',
            closeWindow: 'Close Window',
            quickHelp: 'Quick Help',
            checkForUpdates: 'Check for Updates...',
            reportIssue: 'Report Issue',
            openLogFolder: 'Open Error Log Folder',
            developerAiTitle: 'AI Features',
            developerAiEnable: 'Enable AI',
            developerAiDisable: 'Disable AI',
            developerPlanTitle: 'Account Grade',
            developerPlanFree: 'FREE',
            developerPlanProLite: 'PRO LITE',
            developerPlanPro: 'PRO',
            developerLanguageTitle: 'Display Language',
            developerLanguageKo: 'Korean',
            developerLanguageEn: 'English',
            developerUpdateTitle: 'Update State Test',
            updateTestReset: 'Back to Real State',
            updateTestAvailable: 'Update Available',
            updateTestNotAvailable: 'Up to Date',
            updateTestDownloading: 'Downloading',
            updateTestDownloaded: 'Ready to Install',
            updateTestError: 'Error',
        }

    const template: MenuItemConstructorOptions[] = [
        ...(isMac
            ? [{
                label: appName,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' as const },
                    { role: 'services' as const },
                    { type: 'separator' as const },
                    { role: 'hide' as const },
                    { role: 'hideOthers' as const },
                    { role: 'unhide' as const },
                    { type: 'separator' as const },
                    { role: 'quit' as const },
                ] as MenuItemConstructorOptions[],
            }]
            : []),
        {
            label: labels.topFile,
            submenu: [
                {
                    label: labels.newProject,
                    accelerator: 'CmdOrCtrl+N',
                    click: () => emitMenuAction('new-project'),
                },
                {
                    label: labels.open,
                    accelerator: 'CmdOrCtrl+O',
                    click: () => {
                        void openProjectFromDialog()
                    },
                },
                { type: 'separator' },
                {
                    label: labels.importEpub,
                    click: () => emitMenuAction('import-epub'),
                },
                {
                    label: labels.importDocx,
                    click: () => emitMenuAction('import-docx'),
                },
                {
                    label: labels.importMarkdown,
                    click: () => emitMenuAction('import-md'),
                },
                { type: 'separator' },
                {
                    label: labels.save,
                    accelerator: 'CmdOrCtrl+S',
                    click: () => emitMenuAction('save-project'),
                },
                {
                    label: labels.saveAs,
                    accelerator: 'Shift+CmdOrCtrl+S',
                    click: () => emitMenuAction('save-project-as'),
                },
                {
                    label: labels.export,
                    accelerator: 'CmdOrCtrl+E',
                    click: () => emitMenuAction('open-export'),
                },
                { type: 'separator' },
                {
                    label: labels.versionManager,
                    accelerator: 'Shift+CmdOrCtrl+V',
                    click: () => emitMenuAction('open-version-manager'),
                },
                { type: 'separator' },
                { role: 'recentDocuments' as const },
                { type: 'separator' },
                isMac ? { role: 'close' as const } : { role: 'quit' as const },
            ] as MenuItemConstructorOptions[],
        },
        {
            label: labels.topEdit,
            submenu: [
                {
                    label: labels.undo,
                    accelerator: 'CmdOrCtrl+Z',
                    click: () => runEditorCommand('undo'),
                },
                {
                    label: labels.redo,
                    accelerator: 'Shift+CmdOrCtrl+Z',
                    click: () => runEditorCommand('redo'),
                },
                ...(!isMac
                    ? [{
                        label: labels.redo,
                        accelerator: 'Ctrl+Y',
                        click: () => runEditorCommand('redo'),
                        visible: false,
                    } as MenuItemConstructorOptions]
                    : []),
                { type: 'separator' },
                {
                    label: labels.findReplace,
                    accelerator: 'CmdOrCtrl+F',
                    click: () => emitMenuAction('open-find-replace'),
                },
                {
                    label: labels.findNext,
                    accelerator: 'CmdOrCtrl+G',
                    click: () => emitMenuAction('find-next'),
                },
                {
                    label: labels.findPrev,
                    accelerator: 'Shift+CmdOrCtrl+G',
                    click: () => emitMenuAction('find-prev'),
                },
                { type: 'separator' },
                {
                    label: labels.cut,
                    accelerator: 'CmdOrCtrl+X',
                    click: () => runEditorCommand('cut'),
                },
                {
                    label: labels.copy,
                    accelerator: 'CmdOrCtrl+C',
                    click: () => runEditorCommand('copy'),
                },
                {
                    label: labels.paste,
                    accelerator: 'CmdOrCtrl+V',
                    click: () => runEditorCommand('paste'),
                },
                {
                    label: labels.remove,
                    click: () => runEditorCommand('delete'),
                },
                {
                    label: labels.selectAll,
                    accelerator: 'CmdOrCtrl+A',
                    click: () => runEditorCommand('selectAll'),
                },
            ] as MenuItemConstructorOptions[],
        },
        {
            label: labels.topView,
            submenu: [
                {
                    label: labels.editView,
                    accelerator: 'CmdOrCtrl+1',
                    click: () => emitMenuAction('view-edit'),
                },
                {
                    label: labels.previewReflow,
                    accelerator: 'CmdOrCtrl+2',
                    click: () => emitMenuAction('view-preview-reflow'),
                },
                {
                    label: labels.previewSpread,
                    accelerator: 'CmdOrCtrl+3',
                    click: () => emitMenuAction('view-preview-spread'),
                },
                { type: 'separator' },
                {
                    label: labels.toggleLeftPane,
                    accelerator: 'Alt+CmdOrCtrl+[',
                    click: () => emitMenuAction('toggle-left-pane'),
                },
                {
                    label: labels.toggleRightPane,
                    accelerator: 'Alt+CmdOrCtrl+]',
                    click: () => emitMenuAction('toggle-right-pane'),
                },
                { type: 'separator' },
                ...(isDevelopment
                    ? [
                        {
                            label: labels.reload,
                            accelerator: 'CmdOrCtrl+R',
                            click: () => runViewCommand('reload'),
                        } as MenuItemConstructorOptions,
                        {
                            label: labels.forceReload,
                            accelerator: 'Shift+CmdOrCtrl+R',
                            click: () => runViewCommand('forceReload'),
                        } as MenuItemConstructorOptions,
                      ]
                    : []),
                ...(isDevelopment
                    ? [
                        {
                            label: labels.toggleDevTools,
                            accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
                            click: () => runViewCommand('toggleDevTools'),
                        } as MenuItemConstructorOptions,
                        { type: 'separator' as const },
                    ]
                    : []),
                {
                    label: labels.resetZoom,
                    accelerator: 'CmdOrCtrl+0',
                    click: () => runViewCommand('resetZoom'),
                },
                {
                    label: labels.zoomIn,
                    accelerator: 'CmdOrCtrl+Plus',
                    click: () => runViewCommand('zoomIn'),
                },
                {
                    label: labels.zoomOut,
                    accelerator: 'CmdOrCtrl+-',
                    click: () => runViewCommand('zoomOut'),
                },
                { type: 'separator' },
                {
                    label: labels.toggleFullscreen,
                    accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
                    click: () => runViewCommand('toggleFullscreen'),
                },
            ] as MenuItemConstructorOptions[],
        },
        {
            label: labels.topWindow,
            submenu: [
                {
                    label: labels.minimize,
                    role: 'minimize',
                },
                {
                    label: labels.zoomWindow,
                    role: 'zoom',
                },
                ...(isMac
                    ? [
                        { type: 'separator' as const },
                        {
                            label: labels.bringAllToFront,
                            role: 'front' as const,
                        },
                    ]
                    : [
                        {
                            label: labels.closeWindow,
                            role: 'close' as const,
                        },
                    ]),
            ] as MenuItemConstructorOptions[],
        },
        {
            label: labels.topHelp,
            submenu: [
                {
                    label: labels.quickHelp,
                    accelerator: 'CmdOrCtrl+/',
                    click: () => emitMenuAction('open-help'),
                },
                {
                    label: labels.checkForUpdates,
                    click: () => emitMenuAction('check-for-updates'),
                },
                { type: 'separator' },
                {
                    label: labels.reportIssue,
                    click: () => {
                        openReportIssue()
                    },
                },
                {
                    label: labels.openLogFolder,
                    click: () => {
                        openLogFolder()
                    },
                },
            ] as MenuItemConstructorOptions[],
        },
        ...(isDevelopment
            ? [{
                label: labels.topDeveloper,
                submenu: [
                    {
                        label: labels.developerAiTitle,
                        submenu: [
                            {
                                label: labels.developerAiEnable,
                                click: () => emitMenuAction('dev-ai-enable'),
                            },
                            {
                                label: labels.developerAiDisable,
                                click: () => emitMenuAction('dev-ai-disable'),
                            },
                            { type: 'separator' },
                            {
                                label: labels.developerPlanTitle,
                                submenu: [
                                    {
                                        label: labels.developerPlanFree,
                                        click: () => emitMenuAction('dev-plan-free'),
                                    },
                                    {
                                        label: labels.developerPlanProLite,
                                        click: () => emitMenuAction('dev-plan-pro-lite'),
                                    },
                                    {
                                        label: labels.developerPlanPro,
                                        click: () => emitMenuAction('dev-plan-pro'),
                                    },
                                ] as MenuItemConstructorOptions[],
                            },
                        ] as MenuItemConstructorOptions[],
                    },
                    {
                        label: labels.developerLanguageTitle,
                        submenu: [
                            {
                                label: labels.developerLanguageKo,
                                click: () => emitMenuAction('dev-lang-ko'),
                            },
                            {
                                label: labels.developerLanguageEn,
                                click: () => emitMenuAction('dev-lang-en'),
                            },
                        ] as MenuItemConstructorOptions[],
                    },
                    { type: 'separator' },
                    {
                        label: labels.developerUpdateTitle,
                        submenu: [
                            {
                                label: labels.updateTestReset,
                                click: () => emitMenuAction('update-test-reset'),
                            },
                            {
                                label: labels.updateTestAvailable,
                                click: () => emitMenuAction('update-test-available'),
                            },
                            {
                                label: labels.updateTestNotAvailable,
                                click: () => emitMenuAction('update-test-not-available'),
                            },
                            {
                                label: labels.updateTestDownloading,
                                click: () => emitMenuAction('update-test-downloading'),
                            },
                            {
                                label: labels.updateTestDownloaded,
                                click: () => emitMenuAction('update-test-downloaded'),
                            },
                            {
                                label: labels.updateTestError,
                                click: () => emitMenuAction('update-test-error'),
                            },
                        ] as MenuItemConstructorOptions[],
                    },
                ] as MenuItemConstructorOptions[],
            }]
            : []),
    ]

    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
