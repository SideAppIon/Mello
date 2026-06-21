import { fromZonedTime, toZonedTime, format } from 'date-fns-tz';

// Часовой пояс браузера по умолчанию.
export const browserTz = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Список всех IANA-зон (с фолбэком для старых браузеров).
export function allTimezones(): string[] {
  const anyIntl = Intl as any;
  if (typeof anyIntl.supportedValuesOf === 'function') {
    try { return anyIntl.supportedValuesOf('timeZone'); } catch { /* noop */ }
  }
  return ['UTC', 'Europe/Moscow', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Dubai', 'Asia/Yekaterinburg', 'Asia/Novosibirsk'];
}

// UTC ISO → отформатированная строка в заданной зоне.
export function fmtInTz(utcIso: string, tz: string, pattern = 'HH:mm'): string {
  return format(toZonedTime(new Date(utcIso), tz), pattern, { timeZone: tz });
}

// Локальные дата+время в зоне tz → UTC ISO-строка для отправки на бэкенд.
// dateStr: 'YYYY-MM-DD', timeStr: 'HH:MM'.
export function localToUtcIso(dateStr: string, timeStr: string, tz: string): string {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, tz).toISOString();
}

// UTC ISO → { date: 'YYYY-MM-DD', time: 'HH:MM' } в зоне tz (для предзаполнения форм).
export function utcIsoToLocalParts(utcIso: string, tz: string): { date: string; time: string } {
  const z = toZonedTime(new Date(utcIso), tz);
  return {
    date: format(z, 'yyyy-MM-dd', { timeZone: tz }),
    time: format(z, 'HH:mm', { timeZone: tz }),
  };
}

// Короткое смещение зоны, например 'GMT+3'.
export function tzShortOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch {
    return tz;
  }
}
