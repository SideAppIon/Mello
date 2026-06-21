import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import EventModal from '../components/EventModal';
import CalendarSettingsModal from '../components/CalendarSettingsModal';
import { calendarApi } from '../api/client';
import { useAuthStore } from '../store/auth';
import { CalendarItem, CalendarEvent, CalendarSettings, CalendarMember, PRIORITY_COLORS } from '../types';
import { localToUtcIso, fmtInTz, tzShortOffset } from '../lib/tz';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const GRID_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type Mode = 'both' | 'meetings' | 'tasks';

interface Cell { y: number; m: number; d: number; inMonth: boolean; dateStr: string; }

function pad(n: number) { return String(n).padStart(2, '0'); }

function buildGrid(year: number, month0: number): Cell[] {
  const first = new Date(Date.UTC(year, month0, 1, 12));
  const startOffset = (first.getUTCDay() + 6) % 7; // дни от понедельника
  const start = new Date(first);
  start.setUTCDate(1 - startOffset);
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start);
    dt.setUTCDate(start.getUTCDate() + i);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth(), d = dt.getUTCDate();
    cells.push({ y, m, d, inMonth: m === month0, dateStr: `${y}-${pad(m + 1)}-${pad(d)}` });
  }
  return cells;
}

function itemTime(it: CalendarItem): string {
  return it.kind === 'event' ? it.starts_at : it.deadline;
}

