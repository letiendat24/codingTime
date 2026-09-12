'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import adminEn from '../messages/en/admin.json';
import authEn from '../messages/en/auth.json';
import commonEn from '../messages/en/common.json';
import coursesEn from '../messages/en/courses.json';
import instructorEn from '../messages/en/instructor.json';
import learningEn from '../messages/en/learning.json';
import notificationsEn from '../messages/en/notifications.json';
import practiceEn from '../messages/en/practice.json';
import adminVi from '../messages/vi/admin.json';
import authVi from '../messages/vi/auth.json';
import commonVi from '../messages/vi/common.json';
import coursesVi from '../messages/vi/courses.json';
import instructorVi from '../messages/vi/instructor.json';
import learningVi from '../messages/vi/learning.json';
import notificationsVi from '../messages/vi/notifications.json';
import practiceVi from '../messages/vi/practice.json';

export type Locale = 'vi' | 'en';

type Namespace = 'admin' | 'auth' | 'common' | 'courses' | 'instructor' | 'learning' | 'notifications' | 'practice';
type Messages = Record<Namespace, Record<string, string>>;

interface I18nContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: string, values?: Record<string, string | number>) => string;
}

const STORAGE_KEY = 'codesync_locale';
const I18nContext = createContext<I18nContextValue | null>(null);

const messages: Record<Locale, Messages> = {
  en: {
    admin: adminEn,
    auth: authEn,
    common: commonEn,
    courses: coursesEn,
    instructor: instructorEn,
    learning: learningEn,
    notifications: notificationsEn,
    practice: practiceEn,
  },
  vi: {
    admin: adminVi,
    auth: authVi,
    common: commonVi,
    courses: coursesVi,
    instructor: instructorVi,
    learning: learningVi,
    notifications: notificationsVi,
    practice: practiceVi,
  },
};

function interpolate(template: string, values?: Record<string, string | number>) {
  if (!values) {
    return template;
  }

  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

export function I18nProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, setLocaleState] = useState<Locale>('vi');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = stored === 'en' || stored === 'vi' ? stored : 'vi';
    setLocaleState(initial);
    document.documentElement.lang = initial;
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (nextLocale) => {
      window.localStorage.setItem(STORAGE_KEY, nextLocale);
      document.documentElement.lang = nextLocale;
      setLocaleState(nextLocale);
    },
    t: (key, values) => {
      const [namespace, item] = key.split('.') as [Namespace | undefined, string | undefined];
      if (!namespace || !item) {
        return key;
      }

      return interpolate(messages[locale][namespace]?.[item] ?? key, values);
    },
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }

  return context;
}
