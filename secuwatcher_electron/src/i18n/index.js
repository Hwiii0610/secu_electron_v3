/**
 * Vue i18n Configuration
 *
 * Sets up internationalization with Korean (default) and English support
 */

import { createI18n } from 'vue-i18n';
import ko from './ko.js';
import en from './en.js';

/**
 * Get saved language preference from localStorage
 * Default: 'ko'
 */
function getInitialLocale() {
  try {
    const saved = localStorage.getItem('i18n_locale');
    return saved || 'ko';
  } catch (e) {
    return 'ko';
  }
}

/**
 * Save language preference to localStorage
 */
export function saveLocalePreference(locale) {
  try {
    localStorage.setItem('i18n_locale', locale);
  } catch (e) {
    console.error('Failed to save locale preference:', e);
  }
}

/**
 * Create and configure i18n instance
 */
const i18n = createI18n({
  // Use Composition API mode
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'ko',
  messages: {
    ko,
    en,
  },
});

export default i18n;