export default function CalendarPage() {
  const { user } = useAuthStore();
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [mode, setMode] = useState<Mode>('both');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showEvent, setShowEvent] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);

  const tz = settings?.timezone || 'Europe/Moscow';
  const grid = useMemo(() => buildGrid(year, month0), [year, month0]);
  const todayStr = settings ? fmtInTz(new Date().toISOString(), tz, 'yyyy-MM-dd') : '';

  useEffect(() => {
    Promise.all([calendarApi.getSettings(), calendarApi.members()])
      .then(([s, m]) => { setSettings(s); setMembers(m); })
      .catch(() => {});
  }, []);

  const reload = () => {
    if (!settings) return;
    const from = localToUtcIso(grid[0].dateStr, '00:00', tz);
    const lastDay = new Date(Date.UTC(grid[41].y, grid[41].m, grid[41].d + 1, 12));
    const toStr = `${lastDay.getUTCFullYear()}-${pad(lastDay.getUTCMonth() + 1)}-${pad(lastDay.getUTCDate())}`;
    const to = localToUtcIso(toStr, '00:00', tz);
    setLoading(true);
    calendarApi.listEvents(from, to, mode)
      .then(setItems)
      .finally(() => setLoading(false));
  };

  useEffect(reload, [settings, year, month0, mode]);

  // Группировка по дню (в поясе пользователя).
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const key = fmtInTz(itemTime(it), tz, 'yyyy-MM-dd');
      const arr = map.get(key);
      if (arr) arr.push(it); else map.set(key, [it]);
    }
    for (const arr of map.values()) arr.sort((a, b) => itemTime(a).localeCompare(itemTime(b)));
    return map;
  }, [items, tz]);

  const prevMonth = () => { if (month0 === 0) { setMonth0(11); setYear(year - 1); } else setMonth0(month0 - 1); };
  const nextMonth = () => { if (month0 === 11) { setMonth0(0); setYear(year + 1); } else setMonth0(month0 + 1); };
  const goToday = () => { setYear(now.getFullYear()); setMonth0(now.getMonth()); };

  const canEdit = (e: CalendarEvent) => e.owner_id === user?.id || e.created_by === user?.id;

  const openNew = (day?: string) => { setEditEvent(null); setSelectedDay(day || null); setShowEvent(true); };
  const onEventSaved = () => { setShowEvent(false); setEditEvent(null); setDetail(null); reload(); };

  const deleteEvent = async (e: CalendarEvent) => {
    if (!confirm('Удалить встречу?')) return;
    await calendarApi.deleteEvent(e.id);
    setDetail(null);
    reload();
  };

  const dayItems = selectedDay ? byDay.get(selectedDay) || [] : [];

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{MONTHS[month0]} {year}</h1>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500">‹</button>
              <button onClick={goToday} className="px-3 h-8 rounded-lg hover:bg-gray-100 text-sm text-gray-600">Сегодня</button>
              <button onClick={nextMonth} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500">›</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Режим отображения */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 text-sm">
              {([['both', 'Всё'], ['meetings', 'Встречи'], ['tasks', 'Задачи']] as [Mode, string][]).map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${mode === m ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowSettings(true)} className="w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-500" title="Настройки">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button onClick={() => openNew()} className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded-xl hover:bg-brand-600 transition-colors font-medium text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Встреча
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400 mb-3">Часовой пояс: {tzShortOffset(tz)} ({tz})</p>

        {/* Сетка месяца */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-100">
            {GRID_DAYS.map((d) => <div key={d} className="px-2 py-2 text-xs font-medium text-gray-400 text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell) => {
              const dayList = byDay.get(cell.dateStr) || [];
              const isToday = cell.dateStr === todayStr;
              return (
                <button key={cell.dateStr} onClick={() => setSelectedDay(cell.dateStr)}
                  className={`min-h-[92px] text-left p-1.5 border-b border-r border-gray-100 align-top transition-colors hover:bg-brand-50/40 ${cell.inMonth ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <div className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-brand-500 text-white font-semibold' : cell.inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                    {cell.d}
                  </div>
                  <div className="space-y-0.5">
                    {dayList.slice(0, 3).map((it) => (
                      <div key={`${it.kind}-${it.id}`}
                        className={`text-[11px] truncate rounded px-1 py-0.5 ${it.kind === 'event' ? 'bg-brand-100 text-brand-700' : 'text-white'}`}
                        style={it.kind === 'task' ? { backgroundColor: PRIORITY_COLORS[it.priority] } : undefined}>
                        {it.kind === 'event' ? fmtInTz(it.starts_at, tz, 'HH:mm') : '◷'} {it.title}
                      </div>
                    ))}
                    {dayList.length > 3 && <div className="text-[10px] text-gray-400 px-1">+{dayList.length - 3}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {loading && <p className="text-xs text-gray-400 mt-2">Загрузка…</p>}
      </main>

      {/* Панель дня */}
      {selectedDay && (
        <Modal onClose={() => setSelectedDay(null)} title={fmtInTz(localToUtcIso(selectedDay, '12:00', tz), tz, 'd MMMM yyyy')} size="sm">
          <div className="p-6 space-y-3">
            {dayItems.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Ничего не запланировано</p>}
            {dayItems.map((it) => it.kind === 'event' ? (
              <button key={it.id} onClick={() => { setDetail(it); }} className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                <div className="w-1.5 self-stretch rounded-full bg-brand-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{it.title}</div>
                  <div className="text-xs text-gray-500">{fmtInTz(it.starts_at, tz, 'HH:mm')}–{fmtInTz(it.ends_at, tz, 'HH:mm')}{it.source === 'booking' ? ' · бронь' : ''}</div>
                </div>
              </button>
            ) : (
              <Link key={it.id} to={`/projects/${it.project_id}/boards/${it.board_id}`} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                <div className="w-1.5 self-stretch rounded-full" style={{ backgroundColor: PRIORITY_COLORS[it.priority] }} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${it.is_completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>{it.title}</div>
                  <div className="text-xs text-gray-500">Задача · {fmtInTz(it.deadline, tz, 'HH:mm')} · {it.project_name}</div>
                </div>
              </Link>
            ))}
            <button onClick={() => openNew(selectedDay)} className="w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600">
              + Добавить встречу
            </button>
          </div>
        </Modal>
      )}

      {/* Детали встречи */}
      {detail && (
        <Modal onClose={() => setDetail(null)} title="Встреча" size="sm">
          <div className="p-6 space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">{detail.title}</h3>
            <div className="text-sm text-gray-600">
              {fmtInTz(detail.starts_at, tz, 'd MMMM, HH:mm')}–{fmtInTz(detail.ends_at, tz, 'HH:mm')}
              <span className="text-gray-400"> ({tzShortOffset(tz)})</span>
            </div>
            {detail.location && <div className="text-sm text-gray-600">📍 {detail.location}</div>}
            {detail.description && <p className="text-sm text-gray-600 whitespace-pre-wrap">{detail.description}</p>}
            {detail.meeting_url && (
              <a href={detail.meeting_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-brand-600 hover:underline break-all">
                🔗 {detail.meeting_url}
              </a>
            )}
            {detail.guest_name && (
              <div className="text-sm text-gray-600 bg-amber-50 rounded-lg px-3 py-2">
                Гость: {detail.guest_name}{detail.guest_email ? ` · ${detail.guest_email}` : ''}
              </div>
            )}
            {detail.attendees.length > 0 && (
              <div>
                <div className="text-xs text-gray-400 mb-1.5">Участники</div>
                <div className="flex flex-wrap gap-2">
                  {detail.attendees.map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Avatar name={a.full_name} color={a.avatar_color} size="sm" />
                      {a.full_name.split(' ')[0]}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {canEdit(detail) && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setEditEvent(detail); setDetail(null); setShowEvent(true); }} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">Изменить</button>
                <button onClick={() => deleteEvent(detail)} className="flex-1 py-2 border border-red-200 text-red-500 rounded-xl text-sm hover:bg-red-50">Удалить</button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showEvent && (
        <EventModal
          viewerTz={tz}
          members={members}
          initialDate={selectedDay || undefined}
          event={editEvent || undefined}
          onClose={() => { setShowEvent(false); setEditEvent(null); }}
          onSaved={onEventSaved}
        />
      )}

      {showSettings && (
        <CalendarSettingsModal settings={settings} onClose={() => setShowSettings(false)} onSaved={(s) => setSettings(s)} />
      )}
    </div>
  );
}
