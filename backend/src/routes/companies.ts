import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, insertOne } from '../db';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth';

const router = Router();

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Company name required' });
  if (req.user!.company_id) return res.status(400).json({ error: 'Already in a company' });

  let invite_code = generateInviteCode();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await queryOne('SELECT id FROM companies WHERE invite_code = $1', [invite_code]);
    if (!existing) break;
    invite_code = generateInviteCode();
    attempts++;
  }

  const company = await insertOne<any>('companies', { name, invite_code });

  await queryOne(
    'UPDATE users SET company_id = $1, role = $2 WHERE id = $3',
    [company!.id, 'admin', req.user!.id]
  );

  res.status(201).json(company);
});

router.get('/my', authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user!.company_id) return res.status(404).json({ error: 'Not in a company' });
  const company = await queryOne<any>(
    'SELECT * FROM companies WHERE id = $1',
    [req.user!.company_id]
  );
  res.json(company);
});

router.post('/join', authenticate, async (req: AuthRequest, res: Response) => {
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ error: 'Invite code required' });
  if (req.user!.company_id) return res.status(400).json({ error: 'Already in a company' });

  const company = await queryOne<any>('SELECT * FROM companies WHERE invite_code = $1', [invite_code]);
  if (!company) return res.status(404).json({ error: 'Invalid invite code' });

  await queryOne('UPDATE users SET company_id = $1 WHERE id = $2', [company.id, req.user!.id]);
  res.json(company);
});

router.get('/members', authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user!.company_id) return res.status(404).json({ error: 'Not in a company' });
  const members = await query<any>(
    `SELECT id, email, full_name, role, avatar_color, is_active, created_at
     FROM users WHERE company_id = $1 ORDER BY created_at ASC`,
    [req.user!.company_id]
  );
  res.json(members);
});

// Admin creates a user
router.post('/members', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const bcrypt = require('bcryptjs');
  const { email, password, full_name, role = 'member' } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'email, password, full_name required' });
  }
  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const password_hash = await bcrypt.hash(password, 12);
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
  const avatar_color = colors[Math.floor(Math.random() * colors.length)];

  const created = await insertOne<any>('users', {
    email,
    password_hash,
    full_name,
    company_id: req.user!.company_id,
    role,
    avatar_color,
  });
  const { password_hash: _ph, ...user } = created;
  res.status(201).json(user);
});

router.patch('/members/:userId', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { role, is_active } = req.body;

  const target = await queryOne('SELECT id FROM users WHERE id = $1 AND company_id = $2', [userId, req.user!.company_id]);
  if (!target) return res.status(404).json({ error: 'User not found in your company' });
  if (userId === req.user!.id) return res.status(400).json({ error: 'Cannot modify yourself' });

  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (role !== undefined) { updates.push(`role = $${i++}`); params.push(role); }
  if (is_active !== undefined) { updates.push(`is_active = $${i++}`); params.push(is_active); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(userId);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, params);
  const user = await queryOne<any>(
    'SELECT id, email, full_name, role, avatar_color, is_active FROM users WHERE id = $1',
    [userId]
  );
  res.json(user);
});

// Admin sets a new password for a company member
router.patch('/members/:userId/password', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  const bcrypt = require('bcryptjs');
  const { userId } = req.params;
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const target = await queryOne('SELECT id FROM users WHERE id = $1 AND company_id = $2', [userId, req.user!.company_id]);
  if (!target) return res.status(404).json({ error: 'User not found in your company' });

  const password_hash = await bcrypt.hash(password, 12);
  await queryOne('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, userId]);
  res.json({ ok: true });
});

export default router;
