import { Router, Response } from 'express';
import { query, queryOne } from '../db';
import { authenticate } from '../middleware/auth';
import { requireProjectAccess, requireProjectRole, ProjectRequest } from '../middleware/projectAccess';

const router = Router({ mergeParams: true });

router.get('/', authenticate, requireProjectAccess, async (req: ProjectRequest, res: Response) => {
  const boards = await query<any>(
    'SELECT * FROM boards WHERE project_id = $1 ORDER BY created_at ASC',
    [req.projectId]
  );
  res.json(boards);
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
  const { name } = req.body;
  const board = await queryOne<any>(
    'UPDATE boards SET name = $1 WHERE id = $2 AND project_id = $3 RETURNING *',
    [name, boardId, req.projectId]
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

  const columns = await query<any>(
    'SELECT * FROM columns WHERE board_id = $1 ORDER BY position ASC',
    [boardId]
  );

  const tasks = await query<any>(
    `SELECT t.*,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', tt.id, 'name', tt.name, 'color', tt.color)) FILTER (WHERE tt.id IS NOT NULL), '[]') as tags,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'full_name', u.full_name, 'avatar_color', u.avatar_color)) FILTER (WHERE u.id IS NOT NULL), '[]') as assignees,
            COALESCE(json_object_agg(cv.field_id, cv.value) FILTER (WHERE cv.field_id IS NOT NULL), '{}') as custom_values
     FROM tasks t
     LEFT JOIN task_tags tt ON tt.task_id = t.id
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     LEFT JOIN task_custom_values cv ON cv.task_id = t.id
     WHERE t.column_id = ANY(SELECT id FROM columns WHERE board_id = $1)
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

export default router;
