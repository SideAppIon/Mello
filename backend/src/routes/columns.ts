import { Router, Response } from 'express';
import { query, queryOne, insertOne } from '../db';
import { authenticate } from '../middleware/auth';
import { requireProjectAccess, requireProjectRole, ProjectRequest } from '../middleware/projectAccess';

const router = Router({ mergeParams: true });

async function getBoardProjectId(boardId: string): Promise<string | null> {
  const board = await queryOne<{ project_id: string }>('SELECT project_id FROM boards WHERE id = $1', [boardId]);
  return board?.project_id || null;
}

// Middleware to get projectId from boardId
async function resolveBoard(req: ProjectRequest, res: Response, next: Function) {
  const boardId = req.params.boardId;
  if (!boardId) return res.status(400).json({ error: 'boardId required' });
  const projectId = await getBoardProjectId(boardId);
  if (!projectId) return res.status(404).json({ error: 'Board not found' });
  req.params.projectId = projectId;
  next();
}

// Reorder columns — ВАЖНО: объявляется до '/:columnId', иначе PATCH /reorder
// попадёт в обработчик '/:columnId' (columnId="reorder") и вернёт 400.
router.patch('/reorder', authenticate, resolveBoard as any, requireProjectAccess, requireProjectRole('admin', 'manager', 'member'), async (req: ProjectRequest, res: Response) => {
  const { boardId } = req.params;
  const { columns } = req.body as { columns: { id: string; position: number }[] };
  if (!Array.isArray(columns)) return res.status(400).json({ error: 'columns array required' });
  for (const col of columns) {
    await queryOne('UPDATE columns SET position = $1 WHERE id = $2 AND board_id = $3', [col.position, col.id, boardId]);
  }
  res.json({ ok: true });
});

router.post('/', authenticate, resolveBoard as any, requireProjectAccess, requireProjectRole('admin', 'manager', 'member'), async (req: ProjectRequest, res: Response) => {
  const { boardId } = req.params;
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Column name required' });

  const maxPos = await queryOne<{ max: string }>('SELECT MAX(position) as max FROM columns WHERE board_id = $1', [boardId]);
  const position = (parseInt(maxPos?.max || '-1') + 1);

  const col = await insertOne<any>('columns', {
    board_id: boardId,
    name,
    position,
    color: color || '#94a3b8',
  });
  res.status(201).json(col);
});

router.patch('/:columnId', authenticate, resolveBoard as any, requireProjectAccess, requireProjectRole('admin', 'manager', 'member'), async (req: ProjectRequest, res: Response) => {
  const { columnId } = req.params;
  const { name, color } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (name) { updates.push(`name = $${i++}`); params.push(name); }
  if (color) { updates.push(`color = $${i++}`); params.push(color); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(columnId);
  await query(`UPDATE columns SET ${updates.join(', ')} WHERE id = $${i}`, params);
  const col = await queryOne<any>('SELECT * FROM columns WHERE id = $1', [columnId]);
  res.json(col);
});

router.delete('/:columnId', authenticate, resolveBoard as any, requireProjectAccess, requireProjectRole('admin', 'manager'), async (req: ProjectRequest, res: Response) => {
  const { columnId } = req.params;
  await queryOne('DELETE FROM columns WHERE id = $1', [columnId]);
  res.json({ ok: true });
});

export default router;
