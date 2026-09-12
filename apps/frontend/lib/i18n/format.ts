import type { Locale } from '../../providers/i18n-provider';

export function formatDate(value: string | Date | null | undefined, locale: Locale) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: locale === 'vi' ? 'short' : 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US').format(value);
}

export function formatPercent(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 0,
    style: 'percent',
  }).format(value / 100);
}

export function formatRelativeTime(value: string | Date, locale: Locale) {
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { numeric: 'auto' });

  if (absolute < 60) {
    return formatter.format(seconds, 'second');
  }

  if (absolute < 3600) {
    return formatter.format(Math.round(seconds / 60), 'minute');
  }

  if (absolute < 86_400) {
    return formatter.format(Math.round(seconds / 3600), 'hour');
  }

  return formatter.format(Math.round(seconds / 86_400), 'day');
}
