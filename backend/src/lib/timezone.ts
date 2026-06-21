// Работа с часовыми поясами без внешних зависимостей — на встроенном Intl
// (Node 18+ в рантайме Yandex Cloud Functions поставляется с полным ICU).
//
// Соглашение проекта: в БД все DATETIME хранятся в UTC. Здесь — только перевод
// «стенных» часов конкретной зоны в абсолютный момент времени (UTC) и обратно.

// Смещение зоны (в минутах) для конкретного момента времени.
// Положительное — восточнее UTC (например, Europe/Moscow → +180).
export function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Время «как его видят» в зоне tz, интерпретированное как UTC.
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

// Стенные часы (год/месяц/день/час/минута) в зоне tz → абсолютный момент (UTC Date).
// month — 1..12.
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): Date {
  // Первое приближение: трактуем компоненты как UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  // Корректируем на смещение зоны в этот момент (учитывает летнее время).
  const offset = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - offset * 60000);
}

// Парсинг 'HH:MM' → { hour, minute }.
export function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(':').map(Number);
  return { hour: h || 0, minute: m || 0 };
}

// UTC-момент → строка 'YYYY-MM-DD HH:MM:SS' для записи в DATETIME (пул в timezone 'Z').
export function toMysqlUtc(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// День недели (0=Вс..6=Сб) для момента date в зоне tz.
export function weekdayInTz(date: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(date);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}
