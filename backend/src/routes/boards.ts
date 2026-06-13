import { Router, Response } from 'express';
import { query, queryOne } from '../db';
import { authenticate } from '../middleware/auth';
import { requireProjectAccess, requireProjectRole, ProjectRequest } from '../middleware/projectAccess';

const router = Router({ mergeParams: true });

// Доступ к доске: админ/менеджер проекта — всегда; иначе — если доска не ограничена
// или пользователь явно добавлен в участники доски.
async function canAccessBoard(board: any, role: string, userId: string): Promise<boolean> {
  if (role === 'admin' || role === 'manager') return true;
  if (!board.is_restricted) return true;
  const m = await queryOne('SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2', [board.id, userId]);
  return !!m;
}

router.get('/', authenticate, requireProjectAccess, async (req: ProjectRequest, res: Response) => {
  const role = req.projectMember!.role;
  const userId = req.user!.id;
  const boards = await query<any>(
    'SELECT * FROM boards WHERE project_id = $1 ORDER BY created_at ASC',
    [req.projectId]
  );
  // Привилегированные роли видят все доски, остальным — фильтр по доступу
  if (role === 'admin' || role === 'manager') return res.json(boards);
  const accessible: any[] = [];
  for (const b of boards) {
    if (await canAccessBoard(b, role, userId)) accessible.push(b);
  }
  res.json(accessible);
});

router.post('/', authenticate, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Board name required' });
  const board = await queryOne<any>(
    'INSERT INTO boards (project_id, name) VALUES ($1, $2) RETURNING *',
    [req.projectId, name]
  );
  res.status(201).json(board);
});

router.patch('/:boardId', authenticate, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  const { boardId } = req.params;
  const { name, completed_column_id, background, column_style, is_restricted } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (name !== undefined) { updates.push(`name = $${i++}`); params.push(name); }
  if (completed_column_id !== undefined) { updates.push(`completed_column_id = $${i++}`); params.push(completed_column_id); }
  if (background !== undefined) { updates.push(`background = $${i++}`); params.push(background); }
  if (column_style !== undefined) { updates.push(`column_style = $${i++}`); params.push(column_style); }
  if (is_restricted !== undefined) { updates.push(`is_restricted = $${i++}`); params.push(is_restricted); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(boardId, req.projectId);
  const board = await queryOne<any>(
    `UPDATE boards SET ${updates.join(', ')} WHERE id = $${i++} AND project_id = $${i} RETURNING *`,
    params
  );
  if (!board) return res.status(404).json({ error: 'Board not found' });
  res.json(board);
});

router.delete('/:boardId', authenticate, requireProjectAccess, requireProjectRole('admin'), async (req: ProjectRequest, res: Response) => {
  const { boardId } = req.params;
  await queryOne('DELETE FROM boards WHERE id = $1 AND project_id = $2', [boardId, req.projectId]);
  res.json({ ok: true });
});

