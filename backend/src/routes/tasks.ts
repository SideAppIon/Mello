import { Router, Response } from 'express';
import { query, queryOne } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireProjectAccess, requireProjectRole, ProjectRequest } from '../middleware/projectAccess';

const router = Router({ mergeParams: true });

async function getTaskProjectId(taskId: string): Promise<string | null> {
  const res = await queryOne<{ project_id: string }>(
    `SELECT b.project_id FROM tasks t
     JOIN columns c ON c.id = t.column_id
     JOIN boards b ON b.id = c.board_id
     WHERE t.id = $1`,
    [taskId]
  );
  return res?.project_id || null;
}

async function getColumnProjectId(columnId: string): Promise<string | null> {
  const res = await queryOne<{ project_id: string }>(
    'SELECT b.project_id FROM columns c JOIN boards b ON b.id = c.board_id WHERE c.id = $1',
    [columnId]
  );
  return res?.project_id || null;
}

async function logHistory(taskId: string, userId: string, action: string, field?: string, oldVal?: any, newVal?: any) {
  await queryOne(
    `INSERT INTO task_history (task_id, user_id, action, field_name, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [taskId, userId, action, field || null, oldVal != null ? String(oldVal) : null, newVal != null ? String(newVal) : null]
  );
}

async function getFullTask(taskId: string) {
  return queryOne<any>(
    `SELECT t.*,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', tt.id, 'name', tt.name, 'color', tt.color)) FILTER (WHERE tt.id IS NOT NULL), '[]') as tags,
            COALESCE(json_agg(DISTINCT jsonb_build_object('id', u.id, 'full_name', u.full_name, 'avatar_color', u.avatar_color, 'email', u.email)) FILTER (WHERE u.id IS NOT NULL), '[]') as assignees,
            COALESCE(json_object_agg(cv.field_id, cv.value) FILTER (WHERE cv.field_id IS NOT NULL), '{}') as custom_values,
            COALESCE((SELECT json_agg(s ORDER BY s.position, s.created_at) FROM subtasks s WHERE s.task_id = t.id), '[]') as subtasks,
            ub.full_name as created_by_name
     FROM tasks t
     LEFT JOIN task_tags tt ON tt.task_id = t.id
     LEFT JOIN task_assignees ta ON ta.task_id = t.id
     LEFT JOIN users u ON u.id = ta.user_id
     LEFT JOIN task_custom_values cv ON cv.task_id = t.id
     LEFT JOIN users ub ON ub.id = t.created_by
     WHERE t.id = $1
     GROUP BY t.id, ub.full_name`,
    [taskId]
  );
}

// Create task in a column
router.post('/column/:columnId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { columnId } = req.params;
  const projectId = await getColumnProjectId(columnId);
  if (!projectId) return res.status(404).json({ error: 'Column not found' });
  req.params.projectId = projectId;

  // Inline project access check
  const user = (req as AuthRequest).user!;
  let memberRole = 'member';
  if (user.role === 'admin' && user.company_id) {
    const proj = await queryOne('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [projectId, user.company_id]);
    if (!proj) return res.status(403).json({ error: 'No access' });
  } else {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member) return res.status(403).json({ error: 'No access to project' });
    if (member.role === 'viewer') return res.status(403).json({ error: 'Viewers cannot create tasks' });
    memberRole = member.role;
  }

  const { title, description, priority = 3, deadline, estimated_hours } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const maxPos = await queryOne<{ max: string }>('SELECT MAX(position) as max FROM tasks WHERE column_id = $1', [columnId]);
  const position = (parseInt(maxPos?.max || '-1') + 1);

  const task = await queryOne<any>(
    `INSERT INTO tasks (column_id, title, description, priority, deadline, estimated_hours, position, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [columnId, title, description, priority, deadline || null, estimated_hours || null, position, user.id]
  );

  await logHistory(task!.id, user.id, 'created');
  res.status(201).json(await getFullTask(task!.id));
});

