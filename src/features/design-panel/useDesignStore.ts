import { create } from 'zustand'
import { ChapterType, DesignSettings, LayoutSection, TypographyPreset } from '../../types/project'
import { useProjectStore } from '../../store/projectStore'
import { getFontCssStack } from './fontCatalog'

const DEFAULT_TYPOGRAPHY_PRESET: TypographyPreset = {
    h1FontFamily: 'Noto Serif KR',
    h2FontFamily: 'Noto Serif KR',
    h3FontFamily: 'Noto Serif KR',
    h4FontFamily: 'Noto Serif KR',
    h5FontFamily: 'Noto Serif KR',
    h6FontFamily: 'Noto Serif KR',
    h1FontSize: 36,
    h2FontSize: 26,
    h3FontSize: 16,
    h4FontSize: 15,
    h5FontSize: 14,
    h6FontSize: 13,
}

export const DEFAULT_SETTINGS: DesignSettings = {
    fontFamily: 'Noto Serif KR',
    fontEmbedMode: 'none',
    h1FontFamily: 'Noto Serif KR',
    h2FontFamily: 'Noto Serif KR',
    h3FontFamily: 'Noto Serif KR',
    h4FontFamily: 'Noto Serif KR',
    h5FontFamily: 'Noto Serif KR',
    h6FontFamily: 'Noto Serif KR',
    h1FontSize: 36,
    h2FontSize: 26,
    h3FontSize: 16,
    h4FontSize: 15,
    h5FontSize: 14,
    h6FontSize: 13,
    pageBackgroundColor: '#ffffff',
    fontSize: 16,
    lineHeight: 1.8,
    letterSpacing: 0,
    paragraphSpacing: 1.2,
    textIndent: 0,
    suppressFirstParagraphIndent: false,
    chapterTitleAlign: 'left',
    chapterTitleSpacing: 2,
    chapterTitleDivider: true,
    sceneBreakStyle: 'line',
    imageMaxWidth: 60,
    theme: 'novel',
    sectionTypography: {
        front: { ...DEFAULT_TYPOGRAPHY_PRESET },
        body: { ...DEFAULT_TYPOGRAPHY_PRESET },
        back: { ...DEFAULT_TYPOGRAPHY_PRESET },
    },
}

interface DesignStore {
    settings: DesignSettings
    setSettings: (settings: DesignSettings) => void
    updateSetting: <K extends keyof DesignSettings>(key: K, value: DesignSettings[K]) => void
    updateSectionTypography: (section: LayoutSection, patch: Partial<TypographyPreset>) => void
    applyTheme: (theme: 'novel' | 'essay' | 'custom') => void
    generateCSS: () => string
}

