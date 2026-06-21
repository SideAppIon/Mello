import { Router, Request, Response } from 'express';
import { query, queryOne, insertOne } from '../db';
import { zonedToUtc, parseHm, weekdayInTz, toMysqlUtc } from '../lib/timezone';

// Публичные эндпоинты бронирования — без авторизации. Гость (в т.ч. незарегистрированный)
// видит только свободные слоты по рабочему времени владельца и бронирует один из них.
const router = Router();

interface OwnerSettings {
  user_id: string;
  full_name: string;
  avatar_color: string;
  timezone: string;
  work_days: number[];
  work_start: string;
  work_end: string;
  slot_minutes: number;
  default_meeting_url: string | null;
}

async function loadOwner(slug: string): Promise<OwnerSettings | null> {
  const row = await queryOne<any>(
    `SELECT cs.user_id, cs.timezone, cs.work_days, cs.work_start, cs.work_end,
            cs.slot_minutes, cs.default_meeting_url, u.full_name, u.avatar_color
     FROM calendar_settings cs JOIN users u ON u.id = cs.user_id
     WHERE cs.booking_slug = $1 AND cs.booking_enabled = TRUE AND u.is_active = TRUE`,
    [slug]
  );
  if (!row) return null;
  let work_days = row.work_days;
  if (typeof work_days === 'string') { try { work_days = JSON.parse(work_days); } catch { work_days = [1, 2, 3, 4, 5]; } }
  return { ...row, work_days };
}

// Публичная информация о владельце ссылки.
router.get('/:slug', async (req: Request, res: Response) => {
  const owner = await loadOwner(req.params.slug);
  if (!owner) return res.status(404).json({ error: 'Ссылка не найдена или бронирование отключено' });
  res.json({
    full_name: owner.full_name,
    avatar_color: owner.avatar_color,
    timezone: owner.timezone,
    work_days: owner.work_days,
    work_start: owner.work_start,
    work_end: owner.work_end,
    slot_minutes: owner.slot_minutes,
  });
});

// Свободные слоты на дату (дата трактуется в часовом поясе владельца).
router.get('/:slug/slots', async (req: Request, res: Response) => {
  const owner = await loadOwner(req.params.slug);
  if (!owner) return res.status(404).json({ error: 'Не найдено' });

  const date = String(req.query.date || '');
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return res.status(400).json({ error: 'date=YYYY-MM-DD required' });
  const [, ys, ms, ds] = m;
  const year = Number(ys), month = Number(ms), day = Number(ds);

  // Границы дня в UTC (по поясу владельца).
  const dayStart = zonedToUtc(year, month, day, 0, 0, owner.timezone);
  const dayEnd = zonedToUtc(year, month, day + 1, 0, 0, owner.timezone);

  // Проверяем рабочий день по фактическому дню недели в поясе владельца.
  const wd = weekdayInTz(dayStart, owner.timezone);
  if (!owner.work_days.includes(wd)) return res.json([]);

  // Занятость владельца: его события (как владельца или участника) + периоды away.
  const [busy, away] = await Promise.all([
    query<any>(
      `SELECT e.starts_at, e.ends_at FROM calendar_events e
       LEFT JOIN calendar_event_attendees a ON a.event_id = e.id AND a.user_id = $1
       WHERE e.status = 'confirmed' AND (e.owner_id = $2 OR a.user_id = $3)
         AND e.starts_at < $4 AND e.ends_at > $5`,
      [owner.user_id, owner.user_id, owner.user_id, dayEnd, dayStart]
    ),
    query<any>(
      `SELECT starts_at, ends_at FROM calendar_away
       WHERE user_id = $1 AND starts_at < $2 AND ends_at > $3`,
      [owner.user_id, dayEnd, dayStart]
    ),
  ]);
  const blocks = [...busy, ...away].map((b: any) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));

  const { hour: sh, minute: sm } = parseHm(owner.work_start);
  const { hour: eh, minute: em } = parseHm(owner.work_end);
  const workStart = zonedToUtc(year, month, day, sh, sm, owner.timezone).getTime();
  const workEnd = zonedToUtc(year, month, day, eh, em, owner.timezone).getTime();
  const step = owner.slot_minutes * 60000;
  const now = Date.now();

  const slots: string[] = [];
  for (let t = workStart; t + step <= workEnd; t += step) {
    if (t <= now) continue;
    const overlaps = blocks.some((b) => t < b.end && t + step > b.start);
    if (!overlaps) slots.push(new Date(t).toISOString());
  }
  res.json(slots);
});

// Забронировать слот.
router.post('/:slug', async (req: Request, res: Response) => {
  const owner = await loadOwner(req.params.slug);
  if (!owner) return res.status(404).json({ error: 'Не найдено' });

  const { guest_name, guest_email, starts_at, note } = req.body;
  if (!guest_name?.trim() || !guest_email?.trim() || !starts_at) {
    return res.status(400).json({ error: 'Укажите имя, email и время' });
  }

  const start = new Date(starts_at);
  if (isNaN(start.getTime())) return res.status(400).json({ error: 'Некорректное время' });
  const end = new Date(start.getTime() + owner.slot_minutes * 60000);

  if (start.getTime() <= Date.now()) return res.status(400).json({ error: 'Это время уже прошло' });

  // Перепроверка попадания в рабочие часы (защита от подделанного запроса).
  const wd = weekdayInTz(start, owner.timezone);
  if (!owner.work_days.includes(wd)) return res.status(400).json({ error: 'Нерабочий день' });

  // Перепроверка свободы слота (защита от гонки).
  const conflict = await queryOne<any>(
    `SELECT e.id FROM calendar_events e
     LEFT JOIN calendar_event_attendees a ON a.event_id = e.id AND a.user_id = $1
     WHERE e.status = 'confirmed' AND (e.owner_id = $2 OR a.user_id = $3)
       AND e.starts_at < $4 AND e.ends_at > $5
     LIMIT 1`,
    [owner.user_id, owner.user_id, owner.user_id, toMysqlUtc(end), toMysqlUtc(start)]
  );
  if (conflict) return res.status(409).json({ error: 'Это время только что заняли, выберите другое' });

  const event = await insertOne<any>('calendar_events', {
    owner_id: owner.user_id,
    title: `Встреча с ${guest_name.trim()}`,
    description: note || null,
    starts_at: toMysqlUtc(start),
    ends_at: toMysqlUtc(end),
    meeting_url: owner.default_meeting_url || null,
    source: 'booking',
    created_by: null,
    guest_name: guest_name.trim(),
    guest_email: guest_email.trim(),
  });
  await query('INSERT IGNORE INTO calendar_event_attendees (event_id, user_id) VALUES ($1, $2)', [event.id, owner.user_id]);

  res.status(201).json({
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    meeting_url: event.meeting_url,
    owner_name: owner.full_name,
    owner_timezone: owner.timezone,
  });
});

export default router;
