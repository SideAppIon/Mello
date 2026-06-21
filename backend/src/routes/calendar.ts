import { Router, Response } from 'express';
import { query, queryOne, insertOne, pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { toMysqlUtc } from '../lib/timezone';
import { notify } from '../lib/notify';

const router = Router();

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

// Получить настройки текущего пользователя, создав строку с дефолтами при отсутствии.
async function getOrCreateSettings(userId: string) {
  let s = await queryOne<any>('SELECT * FROM calendar_settings WHERE user_id = $1', [userId]);
  if (!s) {
    // PK таблицы — user_id (колонки id нет), поэтому insertOne не подходит.
    await pool.query(
      'INSERT IGNORE INTO calendar_settings (user_id, work_days) VALUES (?, ?)',
      [userId, JSON.stringify(DEFAULT_WORK_DAYS)]
    );
    s = await queryOne<any>('SELECT * FROM calendar_settings WHERE user_id = $1', [userId]);
  }
  // work_days приходит из JSON-колонки уже распарсенным (mysql2), но подстрахуемся.
  if (typeof s.work_days === 'string') {
    try { s.work_days = JSON.parse(s.work_days); } catch { s.work_days = DEFAULT_WORK_DAYS; }
  }
  return s;
}

function slugify(raw: string): string {
  return String(raw)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// --- Настройки ---

router.get('/settings', authenticate, async (req: AuthRequest, res: Response) => {
  const s = await getOrCreateSettings(req.user!.id);
  res.json(s);
});

router.patch('/settings', authenticate, async (req: AuthRequest, res: Response) => {
  await getOrCreateSettings(req.user!.id);
  const { timezone, work_days, work_start, work_end, slot_minutes, booking_enabled, booking_slug, default_meeting_url } = req.body;

  const fields: Record<string, any> = {};
  if (timezone !== undefined) fields.timezone = String(timezone);
  if (Array.isArray(work_days)) fields.work_days = JSON.stringify(work_days.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6));
  if (work_start !== undefined) fields.work_start = String(work_start);
  if (work_end !== undefined) fields.work_end = String(work_end);
  if (slot_minutes !== undefined) fields.slot_minutes = Math.max(5, Math.min(480, Number(slot_minutes) || 30));
  if (booking_enabled !== undefined) fields.booking_enabled = booking_enabled ? 1 : 0;
  if (default_meeting_url !== undefined) fields.default_meeting_url = default_meeting_url || null;

  if (booking_slug !== undefined) {
    const slug = slugify(booking_slug);
    if (!slug) return res.status(400).json({ error: 'Invalid slug' });
    const taken = await queryOne('SELECT user_id FROM calendar_settings WHERE booking_slug = $1 AND user_id != $2', [slug, req.user!.id]);
    if (taken) return res.status(409).json({ error: 'Эта ссылка уже занята' });
    fields.booking_slug = slug;
  }

  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const updates = Object.keys(fields).map((k, i) => `${k} = $${i + 1}`);
  const params = [...Object.values(fields), req.user!.id];
  await query(`UPDATE calendar_settings SET ${updates.join(', ')} WHERE user_id = $${params.length}`, params);

  res.json(await getOrCreateSettings(req.user!.id));
});

// --- События ---

// Собрать события (где пользователь — владелец или участник) в диапазоне [from, to].
async function loadEvents(userId: string, from: string, to: string) {
  const events = await query<any>(
    `SELECT DISTINCT e.*, ow.full_name AS owner_name, cb.full_name AS created_by_name
     FROM calendar_events e
     JOIN users ow ON ow.id = e.owner_id
     LEFT JOIN users cb ON cb.id = e.created_by
     LEFT JOIN calendar_event_attendees a ON a.event_id = e.id
     WHERE e.status = 'confirmed'
       AND e.starts_at < $1 AND e.ends_at > $2
       AND (e.owner_id = $3 OR a.user_id = $4)
     ORDER BY e.starts_at ASC`,
    [to, from, userId, userId]
  );
  if (!events.length) return [];
  const ids = events.map((e: any) => e.id);
  const ph = ids.map(() => '?').join(', ');
  const attendees = await query<any>(
    `SELECT ea.event_id, u.id, u.full_name, u.avatar_color
     FROM calendar_event_attendees ea JOIN users u ON u.id = ea.user_id
     WHERE ea.event_id IN (${ph})`,
    ids
  );
  const byEvent = new Map<string, any[]>();
  for (const a of attendees) {
    const arr = byEvent.get(a.event_id);
    const person = { id: a.id, full_name: a.full_name, avatar_color: a.avatar_color };
    if (arr) arr.push(person); else byEvent.set(a.event_id, [person]);
  }
  return events.map((e: any) => ({ kind: 'event', ...e, attendees: byEvent.get(e.id) || [] }));
}

// Задачи с дедлайном в диапазоне, назначенные мне или созданные мной.
async function loadTasks(userId: string, from: string, to: string) {
  return query<any>(
    `SELECT DISTINCT t.id, t.title, t.priority, t.deadline, t.is_completed,
            b.id AS board_id, b.project_id, p.name AS project_name
     FROM tasks t
     JOIN columns c ON c.id = t.column_id
     JOIN boards b ON b.id = c.board_id
     JOIN projects p ON p.id = b.project_id
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     WHERE t.deadline IS NOT NULL
       AND t.deadline >= $1 AND t.deadline < $2
       AND (ta.user_id = $3 OR t.created_by = $4)
     ORDER BY t.deadline ASC`,
    [from, to, userId, userId]
  ).then((rows) => rows.map((r: any) => ({ kind: 'task', ...r })));
}

router.get('/events', authenticate, async (req: AuthRequest, res: Response) => {
  const { from, to, include = 'both' } = req.query as Record<string, string>;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const wantEvents = include === 'meetings' || include === 'both';
  const wantTasks = include === 'tasks' || include === 'both';

  const [events, tasks] = await Promise.all([
    wantEvents ? loadEvents(req.user!.id, from, to) : Promise.resolve([]),
    wantTasks ? loadTasks(req.user!.id, from, to) : Promise.resolve([]),
  ]);
  res.json([...events, ...tasks]);
});

// Получить полное событие со списком участников.
async function getFullEvent(eventId: string) {
  const e = await queryOne<any>(
    `SELECT e.*, ow.full_name AS owner_name, cb.full_name AS created_by_name
     FROM calendar_events e
     JOIN users ow ON ow.id = e.owner_id
     LEFT JOIN users cb ON cb.id = e.created_by
     WHERE e.id = $1`,
    [eventId]
  );
  if (!e) return null;
  const attendees = await query<any>(
    `SELECT u.id, u.full_name, u.avatar_color FROM calendar_event_attendees ea
     JOIN users u ON u.id = ea.user_id WHERE ea.event_id = $1`,
    [eventId]
  );
  return { kind: 'event', ...e, attendees };
}

async function createEvent(ownerId: string, createdBy: string, attendeeIds: string[], body: any) {
  const { title, description, starts_at, ends_at, meeting_url, location } = body;
  const event = await insertOne<any>('calendar_events', {
    owner_id: ownerId,
    title: title.trim(),
    description: description || null,
    starts_at: toMysqlUtc(starts_at),
    ends_at: toMysqlUtc(ends_at),
    meeting_url: meeting_url || null,
    location: location || null,
    source: 'internal',
    created_by: createdBy,
  });
  const unique = Array.from(new Set([ownerId, ...attendeeIds]));
  for (const uid of unique) {
    await query('INSERT IGNORE INTO calendar_event_attendees (event_id, user_id) VALUES ($1, $2)', [event.id, uid]);
    // Уведомляем участников, кроме самого создателя.
    if (uid !== createdBy) {
      await notify(uid, 'event', `Новая встреча: ${event.title}`, '/calendar');
    }
  }
  return event;
}

// Создать событие на собственном календаре.
router.post('/events', authenticate, async (req: AuthRequest, res: Response) => {
  const { title, starts_at, ends_at, attendee_ids = [] } = req.body;
  if (!title?.trim() || !starts_at || !ends_at) {
    return res.status(400).json({ error: 'title, starts_at, ends_at required' });
  }
  // Участники должны быть из той же компании.
  const valid = await validateCompanyMembers(req.user!.company_id, attendee_ids);
  const event = await createEvent(req.user!.id, req.user!.id, valid, req.body);
  res.status(201).json(await getFullEvent(event.id));
});

// Поставить встречу в календарь коллеги по компании.
router.post('/events/for/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { title, starts_at, ends_at } = req.body;
  if (!title?.trim() || !starts_at || !ends_at) {
    return res.status(400).json({ error: 'title, starts_at, ends_at required' });
  }
  if (!req.user!.company_id) return res.status(400).json({ error: 'Not in a company' });
  const target = await queryOne('SELECT id FROM users WHERE id = $1 AND company_id = $2 AND is_active = TRUE', [userId, req.user!.company_id]);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден в вашей компании' });

  const event = await createEvent(userId, req.user!.id, [req.user!.id, userId], req.body);
  res.status(201).json(await getFullEvent(event.id));
});