const THEME_PRESETS: Record<'novel' | 'essay', Partial<DesignSettings>> = {
    novel: {
        fontFamily: 'Noto Serif KR',
        fontEmbedMode: 'none',
        h1FontFamily: 'Noto Serif KR',
        h2FontFamily: 'Noto Serif KR',
        h3FontFamily: 'Noto Serif KR',
        h4FontFamily: 'Noto Serif KR',
        h5FontFamily: 'Noto Serif KR',
        h6FontFamily: 'Noto Serif KR',
        h1FontSize: 36,
        h2FontSize: 26,
        h3FontSize: 16,
        h4FontSize: 15,
        h5FontSize: 14,
        h6FontSize: 13,
        pageBackgroundColor: '#ffffff',
        fontSize: 16,
        lineHeight: 1.8,
        letterSpacing: 0,
        textIndent: 1,
        paragraphSpacing: 0.5,
        suppressFirstParagraphIndent: false,
        chapterTitleAlign: 'left',
        chapterTitleSpacing: 2.2,
        chapterTitleDivider: true,
        sceneBreakStyle: 'star',
        imageMaxWidth: 60,
        sectionTypography: {
            front: { ...DEFAULT_TYPOGRAPHY_PRESET },
            body: { ...DEFAULT_TYPOGRAPHY_PRESET },
            back: { ...DEFAULT_TYPOGRAPHY_PRESET },
        },
    },
    essay: {
        fontFamily: 'Noto Sans KR',
        fontEmbedMode: 'none',
        h1FontFamily: 'Noto Sans KR',
        h2FontFamily: 'Noto Sans KR',
        h3FontFamily: 'Noto Sans KR',
        h4FontFamily: 'Noto Sans KR',
        h5FontFamily: 'Noto Sans KR',
        h6FontFamily: 'Noto Sans KR',
        h1FontSize: 34,
        h2FontSize: 24,
        h3FontSize: 15,
        h4FontSize: 14,
        h5FontSize: 13,
        h6FontSize: 12,
        pageBackgroundColor: '#f8f6ef',
        fontSize: 15,
        lineHeight: 2.0,
        letterSpacing: 0.02,
        textIndent: 0,
        paragraphSpacing: 1.5,
        suppressFirstParagraphIndent: false,
        chapterTitleAlign: 'left',
        chapterTitleSpacing: 1.4,
        chapterTitleDivider: true,
        sceneBreakStyle: 'line',
        imageMaxWidth: 72,
        sectionTypography: {
            front: {
                ...DEFAULT_TYPOGRAPHY_PRESET,
                h1FontFamily: 'Noto Sans KR',
                h2FontFamily: 'Noto Sans KR',
                h3FontFamily: 'Noto Sans KR',
                h4FontFamily: 'Noto Sans KR',
                h5FontFamily: 'Noto Sans KR',
                h6FontFamily: 'Noto Sans KR',
                h1FontSize: 34,
                h2FontSize: 24,
                h3FontSize: 15,
                h4FontSize: 14,
                h5FontSize: 13,
                h6FontSize: 12,
            },
            body: {
                ...DEFAULT_TYPOGRAPHY_PRESET,
                h1FontFamily: 'Noto Sans KR',
                h2FontFamily: 'Noto Sans KR',
                h3FontFamily: 'Noto Sans KR',
                h4FontFamily: 'Noto Sans KR',
                h5FontFamily: 'Noto Sans KR',
                h6FontFamily: 'Noto Sans KR',
                h1FontSize: 34,
                h2FontSize: 24,
                h3FontSize: 15,
                h4FontSize: 14,
                h5FontSize: 13,
                h6FontSize: 12,
            },
            back: {
                ...DEFAULT_TYPOGRAPHY_PRESET,
                h1FontFamily: 'Noto Sans KR',
                h2FontFamily: 'Noto Sans KR',
                h3FontFamily: 'Noto Sans KR',
                h4FontFamily: 'Noto Sans KR',
                h5FontFamily: 'Noto Sans KR',
                h6FontFamily: 'Noto Sans KR',
                h1FontSize: 34,
                h2FontSize: 24,
                h3FontSize: 15,
                h4FontSize: 14,
                h5FontSize: 13,
                h6FontSize: 12,
            },
        },
    },
}

function normalizeSectionTypography(
    settings: Partial<DesignSettings>,
): Record<LayoutSection, TypographyPreset> {
    const sectionTypography = settings.sectionTypography
    const fallbackFromLegacy = {
        h1FontFamily: settings.h1FontFamily ?? DEFAULT_TYPOGRAPHY_PRESET.h1FontFamily,
        h2FontFamily: settings.h2FontFamily ?? DEFAULT_TYPOGRAPHY_PRESET.h2FontFamily,
        h3FontFamily: settings.h3FontFamily ?? DEFAULT_TYPOGRAPHY_PRESET.h3FontFamily,
        h4FontFamily: settings.h4FontFamily ?? DEFAULT_TYPOGRAPHY_PRESET.h4FontFamily,
        h5FontFamily: settings.h5FontFamily ?? DEFAULT_TYPOGRAPHY_PRESET.h5FontFamily,
        h6FontFamily: settings.h6FontFamily ?? DEFAULT_TYPOGRAPHY_PRESET.h6FontFamily,
        h1FontSize: settings.h1FontSize ?? DEFAULT_TYPOGRAPHY_PRESET.h1FontSize,
        h2FontSize: settings.h2FontSize ?? DEFAULT_TYPOGRAPHY_PRESET.h2FontSize,
        h3FontSize: settings.h3FontSize ?? DEFAULT_TYPOGRAPHY_PRESET.h3FontSize,
        h4FontSize: settings.h4FontSize ?? DEFAULT_TYPOGRAPHY_PRESET.h4FontSize,
        h5FontSize: settings.h5FontSize ?? DEFAULT_TYPOGRAPHY_PRESET.h5FontSize,
        h6FontSize: settings.h6FontSize ?? DEFAULT_TYPOGRAPHY_PRESET.h6FontSize,
    }
    const fill = (value?: Partial<TypographyPreset>) => ({
        ...DEFAULT_TYPOGRAPHY_PRESET,
        ...fallbackFromLegacy,
        ...(value ?? {}),
    })
    return {
        front: fill(sectionTypography?.front),
        body: fill(sectionTypography?.body),
        back: fill(sectionTypography?.back),
    }
}

