import { Router, Response } from 'express';
import { query, queryOne } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireProjectAccess, requireProjectRole, ProjectRequest } from '../middleware/projectAccess';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user!.company_id) return res.json([]);

  let projects;
  if (req.user!.role === 'admin') {
    projects = await query<any>(
      `SELECT p.*, u.full_name as creator_name,
              COUNT(DISTINCT pm.user_id) as member_count,
              COUNT(DISTINCT b.id) as board_count
       FROM projects p
       LEFT JOIN users u ON u.id = p.created_by
       LEFT JOIN project_members pm ON pm.project_id = p.id
       LEFT JOIN boards b ON b.project_id = p.id
       WHERE p.company_id = $1
       GROUP BY p.id, u.full_name ORDER BY p.created_at DESC`,
      [req.user!.company_id]
    );
  } else {
    projects = await query<any>(
      `SELECT p.*, pm2.role as my_role, u.full_name as creator_name,
              COUNT(DISTINCT pm.user_id) as member_count,
              COUNT(DISTINCT b.id) as board_count
       FROM projects p
       JOIN project_members pm2 ON pm2.project_id = p.id AND pm2.user_id = $1
       LEFT JOIN users u ON u.id = p.created_by
       LEFT JOIN project_members pm ON pm.project_id = p.id
       LEFT JOIN boards b ON b.project_id = p.id
       WHERE p.company_id = $2
       GROUP BY p.id, pm2.role, u.full_name ORDER BY p.created_at DESC`,
      [req.user!.id, req.user!.company_id]
    );
  }
  res.json(projects);
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user!.company_id) return res.status(400).json({ error: 'Not in a company' });
  if (!['admin', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only admin or manager can create projects' });
  }

  const { name, description, color = '#6366f1' } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name required' });

  const project = await queryOne<any>(
    `INSERT INTO projects (company_id, name, description, color, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user!.company_id, name, description, color, req.user!.id]
  );

  // Creator becomes project admin
  await queryOne(
    'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [project!.id, req.user!.id, 'admin']
  );

  res.status(201).json(project);
});

router.get('/:id', authenticate, requireProjectAccess, async (req: ProjectRequest, res: Response) => {
  const project = await queryOne<any>(
    `SELECT p.*, u.full_name as creator_name
     FROM projects p LEFT JOIN users u ON u.id = p.created_by
     WHERE p.id = $1`,
    [req.projectId]
  );
  const members = await query<any>(
    `SELECT u.id, u.full_name, u.email, u.avatar_color, u.role as company_role, pm.role as project_role
     FROM project_members pm JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1`,
    [req.projectId]
  );
  const permissions = await query<any>(
    'SELECT role, field_name, can_edit FROM project_field_permissions WHERE project_id = $1',
    [req.projectId]
  );
  const custom_fields = await query<any>(
    'SELECT * FROM project_custom_fields WHERE project_id = $1 ORDER BY position ASC, created_at ASC',
    [req.projectId]
  );
  res.json({ ...project, members, permissions, custom_fields, my_role: req.projectMember!.role });
});

router.patch('/:id', authenticate, requireProjectAccess, requireProjectRole('admin'), async (req: ProjectRequest, res: Response) => {
  const { name, description, color } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (name) { updates.push(`name = $${i++}`); params.push(name); }
  if (description !== undefined) { updates.push(`description = $${i++}`); params.push(description); }
  if (color) { updates.push(`color = $${i++}`); params.push(color); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.projectId);
  const project = await queryOne<any>(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, params);
  res.json(project);
});

router.delete('/:id', authenticate, requireProjectAccess, requireProjectRole('admin'), async (req: ProjectRequest, res: Response) => {
  await queryOne('DELETE FROM projects WHERE id = $1', [req.projectId]);
  res.json({ ok: true });
});

// Project members management
router.post('/:id/members', authenticate, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  const { user_id, role = 'member' } = req.body;
  const user = await queryOne('SELECT id FROM users WHERE id = $1 AND company_id = $2', [user_id, req.user!.company_id]);
  if (!user) return res.status(404).json({ error: 'User not found in company' });

  await queryOne(
    'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3',
    [req.projectId, user_id, role]
  );
  res.json({ ok: true });
});

router.patch('/:id/members/:userId', authenticate, requireProjectAccess, requireProjectRole('admin'), async (req: ProjectRequest, res: Response) => {
  const { userId } = req.params;
  const { role } = req.body;

  // Защита: нельзя снять с себя роль администратора, если других админов в проекте нет
  if (userId === req.user!.id && role !== 'admin') {
    const others = await queryOne<{ cnt: string }>(
      "SELECT COUNT(*) as cnt FROM project_members WHERE project_id = $1 AND role = 'admin' AND user_id != $2",
      [req.projectId, userId]
    );
    if (parseInt(others?.cnt || '0') === 0) {
      return res.status(400).json({ error: 'Нельзя снять с себя роль администратора: в проекте нет других администраторов' });
    }
  }

  await queryOne(
    'UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3',
    [role, req.projectId, userId]
  );
  res.json({ ok: true });
});

router.delete('/:id/members/:userId', authenticate, requireProjectAccess, requireProjectRole('admin'), async (req: ProjectRequest, res: Response) => {
  const { userId } = req.params;
  await queryOne('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [req.projectId, userId]);
  res.json({ ok: true });
});

// Field permissions
router.put('/:id/permissions', authenticate, requireProjectAccess, requireProjectRole('admin'), async (req: ProjectRequest, res: Response) => {
  const { permissions } = req.body as { permissions: { role: string; field_name: string; can_edit: boolean }[] };
  if (!Array.isArray(permissions)) return res.status(400).json({ error: 'permissions array required' });

  for (const p of permissions) {
    await queryOne(
      `INSERT INTO project_field_permissions (project_id, role, field_name, can_edit)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, role, field_name) DO UPDATE SET can_edit = $4`,
      [req.projectId, p.role, p.field_name, p.can_edit]
    );
  }
  res.json({ ok: true });
});

// Custom fields (definitions)
router.post('/:id/custom-fields', authenticate, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  // Permission check: managers can be denied custom-field creation via project permissions
  const role = req.projectMember!.role;
  if (role !== 'admin') {
    const perm = await queryOne<{ can_edit: boolean }>(
      'SELECT can_edit FROM project_field_permissions WHERE project_id = $1 AND role = $2 AND field_name = $3',
      [req.projectId, role, 'custom_fields_create']
    );
    if (perm && perm.can_edit === false) return res.status(403).json({ error: 'No permission to create custom fields' });
  }

  const { name, field_type = 'text', options = [] } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Field name required' });
  if (!['text', 'number', 'date', 'select'].includes(field_type)) return res.status(400).json({ error: 'Invalid field type' });
  const maxPos = await queryOne<{ max: string }>('SELECT MAX(position) as max FROM project_custom_fields WHERE project_id = $1', [req.projectId]);
  const position = parseInt(maxPos?.max || '-1') + 1;
  const field = await queryOne<any>(
    'INSERT INTO project_custom_fields (project_id, name, field_type, options, position) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [req.projectId, name.trim(), field_type, JSON.stringify(field_type === 'select' ? options : []), position]
  );
  res.status(201).json(field);
});

router.patch('/:id/custom-fields/:fieldId', authenticate, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  const { fieldId } = req.params;
  const { name, options } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (name) { updates.push(`name = $${i++}`); params.push(name.trim()); }
  if (options !== undefined) { updates.push(`options = $${i++}`); params.push(JSON.stringify(options)); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(fieldId, req.projectId);
  const field = await queryOne<any>(
    `UPDATE project_custom_fields SET ${updates.join(', ')} WHERE id = $${i++} AND project_id = $${i} RETURNING *`,
    params
  );
  if (!field) return res.status(404).json({ error: 'Field not found' });
  res.json(field);
});

router.delete('/:id/custom-fields/:fieldId', authenticate, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  const { fieldId } = req.params;
  await queryOne('DELETE FROM project_custom_fields WHERE id = $1 AND project_id = $2', [fieldId, req.projectId]);
  res.json({ ok: true });
});

export default router;
