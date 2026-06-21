import { Router, Response } from 'express';
import { query, queryOne } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Список последних уведомлений + число непрочитанных.
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const items = await query<any>(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user!.id]
  );
  const unread = await queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [req.user!.id]
  );
  res.json({ items, unread_count: Number(unread?.c || 0) });
});

// Пометить все как прочитанные.
router.post('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [req.user!.id]);
  res.json({ ok: true });
});

// Пометить одно как прочитанное.
router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.id]);
  res.json({ ok: true });
});

// Очистить все уведомления.
router.delete('/', authenticate, async (req: AuthRequest, res: Response) => {
  await query('DELETE FROM notifications WHERE user_id = $1', [req.user!.id]);
  res.json({ ok: true });
});

export default router;