function buildLegacyTypographyMirror(
    section: LayoutSection,
    current: DesignSettings,
    patch: Partial<TypographyPreset>,
): Partial<DesignSettings> {
    if (section !== 'body') return {}

    const nextBody = {
        ...current.sectionTypography.body,
        ...patch,
    }

    return {
        fontFamily: nextBody.h3FontFamily,
        h1FontFamily: nextBody.h1FontFamily,
        h2FontFamily: nextBody.h2FontFamily,
        h3FontFamily: nextBody.h3FontFamily,
        h4FontFamily: nextBody.h4FontFamily,
        h5FontFamily: nextBody.h5FontFamily,
        h6FontFamily: nextBody.h6FontFamily,
        fontSize: nextBody.h3FontSize,
        h1FontSize: nextBody.h1FontSize,
        h2FontSize: nextBody.h2FontSize,
        h3FontSize: nextBody.h3FontSize,
        h4FontSize: nextBody.h4FontSize,
        h5FontSize: nextBody.h5FontSize,
        h6FontSize: nextBody.h6FontSize,
    }
}

export function chapterTypeToLayoutSection(chapterType?: ChapterType): LayoutSection {
    if (chapterType === 'front') return 'front'
    if (chapterType === 'back') return 'back'
    return 'body'
}

export const useDesignStore = create<DesignStore>((set, get) => ({
    settings: DEFAULT_SETTINGS,
    setSettings: (settings) =>
        set({
            settings: {
                ...DEFAULT_SETTINGS,
                ...settings,
                sectionTypography: normalizeSectionTypography(settings),
            },
        }),

    updateSetting: (key, value) =>
        set((state) => ({ settings: { ...state.settings, [key]: value } })),

    updateSectionTypography: (section, patch) =>
        set((state) => ({
            settings: {
                ...state.settings,
                ...buildLegacyTypographyMirror(section, state.settings, patch),
                sectionTypography: {
                    ...state.settings.sectionTypography,
                    [section]: { ...state.settings.sectionTypography[section], ...patch },
                },
            },
        })),

    applyTheme: (theme) => {
        if (theme === 'custom') {
            set((state) => ({ settings: { ...state.settings, theme: 'custom' } }))
            return
        }
        set((state) => ({
            settings: { ...state.settings, ...THEME_PRESETS[theme], theme },
        }))
    },

    generateCSS: () => {
        const s = get().settings
        const base = s.sectionTypography.body
        const h1Stack = getFontCssStack(base.h1FontFamily)
        const h2Stack = getFontCssStack(base.h2FontFamily)
        const h3Stack = getFontCssStack(base.h3FontFamily)
        const h4Stack = getFontCssStack(base.h4FontFamily)
        const h5Stack = getFontCssStack(base.h5FontFamily)
        const h6Stack = getFontCssStack(base.h6FontFamily)
        return `
      body {
        font-family: ${h3Stack};
        background-color: ${s.pageBackgroundColor};
        font-size: ${base.h3FontSize}px;
        line-height: ${s.lineHeight};
        letter-spacing: ${s.letterSpacing}em;
      }
      h1 {
        font-family: ${h1Stack};
        font-size: ${base.h1FontSize}px;
        ${s.chapterTitleDivider ? 'border-bottom: 1px solid #e5e7eb; padding-bottom: 0.45em;' : 'border-bottom: 0; padding-bottom: 0;'}
      }
      h2 { font-family: ${h2Stack}; font-size: ${base.h2FontSize}px; }
      h3 { font-family: ${h3Stack}; font-size: ${base.h3FontSize}px; }
      h4 { font-family: ${h4Stack}; font-size: ${base.h4FontSize}px; }
      h5 { font-family: ${h5Stack}; font-size: ${base.h5FontSize}px; }
      h6 { font-family: ${h6Stack}; font-size: ${base.h6FontSize}px; }
      p {
        margin-bottom: ${s.paragraphSpacing}em;
        text-indent: ${s.textIndent}em;
      }
      ${s.suppressFirstParagraphIndent ? `
      p:first-of-type {
        text-indent: 0;
      }` : ''}
    `.trim()
    },
}))

useDesignStore.subscribe((state, prev) => {
    if (state.settings !== prev.settings) {
        useProjectStore.getState().setDirty(true)
    }
})
