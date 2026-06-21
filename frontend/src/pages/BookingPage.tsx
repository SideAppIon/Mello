import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { bookingApi } from '../api/client';
import { BookingInfo, BookingResult } from '../types';
import { browserTz, allTimezones, fmtInTz, tzShortOffset } from '../lib/tz';
import Avatar from '../components/Avatar';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function BookingPage() {
  const { slug = '' } = useParams();
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [guestTz, setGuestTz] = useState(browserTz());
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BookingResult | null>(null);

  useEffect(() => {
    bookingApi.getInfo(slug).then(setInfo).catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!info || !date) return;
    setLoadingSlots(true);
    setSelected(null);
    bookingApi.getSlots(slug, date)
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [info, date, slug]);

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await bookingApi.book(slug, { guest_name: guestName, guest_email: guestEmail, starts_at: selected, note });
      setResult(res);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось забронировать');
      // Слот мог занять кто-то другой — обновим список.
      bookingApi.getSlots(slug, date).then(setSlots).catch(() => {});
      setSelected(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Ссылка недоступна</h1>
          <p className="text-gray-500">Бронирование отключено или ссылка неверна.</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Встреча забронирована!</h1>
          <p className="text-gray-600 mb-1">с {result.owner_name}</p>
          <p className="text-gray-900 font-medium">{fmtInTz(result.starts_at, guestTz, 'd MMMM yyyy, HH:mm')}</p>
          <p className="text-sm text-gray-400 mb-1">ваш пояс: {tzShortOffset(guestTz)}</p>
          <p className="text-sm text-gray-400 mb-4">у организатора: {fmtInTz(result.starts_at, result.owner_timezone, 'HH:mm')} ({tzShortOffset(result.owner_timezone)})</p>
          {result.meeting_url && (
            <a href={result.meeting_url} target="_blank" rel="noopener noreferrer"
              className="inline-block w-full bg-brand-500 text-white py-2.5 rounded-xl hover:bg-brand-600 transition-colors break-all">
              Ссылка на встречу
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Шапка владельца */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4 flex items-center gap-4">
          <Avatar name={info.full_name} color={info.avatar_color} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{info.full_name}</h1>
            <p className="text-sm text-gray-500">Забронируйте удобное время · встреча {info.slot_minutes} мин</p>
            <p className="text-xs text-gray-400 mt-0.5">Пояс организатора: {tzShortOffset(info.timezone)} ({info.timezone})</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {/* Выбор пояса гостя */}
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-gray-700">Ваш часовой пояс</label>
            <select value={guestTz} onChange={(e) => setGuestTz(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 max-w-[60%]">
              {allTimezones().map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Дата */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Дата (по календарю организатора)</label>
            <input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>

          {/* Слоты */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Свободное время (в вашем поясе)</label>
            {loadingSlots ? (
              <p className="text-sm text-gray-400 py-4 text-center">Загрузка…</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Нет свободных слотов на этот день</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button key={s} onClick={() => setSelected(s)}
                    className={`py-2 rounded-lg text-sm border transition-colors ${selected === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-700 hover:border-brand-400'}`}>
                    {fmtInTz(s, guestTz, 'HH:mm')}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Форма */}
          {selected && (
            <form onSubmit={book} className="space-y-3 border-t border-gray-100 pt-4">
              <p className="text-sm text-gray-600">
                Выбрано: <span className="font-medium text-gray-900">{fmtInTz(selected, guestTz, 'd MMMM, HH:mm')}</span>
                <span className="text-gray-400"> ({tzShortOffset(guestTz)})</span>
              </p>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} required placeholder="Ваше имя"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
              <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required placeholder="Email"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Тема встречи (опционально)"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none" />
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <button type="submit" disabled={submitting}
                className="w-full bg-brand-500 text-white py-2.5 rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-60">
                {submitting ? 'Бронируем…' : 'Забронировать'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