// Get single task
router.get('/:taskId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  if (user.role !== 'admin') {
    const member = await queryOne('SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member) return res.status(403).json({ error: 'No access' });
  }

  const task = await getFullTask(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Update task
router.patch('/:taskId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  // Привилегированная роль (админ компании или админ проекта) обходит ограничения по полям
  let memberRole = 'admin';
  if (user.role !== 'admin') {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member) return res.status(403).json({ error: 'No access' });
    if (member.role === 'viewer') return res.status(403).json({ error: 'Viewers cannot edit tasks' });
    memberRole = member.role;
  }

  const oldTask = await queryOne<any>('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!oldTask) return res.status(404).json({ error: 'Task not found' });

  // Ограничения по полям применяются только к не-админам
  const restrictedFields = new Set<string>();
  if (memberRole !== 'admin') {
    const perms = await query<any>(
      'SELECT field_name, can_edit FROM project_field_permissions WHERE project_id = $1 AND role = $2',
      [projectId, memberRole]
    );
    perms.filter((p: any) => !p.can_edit).forEach((p: any) => restrictedFields.add(p.field_name));
  }

  const fields: Record<string, any> = {};
  const allowed = ['title', 'description', 'priority', 'deadline', 'estimated_hours'];
  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      if (restrictedFields.has(f)) return res.status(403).json({ error: `No permission to edit ${f}` });
      fields[f] = req.body[f];
    }
  }

  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Nothing to update' });

  const updates = Object.keys(fields).map((k, i) => `${k} = $${i + 1}`);
  const params = [...Object.values(fields), taskId];
  await queryOne(
    `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  );

  for (const [field, newVal] of Object.entries(fields)) {
    if (oldTask[field] !== newVal) {
      await logHistory(taskId, user.id, 'updated', field, oldTask[field], newVal);
    }
  }

  res.json(await getFullTask(taskId));
});

// Move task to another column
router.patch('/:taskId/move', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const { column_id, position } = req.body;

  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  if (user.role !== 'admin') {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member || member.role === 'viewer') return res.status(403).json({ error: 'No permission to move tasks' });
  }

  const oldTask = await queryOne<any>('SELECT * FROM tasks WHERE id = $1', [taskId]);
  await queryOne(
    'UPDATE tasks SET column_id = $1, position = $2, updated_at = NOW() WHERE id = $3',
    [column_id, position ?? 0, taskId]
  );

  if (oldTask!.column_id !== column_id) {
    const [fromCol, toCol] = await Promise.all([
      queryOne<{ name: string }>('SELECT name FROM columns WHERE id = $1', [oldTask!.column_id]),
      queryOne<{ name: string }>('SELECT name FROM columns WHERE id = $1', [column_id]),
    ]);
    await logHistory(taskId, user.id, 'moved', 'column_id', fromCol?.name ?? '—', toCol?.name ?? '—');
  }

  // Reorder other tasks in target column
  if (position !== undefined) {
    await queryOne(
      `UPDATE tasks SET position = position + 1
       WHERE column_id = $1 AND id != $2 AND position >= $3`,
      [column_id, taskId, position]
    );
  }

  res.json(await getFullTask(taskId));
});

// Set a custom field value
router.put('/:taskId/custom-values/:fieldId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId, fieldId } = req.params;
  const { value } = req.body;
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  if (user.role !== 'admin') {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member || member.role === 'viewer') return res.status(403).json({ error: 'No permission' });
  }

  // Validate field belongs to this project
  const field = await queryOne<any>('SELECT id FROM project_custom_fields WHERE id = $1 AND project_id = $2', [fieldId, projectId]);
  if (!field) return res.status(404).json({ error: 'Field not found' });

  if (value === null || value === '') {
    await queryOne('DELETE FROM task_custom_values WHERE task_id = $1 AND field_id = $2', [taskId, fieldId]);
  } else {
    await queryOne(
      `INSERT INTO task_custom_values (task_id, field_id, value) VALUES ($1, $2, $3)
       ON CONFLICT (task_id, field_id) DO UPDATE SET value = $3`,
      [taskId, fieldId, String(value)]
    );
  }
  res.json(await getFullTask(taskId));
});

// Set hidden custom fields for a task (per-task visibility)
router.patch('/:taskId/hidden-fields', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const { hidden } = req.body as { hidden: string[] };
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  if (user.role !== 'admin') {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member || member.role === 'viewer') return res.status(403).json({ error: 'No permission' });
  }

  await queryOne('UPDATE tasks SET hidden_custom_fields = $1 WHERE id = $2', [JSON.stringify(Array.isArray(hidden) ? hidden : []), taskId]);
  res.json(await getFullTask(taskId));
});

// Mark task completed / reopened
router.patch('/:taskId/complete', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const { completed } = req.body as { completed: boolean };
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  if (user.role !== 'admin') {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member || member.role === 'viewer') return res.status(403).json({ error: 'No permission' });
  }

  // Find the board of this task
  const boardRow = await queryOne<{ id: string; completed_column_id: string | null }>(
    `SELECT b.id, b.completed_column_id FROM tasks t
     JOIN columns c ON c.id = t.column_id
     JOIN boards b ON b.id = c.board_id
     WHERE t.id = $1`,
    [taskId]
  );
  if (!boardRow) return res.status(404).json({ error: 'Board not found' });

  if (completed) {
    let completedColumnId = boardRow.completed_column_id;
    // Auto-create "Выполнено" column on first completion
    if (!completedColumnId) {
      const maxPos = await queryOne<{ max: string }>('SELECT MAX(position) as max FROM columns WHERE board_id = $1', [boardRow.id]);
      const position = parseInt(maxPos?.max || '-1') + 1;
      const col = await queryOne<any>(
        'INSERT INTO columns (board_id, name, position, color) VALUES ($1, $2, $3, $4) RETURNING *',
        [boardRow.id, 'Выполнено', position, '#10b981']
      );
      completedColumnId = col!.id;
      await queryOne('UPDATE boards SET completed_column_id = $1 WHERE id = $2', [completedColumnId, boardRow.id]);
    }
    const maxPos = await queryOne<{ max: string }>('SELECT MAX(position) as max FROM tasks WHERE column_id = $1', [completedColumnId]);
    const position = parseInt(maxPos?.max || '-1') + 1;
    await queryOne(
      'UPDATE tasks SET is_completed = TRUE, completed_at = NOW(), column_id = $1, position = $2, updated_at = NOW() WHERE id = $3',
      [completedColumnId, position, taskId]
    );
    await logHistory(taskId, user.id, 'completed');
  } else {
    await queryOne('UPDATE tasks SET is_completed = FALSE, completed_at = NULL, updated_at = NOW() WHERE id = $1', [taskId]);
    await logHistory(taskId, user.id, 'reopened');
  }
  res.json(await getFullTask(taskId));
});

// Subtasks
router.post('/:taskId/subtasks', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  if (user.role !== 'admin') {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member || member.role === 'viewer') return res.status(403).json({ error: 'No permission' });
  }

  const maxPos = await queryOne<{ max: string }>('SELECT MAX(position) as max FROM subtasks WHERE task_id = $1', [taskId]);
  const position = parseInt(maxPos?.max || '-1') + 1;
  const subtask = await queryOne<any>(
    'INSERT INTO subtasks (task_id, title, position) VALUES ($1, $2, $3) RETURNING *',
    [taskId, title.trim(), position]
  );
  res.status(201).json(subtask);
});

router.patch('/:taskId/subtasks/:subtaskId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId, subtaskId } = req.params;
  const { title, is_done } = req.body;
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  if (user.role !== 'admin') {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member || member.role === 'viewer') return res.status(403).json({ error: 'No permission' });
  }

  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (title !== undefined) { updates.push(`title = $${i++}`); params.push(title); }
  if (is_done !== undefined) { updates.push(`is_done = $${i++}`); params.push(is_done); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(subtaskId, taskId);
  const subtask = await queryOne<any>(
    `UPDATE subtasks SET ${updates.join(', ')} WHERE id = $${i++} AND task_id = $${i} RETURNING *`,
    params
  );
  if (!subtask) return res.status(404).json({ error: 'Subtask not found' });
  res.json(subtask);
});

router.delete('/:taskId/subtasks/:subtaskId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId, subtaskId } = req.params;
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  if (user.role !== 'admin') {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member || member.role === 'viewer') return res.status(403).json({ error: 'No permission' });
  }

  await queryOne('DELETE FROM subtasks WHERE id = $1 AND task_id = $2', [subtaskId, taskId]);
  res.json({ ok: true });
});

// Delete task
router.delete('/:taskId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: 'Task not found' });

  const user = (req as AuthRequest).user!;
  if (user.role !== 'admin') {
    const member = await queryOne<{ role: string }>('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.id]);
    if (!member || !['admin', 'manager'].includes(member.role)) {
      return res.status(403).json({ error: 'No permission to delete tasks' });
    }
  }

  await queryOne('DELETE FROM tasks WHERE id = $1', [taskId]);
  res.json({ ok: true });
});

// Tags
router.post('/:taskId/tags', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const { name, color = '#6366f1' } = req.body;
  if (!name) return res.status(400).json({ error: 'Tag name required' });

  const tag = await queryOne<any>(
    'INSERT INTO task_tags (task_id, name, color) VALUES ($1, $2, $3) RETURNING *',
    [taskId, name, color]
  );
  const user = (req as AuthRequest).user!;
  await logHistory(taskId, user.id, 'tag_added', 'tags', null, name);
  res.status(201).json(tag);
});

router.delete('/:taskId/tags/:tagId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId, tagId } = req.params;
  const tag = await queryOne<any>('DELETE FROM task_tags WHERE id = $1 AND task_id = $2 RETURNING *', [tagId, taskId]);
  if (tag) {
    const user = (req as AuthRequest).user!;
    await logHistory(taskId, user.id, 'tag_removed', 'tags', tag.name, null);
  }
  res.json({ ok: true });
});

// Assignees
router.post('/:taskId/assignees', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const { user_id } = req.body;
  await queryOne(
    'INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [taskId, user_id]
  );
  const user = (req as AuthRequest).user!;
  const assignee = await queryOne<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [user_id]);
  await logHistory(taskId, user.id, 'assignee_added', 'assignees', null, assignee?.full_name ?? user_id);
  res.json({ ok: true });
});

router.delete('/:taskId/assignees/:userId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId, userId } = req.params;
  await queryOne('DELETE FROM task_assignees WHERE task_id = $1 AND user_id = $2', [taskId, userId]);
  const user = (req as AuthRequest).user!;
  const assignee = await queryOne<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [userId]);
  await logHistory(taskId, user.id, 'assignee_removed', 'assignees', assignee?.full_name ?? userId, null);
  res.json({ ok: true });
});

// Comments
router.get('/:taskId/comments', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const comments = await query<any>(
    `SELECT tc.*, u.full_name, u.avatar_color FROM task_comments tc
     JOIN users u ON u.id = tc.user_id
     WHERE tc.task_id = $1 ORDER BY tc.created_at ASC`,
    [taskId]
  );
  res.json(comments);
});

router.post('/:taskId/comments', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });

  const user = (req as AuthRequest).user!;
  const comment = await queryOne<any>(
    `INSERT INTO task_comments (task_id, user_id, content) VALUES ($1, $2, $3)
     RETURNING *, (SELECT full_name FROM users WHERE id = $2) as full_name,
                 (SELECT avatar_color FROM users WHERE id = $2) as avatar_color`,
    [taskId, user.id, content]
  );
  await logHistory(taskId, user.id, 'comment_added');
  res.status(201).json(comment);
});

router.patch('/:taskId/comments/:commentId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId, commentId } = req.params;
  const { content } = req.body;
  const user = (req as AuthRequest).user!;
  const comment = await queryOne<any>(
    `UPDATE task_comments SET content = $1, updated_at = NOW()
     WHERE id = $2 AND task_id = $3 AND user_id = $4
     RETURNING *, (SELECT full_name FROM users WHERE id = $4) as full_name,
                 (SELECT avatar_color FROM users WHERE id = $4) as avatar_color`,
    [content, commentId, taskId, user.id]
  );
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  res.json(comment);
});

router.delete('/:taskId/comments/:commentId', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId, commentId } = req.params;
  const user = (req as AuthRequest).user!;
  await queryOne(
    'DELETE FROM task_comments WHERE id = $1 AND task_id = $2 AND user_id = $3',
    [commentId, taskId, user.id]
  );
  res.json({ ok: true });
});

// History
router.get('/:taskId/history', authenticate, async (req: ProjectRequest, res: Response) => {
  const { taskId } = req.params;
  const history = await query<any>(
    `SELECT th.*, u.full_name, u.avatar_color FROM task_history th
     LEFT JOIN users u ON u.id = th.user_id
     WHERE th.task_id = $1 ORDER BY th.created_at DESC`,
    [taskId]
  );
  res.json(history);
});

export default router;
