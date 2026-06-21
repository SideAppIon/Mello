import { useState } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import { calendarApi } from '../api/client';
import { CalendarEvent, CalendarMember } from '../types';
import { localToUtcIso, utcIsoToLocalParts, fmtInTz, tzShortOffset } from '../lib/tz';

interface Props {
  viewerTz: string;
  members: CalendarMember[];
  initialDate?: string; // 'YYYY-MM-DD' для создания на конкретный день
  event?: CalendarEvent; // редактирование
  onClose: () => void;
  onSaved: () => void;
}

const DURATIONS = [15, 30, 45, 60, 90, 120];

export default function EventModal({ viewerTz, members, initialDate, event, onClose, onSaved }: Props) {
  const isEdit = !!event;
  const startParts = event ? utcIsoToLocalParts(event.starts_at, viewerTz) : null;
  const initDuration = event
    ? Math.max(15, Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000))
    : 30;

  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [date, setDate] = useState(startParts?.date || initialDate || new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(startParts?.time || '10:00');
  const [duration, setDuration] = useState(initDuration);
  const [meetingUrl, setMeetingUrl] = useState(event?.meeting_url || '');
  const [location, setLocation] = useState(event?.location || '');
  // Чей календарь: '' — мой; иначе id коллеги.
  const [targetUserId, setTargetUserId] = useState('');
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const startUtc = (() => {
    try { return localToUtcIso(date, time, viewerTz); } catch { return null; }
  })();
  const targetMember = members.find((m) => m.id === targetUserId);

  const toggleAttendee = (id: string) =>
    setAttendeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!startUtc) { setError('Некорректная дата/время'); return; }
    const endUtc = new Date(new Date(startUtc).getTime() + duration * 60000).toISOString();
    const payload: any = {
      title: title.trim(),
      description: description.trim() || null,
      starts_at: startUtc,
      ends_at: endUtc,
      meeting_url: meetingUrl.trim() || null,
      location: location.trim() || null,
    };
    setSaving(true);
    try {
      if (isEdit) {
        await calendarApi.updateEvent(event!.id, payload);
      } else if (targetUserId) {
        await calendarApi.createEventFor(targetUserId, payload);
      } else {
        await calendarApi.createEvent({ ...payload, attendee_ids: attendeeIds });
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isEdit ? 'Редактировать встречу' : 'Новая встреча'} size="md">
      <form onSubmit={save} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
          <input
            autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required
            placeholder="Например: Созвон по проекту"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Дата</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Время</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
        </div>
        <p className="text-xs text-gray-400 -mt-2">Ваш пояс: {tzShortOffset(viewerTz)} ({viewerTz})</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Длительность</label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button type="button" key={d} onClick={() => setDuration(d)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${duration === d ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {d < 60 ? `${d} мин` : `${d / 60} ч${d % 60 ? ` ${d % 60}м` : ''}`}
              </button>
            ))}
          </div>
        </div>

        {!isEdit && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">В чей календарь</label>
            <select value={targetUserId} onChange={(e) => { setTargetUserId(e.target.value); setAttendeeIds([]); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30">
              <option value="">Мой календарь</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            {/* Кросс-TZ подсказка: время встречи в поясе коллеги */}
            {targetMember && startUtc && targetMember.timezone !== viewerTz && (
              <p className="text-xs mt-1.5 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg">
                У коллеги другой часовой пояс ({tzShortOffset(targetMember.timezone)}): встреча начнётся в {fmtInTz(startUtc, targetMember.timezone, 'HH:mm, d MMM')}
              </p>
            )}
          </div>
        )}

        {/* Участники (только при создании на своём календаре) */}
        {!isEdit && !targetUserId && members.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Участники</label>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const on = attendeeIds.includes(m.id);
                return (
                  <button type="button" key={m.id} onClick={() => toggleAttendee(m.id)}
                    className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-sm transition-colors ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <Avatar name={m.full_name} color={m.avatar_color} size="sm" />
                    {m.full_name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ссылка на встречу (опционально)</label>
          <input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://meet..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Место / описание (опционально)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Переговорка / адрес"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 mb-2" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Заметки..."
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none" />
        </div>

        {error && <div className="text-red-500 text-sm">{error}</div>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Отмена</button>
          <button type="submit" disabled={saving} className="flex-1 bg-brand-500 text-white py-2.5 rounded-xl text-sm hover:bg-brand-600 transition-colors disabled:opacity-60">
            {saving ? 'Сохраняем...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