// Full board with columns and tasks
router.get('/:boardId/full', authenticate, requireProjectAccess, async (req: ProjectRequest, res: Response) => {
  const { boardId } = req.params;
  const board = await queryOne<any>(
    'SELECT * FROM boards WHERE id = $1 AND project_id = $2',
    [boardId, req.projectId]
  );
  if (!board) return res.status(404).json({ error: 'Board not found' });

  // Проверка доступа на уровне доски
  if (!(await canAccessBoard(board, req.projectMember!.role, req.user!.id))) {
    return res.status(403).json({ error: 'No access to this board' });
  }

  const columns = await query<any>(
    'SELECT * FROM columns WHERE board_id = $1 ORDER BY position ASC',
    [boardId]
  );

  const tasks = await query<any>(
    `SELECT t.*,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', tt.id, 'name', tt.name, 'color', tt.color)) FILTER (WHERE tt.id IS NOT NULL), '[]') as tags,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'full_name', u.full_name, 'avatar_color', u.avatar_color)) FILTER (WHERE u.id IS NOT NULL), '[]') as assignees,
            COALESCE(json_object_agg(cv.field_id, cv.value) FILTER (WHERE cv.field_id IS NOT NULL), '{}') as custom_values,
            COALESCE((SELECT json_agg(s ORDER BY s.position, s.created_at) FROM subtasks s WHERE s.task_id = t.id), '[]') as subtasks
     FROM tasks t
     LEFT JOIN task_tags tt ON tt.task_id = t.id
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     LEFT JOIN task_custom_values cv ON cv.task_id = t.id
     WHERE t.column_id = ANY(SELECT id FROM columns WHERE board_id = $1) AND t.is_completed = FALSE
     GROUP BY t.id
     ORDER BY t.position ASC`,
    [boardId]
  );

  const custom_fields = await query<any>(
    'SELECT * FROM project_custom_fields WHERE project_id = $1 ORDER BY position ASC, created_at ASC',
    [req.projectId]
  );

  const tasksByColumn = tasks.reduce((acc: any, task: any) => {
    if (!acc[task.column_id]) acc[task.column_id] = [];
    acc[task.column_id].push(task);
    return acc;
  }, {});

  res.json({
    ...board,
    columns: columns.map((col: any) => ({
      ...col,
      tasks: tasksByColumn[col.id] || [],
    })),
    custom_fields,
    my_role: req.projectMember!.role,
  });
});

// Lazy-load completed tasks for a board (loaded only on demand)
router.get('/:boardId/completed', authenticate, requireProjectAccess, async (req: ProjectRequest, res: Response) => {
  const { boardId } = req.params;
  const tasks = await query<any>(
    `SELECT t.*,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', tt.id, 'name', tt.name, 'color', tt.color)) FILTER (WHERE tt.id IS NOT NULL), '[]') as tags,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'full_name', u.full_name, 'avatar_color', u.avatar_color)) FILTER (WHERE u.id IS NOT NULL), '[]') as assignees,
            COALESCE(json_object_agg(cv.field_id, cv.value) FILTER (WHERE cv.field_id IS NOT NULL), '{}') as custom_values,
            COALESCE((SELECT json_agg(s ORDER BY s.position, s.created_at) FROM subtasks s WHERE s.task_id = t.id), '[]') as subtasks
     FROM tasks t
     LEFT JOIN task_tags tt ON tt.task_id = t.id
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     LEFT JOIN task_custom_values cv ON cv.task_id = t.id
     WHERE t.column_id = ANY(SELECT id FROM columns WHERE board_id = $1) AND t.is_completed = TRUE
     GROUP BY t.id
     ORDER BY t.completed_at DESC NULLS LAST`,
    [boardId]
  );
  res.json(tasks);
});

// Board access: get restriction state + member ids
router.get('/:boardId/access', authenticate, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  const { boardId } = req.params;
  const board = await queryOne<{ is_restricted: boolean }>('SELECT is_restricted FROM boards WHERE id = $1 AND project_id = $2', [boardId, req.projectId]);
  if (!board) return res.status(404).json({ error: 'Board not found' });
  const members = await query<{ user_id: string }>('SELECT user_id FROM board_members WHERE board_id = $1', [boardId]);
  res.json({ is_restricted: board.is_restricted, member_ids: members.map(m => m.user_id) });
});

// Add a board member
router.post('/:boardId/members', authenticate, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  const { boardId } = req.params;
  const { user_id } = req.body;
  // user must be a member of the project
  const pm = await queryOne('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [req.projectId, user_id]);
  if (!pm) return res.status(400).json({ error: 'User is not a project member' });
  await queryOne('INSERT INTO board_members (board_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [boardId, user_id]);
  res.json({ ok: true });
});

// Remove a board member
router.delete('/:boardId/members/:userId', authenticate, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  const { boardId, userId } = req.params;
  await queryOne('DELETE FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
  res.json({ ok: true });
});

export default router;
