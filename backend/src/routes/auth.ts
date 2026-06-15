import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, insertOne } from '../db';
import { authenticate, AuthRequest, signToken } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  const { email, password, full_name, invite_code } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Email, password and full_name required' });
  }

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  let company_id: string | null = null;
  let role = 'member';

  if (invite_code) {
    const company = await queryOne<{ id: string }>('SELECT id FROM companies WHERE invite_code = $1', [invite_code]);
    if (!company) return res.status(400).json({ error: 'Invalid invite code' });
    company_id = company.id;
  }

  // First user in system becomes admin
  const userCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users', []);
  if (userCount && parseInt(userCount.count) === 0) {
    role = 'admin';
  }

  const password_hash = await bcrypt.hash(password, 12);
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];
  const avatar_color = colors[Math.floor(Math.random() * colors.length)];

  const created = await insertOne<any>('users', {
    email,
    password_hash,
    full_name,
    company_id,
    role,
    avatar_color,
  });
  const { password_hash: _ph, ...user } = created;

  const token = signToken(user.id);
  res.status(201).json({ user, token });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await queryOne<any>(
    'SELECT id, email, full_name, role, company_id, avatar_color, password_hash FROM users WHERE email = $1 AND is_active = TRUE',
    [email]
  );
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const { password_hash, ...userWithoutHash } = user;
  const token = signToken(user.id);
  res.json({ user: userWithoutHash, token });
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await queryOne<any>(
    'SELECT id, email, full_name, role, company_id, avatar_color, created_at FROM users WHERE id = $1',
    [req.user!.id]
  );
  res.json(user);
});

router.patch('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const { full_name, password, avatar_color } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (full_name) { updates.push(`full_name = $${i++}`); params.push(full_name); }
  if (avatar_color) { updates.push(`avatar_color = $${i++}`); params.push(avatar_color); }
  if (password) {
    const hash = await bcrypt.hash(password, 12);
    updates.push(`password_hash = $${i++}`);
    params.push(hash);
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(req.user!.id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, params);
  const user = await queryOne<any>(
    'SELECT id, email, full_name, role, company_id, avatar_color FROM users WHERE id = $1',
    [req.user!.id]
  );
  res.json(user);
});

export default router;
