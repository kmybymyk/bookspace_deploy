import { useDesignStore } from './useDesignStore'
import { FONT_PRESETS } from './fontCatalog'
import { useChapterStore } from '../chapters/useChapterStore'
import { LayoutSection, TypographyPreset } from '../../types/project'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { chapterTypeToLayoutSection } from './useDesignStore'
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronRight } from 'lucide-react'

type SliderProps = {
    label: string
    value: number
    min: number
    max: number
    step: number
    unit?: string
    onChange: (val: number) => void
}

type FontOption = {
    value: string
    label: string
}

function Slider({ label, value, min, max, step, unit = '', onChange }: SliderProps) {
    const displayValue = unit === 'x' ? value.toFixed(2) : value
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--ds-text-neutral-muted)]">{label}</span>
                <span className="font-mono text-xs text-[var(--ds-text-neutral-secondary)]">
                    {displayValue}
                    {unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--ds-fill-neutral-control-hover)] accent-[var(--ds-brand-500)]"
            />
        </div>
    )
}

function FontCombobox({
    value,
    options,
    placeholder,
    noResultText,
    onChange,
}: {
    value: string
    options: FontOption[]
    placeholder: string
    noResultText: string
    onChange: (next: string) => void
}) {
    const closeTimerRef = useRef<number | null>(null)
    const selectedLabel = useMemo(
        () => options.find((option) => option.value === value)?.label ?? value,
        [options, value],
    )
    const [query, setQuery] = useState(selectedLabel)
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        setQuery(selectedLabel)
    }, [selectedLabel])

    useEffect(() => {
        return () => {
            if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current)
            }
        }
    }, [])

    const resolveAndCommit = (rawValue: string) => {
        const normalized = rawValue.trim().toLowerCase()
        if (!normalized) {
            setQuery(selectedLabel)
            return
        }

        const exact = options.find(
            (option) =>
                option.label.toLowerCase() === normalized || option.value.toLowerCase() === normalized,
        )
        if (exact) {
            onChange(exact.value)
            setQuery(exact.label)
            return
        }

        setQuery(selectedLabel)
    }

    const filteredOptions = useMemo(() => {
        const normalized = query.trim().toLowerCase()
        if (!normalized || normalized === selectedLabel.trim().toLowerCase()) return options
        return options.filter((option) => option.label.toLowerCase().includes(normalized))
    }, [options, query, selectedLabel])

    const scheduleClose = () => {
        closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 120)
    }

    const cancelClose = () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current)
            closeTimerRef.current = null
        }
    }

    return (
        <div className="relative">
            <input
                type="text"
                value={query}
                placeholder={placeholder}
                onClick={() => {
                    cancelClose()
                    setIsOpen(true)
                }}
                onChange={(event) => {
                    const next = event.target.value
                    setQuery(next)
                    const exact = options.find((option) => option.label === next)
                    if (exact) {
                        onChange(exact.value)
                    }
                }}
                onFocus={() => {
                    cancelClose()
                    setIsOpen(true)
                }}
                onBlur={() => {
                    resolveAndCommit(query)
                    scheduleClose()
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault()
                        resolveAndCommit(query)
                        setIsOpen(false)
                    }
                    if (event.key === 'Escape') {
                        event.preventDefault()
                        setQuery(selectedLabel)
                        setIsOpen(false)
                    }
                }}
                className="w-full rounded-xl border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] px-3 py-2 pr-8 text-xs text-[var(--ds-text-neutral-secondary)] outline-none transition focus:border-[var(--ds-border-brand-weak)] focus:bg-[var(--ds-fill-neutral-control-hover)]"
            />
            <button
                type="button"
                onMouseDown={(event) => {
                    event.preventDefault()
                    cancelClose()
                    setIsOpen((prev) => !prev)
                }}
                className="absolute right-1 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-lg p-1 text-[var(--ds-text-neutral-muted)] hover:bg-[var(--ds-fill-neutral-control-hover)]"
                aria-label={placeholder}
                title={placeholder}
            >
                <ChevronDown size={14} className={isOpen ? 'rotate-180' : ''} />
            </button>
            {isOpen ? (
                <div
                    className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-card)] p-1.5 shadow-lg"
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                >
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onMouseDown={(event) => {
                                    event.preventDefault()
                                    onChange(option.value)
                                    setQuery(option.label)
                                    setIsOpen(false)
                                }}
                                className={`block w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                                    option.value === value
                                        ? 'bg-[var(--ds-button-primary-bg)] text-[var(--ds-text-neutral-inverse)]'
                                        : 'text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control-hover)]'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))
                    ) : (
                        <div className="px-2 py-1.5 text-xs text-[var(--ds-text-neutral-muted)]">
                            {noResultText}
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}

function CollapsibleSection({
    title,
    open,
    onToggle,
    children,
}: {
    title: string
    open: boolean
    onToggle: () => void
    children: ReactNode
}) {
    return (
        <section className="rounded-2xl border border-[var(--ds-border-neutral-subtle)] bg-[linear-gradient(180deg,rgba(29,33,41,0.94),rgba(18,21,27,0.98))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-2 text-left"
            >
                <span className="text-sm font-semibold text-[var(--ds-text-neutral-secondary)]">{title}</span>
                <span className="rounded-full border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] p-1 text-[var(--ds-text-neutral-muted)]">
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
            </button>
            {open ? <div className="mt-3 flex flex-col gap-4">{children}</div> : null}
        </section>
    )
}

export default function DesignPanel() {
    const { t } = useTranslation()
    const { settings, updateSetting, updateSectionTypography } = useDesignStore()
    const activeChapterId = useChapterStore((state) => state.activeChapterId)
    const activeChapter = useChapterStore((state) =>
        state.activeChapterId ? state.chapters.find((c) => c.id === state.activeChapterId) : undefined,
    )
    const setChapterPageBackground = useChapterStore((state) => state.setChapterPageBackground)
    const effectivePageBackground = activeChapter?.pageBackgroundColor ?? '#ffffff'
    const [activeSection, setActiveSection] = useState<LayoutSection>(() =>
        chapterTypeToLayoutSection(activeChapter?.chapterType),
    )
    const [showAdvancedSlots, setShowAdvancedSlots] = useState(false)
    const [openSections, setOpenSections] = useState({
        page: false,
        typography: true,
    })

    const currentPageSection = useMemo(
        () => chapterTypeToLayoutSection(activeChapter?.chapterType),
        [activeChapter?.chapterType],
    )
    useEffect(() => {
        setActiveSection(currentPageSection)
    }, [activeChapterId, currentPageSection])

    const BACKGROUND_PALETTE = useMemo(
        () => [
            { label: t('designPanel.bg.white'), value: '#ffffff' },
            { label: t('designPanel.bg.ivory'), value: '#f8f6ef' },
            { label: t('designPanel.bg.warmGray'), value: '#f3f0e8' },
            { label: t('designPanel.bg.paleYellow'), value: '#fff9e8' },
            { label: t('designPanel.bg.mintPaper'), value: '#f1f8f3' },
            { label: t('designPanel.bg.mistBlue'), value: '#eef4fb' },
        ],
        [t],
    )

    const STYLE_SLOTS: Array<{
        id: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
        label: string
        fontKey: keyof TypographyPreset
        sizeKey: keyof TypographyPreset
    }> = useMemo(
        () => [
            { id: 'h1', label: t('designPanel.slot.h1'), fontKey: 'h1FontFamily', sizeKey: 'h1FontSize' },
            { id: 'h2', label: t('designPanel.slot.h2'), fontKey: 'h2FontFamily', sizeKey: 'h2FontSize' },
            { id: 'h3', label: t('designPanel.slot.h3'), fontKey: 'h3FontFamily', sizeKey: 'h3FontSize' },
            { id: 'h4', label: t('designPanel.slot.h4'), fontKey: 'h4FontFamily', sizeKey: 'h4FontSize' },
            { id: 'h5', label: t('designPanel.slot.h5'), fontKey: 'h5FontFamily', sizeKey: 'h5FontSize' },
            { id: 'h6', label: t('designPanel.slot.h6'), fontKey: 'h6FontFamily', sizeKey: 'h6FontSize' },
        ],
        [t],
    )

    const fontOptions = useMemo<FontOption[]>(() => {
        const options = FONT_PRESETS.map((font) => ({ value: font.fontFamily, label: font.label }))
        return options.sort((a, b) => a.label.localeCompare(b.label, 'ko'))
    }, [])

    const effectiveSection = activeSection
    const activeTypography = settings.sectionTypography[effectiveSection]
    const bodySizePx = Math.max(1, Number(activeTypography.h3FontSize) || 1)
    const toggleSection = (key: keyof typeof openSections) =>
        setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

    const applyTypographyPatch = (patch: Partial<TypographyPreset>) => {
        updateSectionTypography(effectiveSection, patch)
    }

    const renderSlotCard = (slot: (typeof STYLE_SLOTS)[number]) => {
        const hasKnownFont = FONT_PRESETS.some((font) => font.fontFamily === activeTypography[slot.fontKey])
        const slotFontOptions = hasKnownFont
            ? fontOptions
            : [
                {
                    value: activeTypography[slot.fontKey] as string,
                    label: `${t('designPanel.fontGroup.legacy')} (${activeTypography[slot.fontKey] as string})`,
                },
                ...fontOptions,
            ]

        return (
            <div key={slot.label} className="flex flex-col gap-3 rounded-2xl border border-[var(--ds-border-neutral-default)] bg-[linear-gradient(180deg,rgba(22,25,32,0.9),rgba(14,17,22,0.96))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[var(--ds-text-neutral-secondary)]">{slot.label}</span>
                    {slot.id === 'h4' || slot.id === 'h5' || slot.id === 'h6' ? (
                        <span className="rounded-full border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] px-2 py-0.5 text-[10px] text-[var(--ds-text-neutral-muted)]">{t('designPanel.advancedSlot')}</span>
                    ) : null}
                </div>

                <FontCombobox
                    value={activeTypography[slot.fontKey] as string}
                    options={slotFontOptions}
                    placeholder={t('designPanel.fontSearchPlaceholder')}
                    noResultText={t('designPanel.noFontSearchResult')}
                    onChange={(nextFont) => applyTypographyPatch({ [slot.fontKey]: nextFont } as Partial<TypographyPreset>)}
                />

                {slot.sizeKey === 'h3FontSize' ? (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--ds-text-neutral-muted)]">{t('designPanel.size')}</span>
                        <span className="font-mono text-[var(--ds-text-neutral-secondary)]">{t('designPanel.bodyFixedScale')}</span>
                    </div>
                ) : (
                    <Slider
                        label={t('designPanel.size')}
                        value={Math.max(0.6, Math.min(3, Number(activeTypography[slot.sizeKey]) / bodySizePx))}
                        min={0.6}
                        max={3}
                        step={0.05}
                        unit="x"
                        onChange={(v) =>
                            applyTypographyPatch({
                                [slot.sizeKey]: Math.round(bodySizePx * v * 100) / 100,
                            } as Partial<TypographyPreset>)
                        }
                    />
                )}

                {slot.id === 'h1' && (
                    <>
                        <div className="flex flex-col gap-2">
                            <span className="text-xs text-[var(--ds-text-neutral-muted)]">{t('designPanel.align')}</span>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    ['left', t('designPanel.alignLeft')],
                                    ['center', t('designPanel.alignCenter')],
                                    ['right', t('designPanel.alignRight')],
                                ] as const).map(([align, label]) => (
                                    <button
                                        key={align}
                                        onClick={() => updateSetting('chapterTitleAlign', align)}
                                        title={label}
                                        aria-label={label}
                                        className={`inline-flex items-center justify-center rounded-xl py-2 text-xs leading-none transition-colors ${settings.chapterTitleAlign === align
                                                ? 'bg-[var(--ds-button-primary-bg)] text-[var(--ds-text-neutral-inverse)]'
                                                : 'bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-muted)] hover:bg-[var(--ds-fill-neutral-control-hover)]'
                                            }`}
                                    >
                                        <span className="inline-flex h-4 w-4 items-center justify-center">
                                            {align === 'left' ? <AlignLeft size={14} className="block" /> : null}
                                            {align === 'center' ? <AlignCenter size={14} className="block" /> : null}
                                            {align === 'right' ? <AlignRight size={14} className="block" /> : null}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <Slider
                            label={t('designPanel.titleSpacing')}
                            value={settings.chapterTitleSpacing}
                            min={0.8}
                            max={3}
                            step={0.1}
                            unit="em"
                            onChange={(v) => updateSetting('chapterTitleSpacing', v)}
                        />
                        <label className="flex items-center justify-between gap-3 text-xs text-[var(--ds-text-neutral-secondary)]">
                            <span className="text-[var(--ds-text-neutral-muted)]">{t('designPanel.titleDivider')}</span>
                            <input
                                type="checkbox"
                                checked={settings.chapterTitleDivider}
                                onChange={(e) => updateSetting('chapterTitleDivider', e.target.checked)}
                                className="accent-brand-500"
                            />
                        </label>
                    </>
                )}

                {slot.id === 'h3' && (
                    <>
                        <Slider
                            label={t('designPanel.indent')}
                            value={settings.textIndent}
                            min={0}
                            max={3}
                            step={0.5}
                            unit="em"
                            onChange={(v) => updateSetting('textIndent', v)}
                        />
                        <label className="flex items-center justify-between gap-3 text-xs text-[var(--ds-text-neutral-secondary)]">
                            <span className="text-[var(--ds-text-neutral-muted)]">{t('designPanel.skipFirstIndent')}</span>
                            <input
                                type="checkbox"
                                checked={settings.suppressFirstParagraphIndent}
                                onChange={(e) => updateSetting('suppressFirstParagraphIndent', e.target.checked)}
                                className="accent-brand-500"
                            />
                        </label>
                    </>
                )}
            </div>
        )
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.05),transparent_28%),linear-gradient(180deg,rgba(11,14,18,0.95),rgba(9,11,15,0.98))] p-4 [scrollbar-gutter:stable]">
            <CollapsibleSection
                title={t('designPanel.pageBackground')}
                open={openSections.page}
                onToggle={() => toggleSection('page')}
            >
                <div className="flex flex-col gap-2">
                    <span className="text-[11px] text-[var(--ds-text-neutral-muted)]">
                        {t('designPanel.pageBackgroundScopeHint')}
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                        {BACKGROUND_PALETTE.map((color) => {
                            const active = effectivePageBackground.toLowerCase() === color.value
                            return (
                                <button
                                    key={`chapter-${color.value}`}
                                    onClick={() => {
                                        if (!activeChapterId) return
                                        setChapterPageBackground(activeChapterId, color.value)
                                    }}
                                    disabled={!activeChapterId}
                                    className={`h-10 rounded-xl border text-xs font-medium transition ${active
                                            ? 'border-[var(--ds-border-brand-weak)] text-neutral-900 opacity-100 shadow-[0_0_0_1px_rgba(20,184,166,0.18)]'
                                            : 'border-[var(--ds-border-neutral-default)] text-neutral-900 opacity-65 hover:opacity-80'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    style={{ backgroundColor: color.value }}
                                    title={color.label}
                                >
                                    {color.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </CollapsibleSection>

            <CollapsibleSection
                title={t('designPanel.sectionTypography')}
                open={openSections.typography}
                onToggle={() => toggleSection('typography')}
            >
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex w-full items-stretch gap-2">
                            {([
                                ['front', t('designPanel.section.front')],
                                ['body', t('designPanel.section.body')],
                                ['back', t('designPanel.section.back')],
                            ] as const).map(([section, label]) => {
                                const hasCurrentBadge = currentPageSection === section
                                const flexWeight = 1 + label.length * 0.06 + (hasCurrentBadge ? 0.35 : 0)
                                return (
                                    <button
                                        key={section}
                                        onClick={() => setActiveSection(section)}
                                        style={{ flexBasis: 0, flexGrow: flexWeight }}
                                        className={`inline-flex min-w-0 items-center justify-center gap-1 rounded-xl px-2.5 py-2.5 text-xs font-medium transition whitespace-nowrap ${effectiveSection === section
                                                ? 'bg-[var(--ds-button-primary-bg)] text-[var(--ds-text-neutral-inverse)]'
                                                : 'bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-muted)] hover:bg-[var(--ds-fill-neutral-control-hover)]'
                                            }`}
                                    >
                                        <span>{label}</span>
                                        {hasCurrentBadge ? (
                                            <span
                                                className={`shrink-0 rounded px-1 py-0.5 text-[10px] leading-none ${effectiveSection === section
                                                        ? 'bg-black/20 text-[var(--ds-text-neutral-inverse)]'
                                                        : 'bg-[var(--ds-fill-neutral-card)] text-[var(--ds-text-neutral-muted)]'
                                                    }`}
                                            >
                                                {t('designPanel.currentBadge')}
                                            </span>
                                        ) : null}
                                    </button>
                                )
                            })}
                        </div>
                        <p className="text-[11px] text-[var(--ds-text-neutral-muted)]">
                            {t('designPanel.sectionScopeHint', {
                                section: t(`designPanel.section.${effectiveSection}`),
                            })}
                        </p>
                    </div>
                    <div className="rounded-xl border border-[var(--ds-border-neutral-subtle)] bg-[var(--ds-fill-neutral-control)] px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-text-neutral-muted)]">
                            {t('designPanel.coreSettingsLabel')}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">{STYLE_SLOTS.slice(0, 3).map(renderSlotCard)}</div>

                    <button
                        type="button"
                        onClick={() => setShowAdvancedSlots((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 self-start rounded-xl border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] px-3 py-2 text-xs text-[var(--ds-text-neutral-muted)] transition hover:bg-[var(--ds-fill-neutral-control-hover)]"
                    >
                        {showAdvancedSlots ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {showAdvancedSlots
                            ? t('designPanel.hideAdvancedSlots')
                            : t('designPanel.showAdvancedSlots')}
                    </button>

                    {showAdvancedSlots ? (
                        <div className="flex flex-col gap-3">
                            <div className="rounded-xl border border-[var(--ds-border-neutral-subtle)] bg-[var(--ds-fill-neutral-control)] px-3 py-2">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-text-neutral-muted)]">
                                    {t('designPanel.advancedSettingsLabel')}
                                </div>
                            </div>
                            <div className="flex flex-col gap-3">{STYLE_SLOTS.slice(3).map(renderSlotCard)}</div>
                        </div>
                    ) : null}
                </div>
            </CollapsibleSection>
        </div>
    )
}
