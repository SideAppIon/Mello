import { useState, useEffect } from 'react';
import { Task, Comment, HistoryEntry, PRIORITY_LABELS, ROLE_LABELS, Tag } from '../types';
import { tasksApi } from '../api/client';
import { useBoardStore } from '../store/board';
import { useAuthStore } from '../store/auth';
import { projectsApi } from '../api/client';
import Modal from './Modal';
import Avatar from './Avatar';
import PriorityBadge from './PriorityBadge';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const TAG_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

function HistoryAction({ entry }: { entry: HistoryEntry }) {
  const actionLabels: Record<string, string> = {
    created: 'создал задачу',
    updated: 'изменил',
    moved: 'переместил задачу',
    tag_added: 'добавил тег',
    tag_removed: 'удалил тег',
    assignee_added: 'назначил исполнителя',
    assignee_removed: 'снял исполнителя',
    comment_added: 'добавил комментарий',
  };
  const fieldLabels: Record<string, string> = {
    title: 'название', description: 'описание', priority: 'приоритет',
    deadline: 'дедлайн', estimated_hours: 'оцениваемое время', column_id: 'колонку',
  };

  return (
    <div className="flex gap-2.5 text-sm">
      <Avatar name={entry.full_name || '?'} color={entry.avatar_color || '#94a3b8'} size="sm" className="mt-0.5 flex-shrink-0" />
      <div>
        <span className="font-medium text-gray-800">{entry.full_name || 'Система'}</span>
        {' '}
        <span className="text-gray-500">{actionLabels[entry.action] || entry.action}</span>
        {entry.field_name && <span className="text-gray-500"> «{fieldLabels[entry.field_name] || entry.field_name}»</span>}
        {entry.old_value && entry.new_value && (
          <span className="text-gray-400"> с «{entry.old_value}» на «{entry.new_value}»</span>
        )}
        {!entry.old_value && entry.new_value && (
          <span className="text-gray-400"> «{entry.new_value}»</span>
        )}
        <div className="text-xs text-gray-400 mt-0.5">{format(new Date(entry.created_at), 'd MMM, HH:mm', { locale: ru })}</div>
      </div>
    </div>
  );
}

