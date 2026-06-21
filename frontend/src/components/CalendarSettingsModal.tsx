import { useEffect, useState } from 'react';
import Modal from './Modal';
import { calendarApi } from '../api/client';
import { CalendarSettings, AwayPeriod, WEEKDAY_LABELS } from '../types';
import { allTimezones, localToUtcIso, utcIsoToLocalParts, fmtInTz, browserTz } from '../lib/tz';

interface Props {
  settings: CalendarSettings;
  onClose: () => void;
  onSaved: (s: CalendarSettings) => void;
}

export default function CalendarSettingsModal({ settings, onClose, onSaved }: Props) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const [workDays, setWorkDays] = useState<number[]>(settings.work_days);
  const [workStart, setWorkStart] = useState(settings.work_start);
  const [workEnd, setWorkEnd] = useState(settings.work_end);
  const [slotMinutes, setSlotMinutes] = useState(settings.slot_minutes);
  const [bookingEnabled, setBookingEnabled] = useState(settings.booking_enabled);
  const [slug, setSlug] = useState(settings.booking_slug || '');
  const [defaultUrl, setDefaultUrl] = useState(settings.default_meeting_url || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [away, setAway] = useState<AwayPeriod[]>([]);
  const [awayStartDate, setAwayStartDate] = useState('');
  const [awayEndDate, setAwayEndDate] = useState('');
  const [awayReason, setAwayReason] = useState('');

  useEffect(() => { calendarApi.listAway().then(setAway).catch(() => {}); }, []);

  const bookingUrl = slug ? `${window.location.origin}/Mello/book/${slug}` : '';

  const toggleDay = (d: number) =>
    setWorkDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const updated = await calendarApi.updateSettings({
        timezone,
        work_days: workDays,
        work_start: workStart,
        work_end: workEnd,
        slot_minutes: slotMinutes,
        booking_enabled: bookingEnabled,
        ...(slug ? { booking_slug: slug } : {}),
        default_meeting_url: defaultUrl,
      });
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const addAway = async () => {
    if (!awayStartDate || !awayEndDate) return;
    try {
      // Период «нет на месте» считаем от начала первого дня до конца последнего в поясе пользователя.
      const starts_at = localToUtcIso(awayStartDate, '00:00', timezone);
      const ends_at = localToUtcIso(awayEndDate, '23:59', timezone);
      const row = await calendarApi.addAway({ starts_at, ends_at, reason: awayReason || null });
      setAway((prev) => [...prev, row].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setAwayStartDate(''); setAwayEndDate(''); setAwayReason('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка');
    }
  };

  const removeAway = async (id: string) => {
    await calendarApi.deleteAway(id);
    setAway((prev) => prev.filter((a) => a.id !== id));
  };

  const copyLink = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal onClose={onClose} title="Настройки календаря" size="md">
      <form onSubmit={save} className="p-6 space-y-5">
        {/* Часовой пояс */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Часовой пояс</label>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30">
            {allTimezones().map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
          {timezone !== browserTz() && (
            <p className="text-xs text-gray-400 mt-1">Пояс браузера: {browserTz()}</p>
          )}
        </div>

        {/* Рабочие дни */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Рабочие дни</label>
          <div className="flex gap-1.5">
            {WEEKDAY_LABELS.map((label, d) => (
              <button type="button" key={d} onClick={() => toggleDay(d)}
                className={`w-10 h-10 rounded-lg text-sm font-medium border transition-colors ${workDays.includes(d) ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Рабочее время + длительность слота */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Начало</label>
            <input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Конец</label>
            <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Слот, мин</label>
            <input type="number" min={5} max={480} step={5} value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
        </div>

        {/* Бронирование */}
        <div className="border-t border-gray-100 pt-4">
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input type="checkbox" checked={bookingEnabled} onChange={(e) => setBookingEnabled(e.target.checked)} className="w-4 h-4 accent-brand-500" />
            <span className="text-sm font-medium text-gray-700">Публичная ссылка для бронирования</span>
          </label>
          {bookingEnabled && (
            <div className="space-y-2 pl-6">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 whitespace-nowrap">/book/</span>
                <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="ваше-имя"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 font-mono" />
              </div>
              {bookingUrl && (
                <div className="flex items-center gap-2">
                  <input readOnly value={bookingUrl} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500" />
                  <button type="button" onClick={copyLink} className="px-3 py-2 text-xs bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 whitespace-nowrap">
                    {copied ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ссылка по умолчанию */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ссылка на встречу по умолчанию</label>
          <input value={defaultUrl} onChange={(e) => setDefaultUrl(e.target.value)} placeholder="https://meet... (для гостевых броней)"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        </div>

        {/* Нет на месте */}
        <div className="border-t border-gray-100 pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Нет на месте</label>
          {away.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {away.map((a) => (
                <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-600">
                    {fmtInTz(a.starts_at, timezone, 'd MMM')} — {fmtInTz(a.ends_at, timezone, 'd MMM')}
                    {a.reason ? ` · ${a.reason}` : ''}
                  </span>
                  <button type="button" onClick={() => removeAway(a.id)} className="text-red-400 hover:text-red-600 text-xs">Удалить</button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input type="date" value={awayStartDate} onChange={(e) => setAwayStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            <input type="date" value={awayEndDate} onChange={(e) => setAwayEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div className="flex gap-2">
            <input value={awayReason} onChange={(e) => setAwayReason(e.target.value)} placeholder="Причина (опционально)"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            <button type="button" onClick={addAway} disabled={!awayStartDate || !awayEndDate}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50">Добавить</button>
          </div>
        </div>

        {error && <div className="text-red-500 text-sm">{error}</div>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Закрыть</button>
          <button type="submit" disabled={saving} className="flex-1 bg-brand-500 text-white py-2.5 rounded-xl text-sm hover:bg-brand-600 transition-colors disabled:opacity-60">
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
