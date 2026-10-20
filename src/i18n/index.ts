import i18next from 'i18next';
import {initReactI18next} from 'react-i18next';
import {es} from './es.ts';
import {en} from './en.ts';

export type Language = 'es' | 'en';
export const LANGUAGE_STORAGE = 'flow-lab-language';

function initialLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

export const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({
  resources: {es: {translation: es}, en: {translation: en}},
  lng: initialLanguage(),
  fallbackLng: 'es',
  supportedLngs: ['es', 'en'],
  initImmediate: false,
  interpolation: {escapeValue: false},
});
