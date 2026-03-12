import type { UiLocale } from './uiDialogCopy'
export type { UiLocale } from './uiDialogCopy'

export type UiErrorKey =
    | 'invalidFileType'
    | 'fileNotFound'
    | 'disallowedPath'
    | 'invalidHistorySnapshotId'
    | 'invalidHistoryFileType'
    | 'disallowedHistoryPath'
    | 'historyFileNotFound'
    | 'autosaveOnlyDelete'
    | 'untrustedSender'
    | 'inactiveFrameSender'
    | 'devOnlyPlanChange'
    | 'unsupportedPlan'
    | 'requestIdRequired'
    | 'unsupportedFeatureId'
    | 'idempotencyKeyRequired'
    | 'unsupportedCopilotIntent'
    | 'googleOAuthBackendRequired'
    | 'copilotMissingSelectionContext'
    | 'copilotSchemaValidationFailed'

const UI_ERROR_COPY: Record<UiLocale, Record<UiErrorKey, string>> = {
    ko: {
        invalidFileType: '허용되지 않는 파일 형식입니다.',
        fileNotFound: '파일을 찾을 수 없습니다.',
        disallowedPath: '허용되지 않은 파일 경로입니다.',
        invalidHistorySnapshotId: '히스토리 식별자가 올바르지 않습니다.',
        invalidHistoryFileType: '히스토리 파일 형식이 올바르지 않습니다.',
        disallowedHistoryPath: '허용되지 않은 히스토리 파일 경로입니다.',
        historyFileNotFound: '히스토리 파일을 찾을 수 없습니다.',
        autosaveOnlyDelete: '자동 저장 버전만 삭제할 수 있습니다.',
        untrustedSender: '신뢰되지 않은 호출 출처입니다.',
        inactiveFrameSender: '활성 앱 프레임이 아닌 출처에서 호출되었습니다.',
        devOnlyPlanChange: '개발 모드에서만 구독 플랜을 변경할 수 있습니다.',
        unsupportedPlan: '지원되지 않는 구독 플랜입니다.',
        requestIdRequired: 'requestId가 필요합니다.',
        unsupportedFeatureId: '지원되지 않는 featureId입니다.',
        idempotencyKeyRequired: 'idempotencyKey가 필요합니다.',
        unsupportedCopilotIntent: '지원되지 않는 copilot intent입니다.',
        googleOAuthBackendRequired: 'Google 로그인은 서버 OAuth 연동 후 사용할 수 있습니다.',
        copilotMissingSelectionContext: '선택 텍스트 컨텍스트가 부족합니다.',
        copilotSchemaValidationFailed: '명령 스키마 검증에 실패했습니다.',
    },
    en: {
        invalidFileType: 'Unsupported file type.',
        fileNotFound: 'File not found.',
        disallowedPath: 'File path is not allowed.',
        invalidHistorySnapshotId: 'Invalid history snapshot identifier.',
        invalidHistoryFileType: 'Invalid history file type.',
        disallowedHistoryPath: 'History file path is not allowed.',
        historyFileNotFound: 'History file not found.',
        autosaveOnlyDelete: 'Only auto-saved snapshots can be deleted.',
        untrustedSender: 'Untrusted caller origin.',
        inactiveFrameSender: 'Call originated from a non-active app frame.',
        devOnlyPlanChange: 'Subscription plan can only be changed in development mode.',
        unsupportedPlan: 'Unsupported subscription plan.',
        requestIdRequired: 'requestId is required.',
        unsupportedFeatureId: 'Unsupported featureId.',
        idempotencyKeyRequired: 'idempotencyKey is required.',
        unsupportedCopilotIntent: 'Unsupported copilot intent.',
        googleOAuthBackendRequired: 'Google sign-in is available after server OAuth integration.',
        copilotMissingSelectionContext: 'Selected text context is missing.',
        copilotSchemaValidationFailed: 'Command schema validation failed.',
    },
}

export function getUiErrorCopy(locale: UiLocale, key: UiErrorKey): string {
    return UI_ERROR_COPY[locale][key]
}
