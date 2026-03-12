import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ko from './locales/ko.json'
import en from './locales/en.json'

function resolveSystemLanguage() {
    const forced = String(import.meta.env.VITE_UI_LANG ?? '')
        .toLowerCase()
        .trim()
    if (forced.startsWith('ko')) return 'ko'
    if (forced.startsWith('en')) return 'en'

    if (typeof navigator === 'undefined') return 'en'
    const raw = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase()
    return raw.startsWith('ko') ? 'ko' : 'en'
}

i18n.use(initReactI18next).init({
    resources: {
        ko: { translation: ko },
        en: { translation: en },
    },
    lng: resolveSystemLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
})

export default i18n
