export function resolveUiDateLocale(language: string | undefined) {
    const normalized = String(language ?? '')
        .toLowerCase()
        .trim()
    if (normalized.startsWith('ko')) return 'ko-KR'
    return 'en-US'
}

export type DateTimeDisplayPreset = 'default' | 'historyLoadedAt' | 'historyCard' | 'homeResume'

function formatWithIntl(
    value: string,
    language: string | undefined,
    options: Intl.DateTimeFormatOptions,
) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const locale = resolveUiDateLocale(language)
    return date.toLocaleString(locale, options)
}

function pad2(value: number) {
    return String(value).padStart(2, '0')
}

export function formatDateTimeForUi(
    value: string,
    language: string | undefined,
    preset: DateTimeDisplayPreset = 'default',
) {
    const locale = resolveUiDateLocale(language)
    const normalized = String(language ?? '')
        .toLowerCase()
        .trim()
    const isKorean = normalized.startsWith('ko')
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    if (preset === 'historyLoadedAt') {
        const yy = pad2(date.getFullYear() % 100)
        const mm = pad2(date.getMonth() + 1)
        const dd = pad2(date.getDate())
        const hour24 = date.getHours()
        const minute = pad2(date.getMinutes())
        const ampm = hour24 < 12 ? 'AM' : 'PM'
        const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
        const hh = String(hour12).padStart(2, '0')
        return isKorean ? `${yy}.${mm}.${dd} ${hh}:${minute}` : `${mm}/${dd}/${yy} ${ampm} ${hh}:${minute}`
    }

    if (preset === 'historyCard') {
        const yy = String(date.getFullYear())
        const mm = pad2(date.getMonth() + 1)
        const dd = pad2(date.getDate())
        const hour24 = date.getHours()
        const minute = pad2(date.getMinutes())
        const ampm = hour24 < 12 ? 'AM' : 'PM'
        const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
        const hh = String(hour12).padStart(2, '0')
        return isKorean ? `${yy}년. ${mm}월. ${dd}일 ${ampm} ${hh}:${minute}` : `${mm}/${dd}/${yy} ${ampm} ${hh}:${minute}`
    }

    if (preset === 'homeResume') {
        const yy = String(date.getFullYear())
        const mm = pad2(date.getMonth() + 1)
        const dd = pad2(date.getDate())
        const hour24 = date.getHours()
        const minute = pad2(date.getMinutes())
        const ampm = hour24 < 12 ? 'AM' : 'PM'
        const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
        const hh = String(hour12).padStart(2, '0')
        if (isKorean) return `${yy}. ${mm}. ${dd} ${ampm} ${hh}시 ${minute}분`
        return formatWithIntl(value, locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        })
    }

    return formatWithIntl(value, locale, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: locale === 'en-US',
    })
}