router.patch('/events/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const e = await queryOne<any>('SELECT owner_id, created_by FROM calendar_events WHERE id = $1', [id]);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  if (e.owner_id !== req.user!.id && e.created_by !== req.user!.id) {
    return res.status(403).json({ error: 'No permission' });
  }

  const fields: Record<string, any> = {};
  if (req.body.title !== undefined) fields.title = String(req.body.title).trim();
  if (req.body.description !== undefined) fields.description = req.body.description || null;
  if (req.body.starts_at !== undefined) fields.starts_at = toMysqlUtc(req.body.starts_at);
  if (req.body.ends_at !== undefined) fields.ends_at = toMysqlUtc(req.body.ends_at);
  if (req.body.meeting_url !== undefined) fields.meeting_url = req.body.meeting_url || null;
  if (req.body.location !== undefined) fields.location = req.body.location || null;
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const updates = Object.keys(fields).map((k, i) => `${k} = $${i + 1}`);
  const params = [...Object.values(fields), id];
  await query(`UPDATE calendar_events SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params);
  res.json(await getFullEvent(id));
});

router.delete('/events/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const e = await queryOne<any>('SELECT owner_id, created_by FROM calendar_events WHERE id = $1', [id]);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  if (e.owner_id !== req.user!.id && e.created_by !== req.user!.id) {
    return res.status(403).json({ error: 'No permission' });
  }
  await query('DELETE FROM calendar_events WHERE id = $1', [id]);
  res.json({ ok: true });
});

// Отфильтровать переданные id, оставив только участников той же компании.
async function validateCompanyMembers(companyId: string | null, ids: any): Promise<string[]> {
  if (!companyId || !Array.isArray(ids) || ids.length === 0) return [];
  const ph = ids.map(() => '?').join(', ');
  const rows = await query<{ id: string }>(
    `SELECT id FROM users WHERE company_id = ? AND id IN (${ph})`,
    [companyId, ...ids]
  );
  return rows.map((r) => r.id);
}

// Участники компании для выбора + их часовой пояс (для понимания кросс-TZ).
router.get('/members', authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user!.company_id) return res.json([]);
  const members = await query<any>(
    `SELECT u.id, u.full_name, u.email, u.avatar_color, COALESCE(cs.timezone, 'Europe/Moscow') AS timezone
     FROM users u
     LEFT JOIN calendar_settings cs ON cs.user_id = u.id
     WHERE u.company_id = $1 AND u.is_active = TRUE AND u.id != $2
     ORDER BY u.full_name ASC`,
    [req.user!.company_id, req.user!.id]
  );
  res.json(members);
});

// --- Периоды «нет на месте» ---

router.get('/away', authenticate, async (req: AuthRequest, res: Response) => {
  const rows = await query<any>(
    'SELECT * FROM calendar_away WHERE user_id = $1 ORDER BY starts_at ASC',
    [req.user!.id]
  );
  res.json(rows);
});

router.post('/away', authenticate, async (req: AuthRequest, res: Response) => {
  const { starts_at, ends_at, reason } = req.body;
  if (!starts_at || !ends_at) return res.status(400).json({ error: 'starts_at and ends_at required' });
  const row = await insertOne<any>('calendar_away', {
    user_id: req.user!.id,
    starts_at: toMysqlUtc(starts_at),
    ends_at: toMysqlUtc(ends_at),
    reason: reason || null,
  });
  res.status(201).json(row);
});

router.delete('/away/:id', authenticate, async (req: AuthRequest, res: Response) => {
  await query('DELETE FROM calendar_away WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.id]);
  res.json({ ok: true });
});

export default router;