export default function TaskModal() {
  const { taskModal, closeTaskModal, updateTask, patchTaskLocal, deleteTask, board } = useBoardStore();
  const { user } = useAuthStore();
  const task = taskModal;

  const [tab, setTab] = useState<'details' | 'comments' | 'history'>('details');
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<any>({});
  const [newTag, setNewTag] = useState({ name: '', color: TAG_COLORS[0] });
  const [addingTag, setAddingTag] = useState(false);
  const [savingField, setSavingField] = useState(false);

  const myRole = board?.my_role || 'viewer';
  const canEdit = ['admin', 'manager', 'member'].includes(myRole);

  useEffect(() => {
    if (!task) return;
    setFieldValues({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      deadline: task.deadline ? task.deadline.substring(0, 10) : '',
      estimated_hours: task.estimated_hours || '',
    });
  }, [task]);

  useEffect(() => {
    if (!task) return;
    if (tab === 'comments') tasksApi.getComments(task.id).then(setComments);
    if (tab === 'history') tasksApi.getHistory(task.id).then(setHistory);
  }, [task, tab]);

  if (!task) return null;

  const saveField = async (field: string) => {
    setSavingField(true);
    try {
      const value = fieldValues[field];
      const payload: any = {};
      if (field === 'priority') payload.priority = parseInt(value);
      else if (field === 'estimated_hours') payload.estimated_hours = value ? parseFloat(value) : null;
      else if (field === 'deadline') payload.deadline = value || null;
      else payload[field] = value;
      await updateTask(task.id, payload);
    } finally {
      setSavingField(false);
      setEditingField(null);
    }
  };

  const submitComment = async () => {
    if (!newComment.trim()) return;
    const c = await tasksApi.addComment(task.id, newComment.trim());
    setComments(prev => [...prev, c]);
    setNewComment('');
  };

  const addTag = async () => {
    if (!newTag.name.trim()) return;
    const tag = await tasksApi.addTag(task.id, newTag);
    patchTaskLocal(task.id, { tags: [...task.tags, tag] });
    setNewTag({ name: '', color: TAG_COLORS[0] });
    setAddingTag(false);
  };

  const removeTag = async (tagId: string) => {
    await tasksApi.removeTag(task.id, tagId);
    patchTaskLocal(task.id, { tags: task.tags.filter(t => t.id !== tagId) });
  };

  const members = board ? (
    // collect unique members from all columns tasks assignees — use project members if available
    Array.from(new Map(
      board.columns.flatMap(c => c.tasks.flatMap(t => t.assignees)).map(a => [a.id, a])
    ).values())
  ) : [];

  const handleDelete = async () => {
    if (!confirm('Удалить задачу?')) return;
    await deleteTask(task.id);
  };

  return (
    <Modal onClose={closeTaskModal} size="2xl">
      <div className="flex h-full">
        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-100">
            {editingField === 'title' ? (
              <input
                autoFocus
                value={fieldValues.title}
                onChange={e => setFieldValues((v: any) => ({ ...v, title: e.target.value }))}
                onBlur={() => saveField('title')}
                onKeyDown={e => { if (e.key === 'Enter') saveField('title'); if (e.key === 'Escape') setEditingField(null); }}
                className="w-full text-xl font-bold text-gray-900 border-b-2 border-brand-500 focus:outline-none bg-transparent"
              />
            ) : (
              <h1
                className={`text-xl font-bold text-gray-900 ${canEdit ? 'cursor-pointer hover:text-brand-600' : ''}`}
                onClick={() => canEdit && setEditingField('title')}
              >
                {task.title}
              </h1>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
              <span>Создана {format(new Date(task.created_at), 'd MMM yyyy', { locale: ru })}</span>
              {task.created_by_name && <span>· {task.created_by_name}</span>}
              <div className="flex-1" />
              <PriorityBadge priority={task.priority} size="sm" />
              {canEdit && (
                <button onClick={handleDelete} className="text-red-400 hover:text-red-600 transition-colors p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-6">
            {(['details', 'comments', 'history'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {t === 'details' ? 'Детали' : t === 'comments' ? 'Комментарии' : 'История'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {tab === 'details' && (
              <div className="space-y-4">
                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Описание</label>
                  {editingField === 'description' ? (
                    <textarea
                      autoFocus
                      value={fieldValues.description}
                      onChange={e => setFieldValues((v: any) => ({ ...v, description: e.target.value }))}
                      onBlur={() => saveField('description')}
                      className="mt-1 w-full text-sm border border-brand-500 rounded-lg px-3 py-2 focus:outline-none resize-none"
                      rows={4}
                    />
                  ) : (
                    <p
                      className={`mt-1 text-sm text-gray-600 min-h-[2.5rem] rounded-lg p-2 -mx-2 ${canEdit ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={() => canEdit && setEditingField('description')}
                    >
                      {task.description || <span className="text-gray-300 italic">Нет описания. Нажмите чтобы добавить...</span>}
                    </p>
                  )}
                </div>

                {/* Tags */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Теги</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {task.tags.map(tag => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                      >
                        {tag.name}
                        {canEdit && (
                          <button onClick={() => removeTag(tag.id)} className="hover:opacity-60">×</button>
                        )}
                      </span>
                    ))}
                    {canEdit && (
                      addingTag ? (
                        <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                          <div className="flex gap-1">
                            {TAG_COLORS.map(c => (
                              <button
                                key={c}
                                onClick={() => setNewTag(v => ({ ...v, color: c }))}
                                className={`w-4 h-4 rounded-full transition-transform ${newTag.color === c ? 'scale-125 ring-2 ring-offset-1' : ''}`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <input
                            autoFocus
                            value={newTag.name}
                            onChange={e => setNewTag(v => ({ ...v, name: e.target.value }))}
                            placeholder="Название тега"
                            className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none w-28"
                            onKeyDown={e => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setAddingTag(false); }}
                          />
                          <button onClick={addTag} className="text-xs text-brand-600 font-medium">ОК</button>
                          <button onClick={() => setAddingTag(false)} className="text-xs text-gray-400">×</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingTag(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-gray-400 border border-dashed border-gray-300 hover:border-brand-400 hover:text-brand-600 transition-colors"
                        >
                          + Тег
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === 'comments' && (
              <div className="space-y-4">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar name={c.full_name} color={c.avatar_color} size="sm" className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{c.full_name}</span>
                        <span className="text-xs text-gray-400">{format(new Date(c.created_at), 'd MMM, HH:mm', { locale: ru })}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 bg-gray-50 rounded-xl px-3 py-2">{c.content}</p>
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">Комментариев пока нет</p>
                )}
                <div className="flex gap-3 pt-2 border-t border-gray-100">
                  <Avatar name={user?.full_name || '?'} color={user?.avatar_color || '#6366f1'} size="sm" className="flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <textarea
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder="Написать комментарий..."
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none"
                      rows={2}
                    />
                    <div className="flex justify-end mt-1">
                      <button
                        onClick={submitComment}
                        disabled={!newComment.trim()}
                        className="text-xs bg-brand-500 text-white px-4 py-1.5 rounded-lg hover:bg-brand-600 disabled:opacity-40 transition-colors"
                      >
                        Отправить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'history' && (
              <div className="space-y-4">
                {history.map(h => <HistoryAction key={h.id} entry={h} />)}
                {history.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">История пуста</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l border-gray-100 flex-shrink-0 overflow-y-auto px-4 py-5 space-y-5">
          {/* Priority */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Приоритет</label>
            {canEdit ? (
              <select
                value={fieldValues.priority}
                onChange={e => { setFieldValues((v: any) => ({ ...v, priority: e.target.value })); saveField('priority'); }}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                {[1, 2, 3, 4, 5].map(p => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p as keyof typeof PRIORITY_LABELS]}</option>
                ))}
              </select>
            ) : (
              <div className="mt-1"><PriorityBadge priority={task.priority} size="md" /></div>
            )}
          </div>

          {/* Deadline */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Дедлайн</label>
            {canEdit ? (
              <input
                type="date"
                value={fieldValues.deadline}
                onChange={e => setFieldValues((v: any) => ({ ...v, deadline: e.target.value }))}
                onBlur={() => saveField('deadline')}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-600">
                {task.deadline ? format(new Date(task.deadline), 'd MMMM yyyy', { locale: ru }) : '—'}
              </p>
            )}
          </div>

          {/* Estimated hours */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Оценка (часы)</label>
            {canEdit ? (
              <input
                type="number"
                step="0.5"
                min="0"
                value={fieldValues.estimated_hours}
                onChange={e => setFieldValues((v: any) => ({ ...v, estimated_hours: e.target.value }))}
                onBlur={() => saveField('estimated_hours')}
                placeholder="0"
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            ) : (
              <p className="mt-1 text-sm text-gray-600">{task.estimated_hours ? `${task.estimated_hours} ч` : '—'}</p>
            )}
          </div>

          {/* Assignees */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Исполнители</label>
            <div className="mt-2 space-y-2">
              {task.assignees.map(a => (
                <div key={a.id} className="flex items-center gap-2">
                  <Avatar name={a.full_name} color={a.avatar_color} size="sm" />
                  <span className="text-sm text-gray-700 flex-1 truncate">{a.full_name}</span>
                  {canEdit && (
                    <button
                      onClick={async () => {
                        await tasksApi.removeAssignee(task.id, a.id);
                        patchTaskLocal(task.id, { assignees: task.assignees.filter(x => x.id !== a.id) });
                      }}
                      className="text-gray-300 hover:text-red-400 text-sm"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {canEdit && board && (
                <AssigneeSelector task={task} />
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AssigneeSelector({ task }: { task: Task }) {
  const { patchTaskLocal, board } = useBoardStore();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !board) return;
    if (board.project_id) {
      projectsApi.get(board.project_id).then((p: any) => setMembers(p.members || [])).catch(() => {});
    }
  }, [open, board]);

  const assignedIds = new Set(task.assignees.map(a => a.id));

  const toggle = async (userId: string) => {
    if (assignedIds.has(userId)) {
      await tasksApi.removeAssignee(task.id, userId);
      patchTaskLocal(task.id, { assignees: task.assignees.filter(a => a.id !== userId) });
    } else {
      await tasksApi.addAssignee(task.id, userId);
      const member = members.find(m => m.id === userId);
      if (member) {
        patchTaskLocal(task.id, { assignees: [...task.assignees, { id: member.id, full_name: member.full_name, avatar_color: member.avatar_color }] });
      }
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Назначить
      </button>
      {open && (
        <div className="absolute left-0 top-6 bg-white rounded-xl shadow-lg border border-gray-100 py-1 w-48 z-20">
          {members.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">Загрузка...</p>}
          {members.map((m: any) => (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50"
            >
              <Avatar name={m.full_name} color={m.avatar_color} size="sm" />
              <span className="text-sm text-gray-700 flex-1 text-left truncate">{m.full_name}</span>
              {assignedIds.has(m.id) && (
                <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
