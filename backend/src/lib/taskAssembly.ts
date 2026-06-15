import { query } from '../db';

// MySQL 8 не умеет json_agg(DISTINCT ...) FILTER (WHERE ...) / json_object_agg,
// как PostgreSQL. Поэтому связанные данные (теги, исполнители, кастомные значения,
// подзадачи, вложения) подгружаются отдельными запросами и склеиваются в Node —
// надёжнее и без дублей от JOIN-ов.
interface Opts {
  attachments?: boolean; // вложить полные строки вложений (поле attachments)
  attachmentCount?: boolean; // вложить только количество (поле attachment_count)
  assigneeEmail?: boolean; // включить email исполнителя
}

function groupBy<T extends { task_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const arr = m.get(r.task_id);
    if (arr) arr.push(r);
    else m.set(r.task_id, [r]);
  }
  return m;
}

const stripTaskId = (rows: any[]) => rows.map(({ task_id, ...rest }) => rest);

export async function assembleTasks(tasks: any[], opts: Opts = {}): Promise<any[]> {
  if (tasks.length === 0) return tasks;
  const ids = tasks.map((t) => t.id);
  const ph = ids.map(() => '?').join(', ');

  const tagRows = await query<any>(
    `SELECT task_id, id, name, color FROM task_tags WHERE task_id IN (${ph})`,
    ids
  );
  const assigneeRows = await query<any>(
    `SELECT ta.task_id, u.id, u.full_name, u.avatar_color${opts.assigneeEmail ? ', u.email' : ''}
     FROM task_assignees ta JOIN users u ON u.id = ta.user_id
     WHERE ta.task_id IN (${ph})`,
    ids
  );
  const cvRows = await query<any>(
    `SELECT task_id, field_id, value FROM task_custom_values WHERE task_id IN (${ph})`,
    ids
  );
  const subRows = await query<any>(
    `SELECT * FROM subtasks WHERE task_id IN (${ph}) ORDER BY position ASC, created_at ASC`,
    ids
  );
  const attRows = opts.attachments
    ? await query<any>(
        `SELECT * FROM attachments WHERE task_id IN (${ph}) AND comment_id IS NULL ORDER BY created_at ASC`,
        ids
      )
    : [];
  const countRows = opts.attachmentCount
    ? await query<any>(
        `SELECT task_id, COUNT(*) AS attachment_count FROM attachments WHERE task_id IN (${ph}) GROUP BY task_id`,
        ids
      )
    : [];

  const tagsBy = groupBy(tagRows);
  const assigneesBy = groupBy(assigneeRows);
  const cvBy = groupBy(cvRows);
  const subsBy = groupBy(subRows);
  const attBy = groupBy(attRows);
  const countBy = new Map(countRows.map((r: any) => [r.task_id, Number(r.attachment_count)]));

  for (const t of tasks) {
    t.tags = stripTaskId(tagsBy.get(t.id) || []);
    t.assignees = stripTaskId(assigneesBy.get(t.id) || []);
    t.custom_values = Object.fromEntries((cvBy.get(t.id) || []).map((r: any) => [r.field_id, r.value]));
    t.subtasks = subsBy.get(t.id) || [];
    if (opts.attachments) t.attachments = attBy.get(t.id) || [];
    if (opts.attachmentCount) t.attachment_count = countBy.get(t.id) ?? 0;
  }
  return tasks;
}
