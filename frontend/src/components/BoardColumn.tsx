import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Column } from '../types';
import { useBoardStore } from '../store/board';
import TaskCard from './TaskCard';

interface Props {
  column: Column;
  projectId: string;
  myRole: string;
  columnStyle?: string;
}

const COLUMN_STYLE_CLASSES: Record<string, string> = {
  cards: 'bg-gray-50 rounded-2xl p-3',
  minimal: 'bg-transparent border-t-2 pt-3 px-1',
  glass: 'bg-white/60 backdrop-blur-sm rounded-2xl p-3 border border-white/40 shadow-sm',
  solid: 'bg-white rounded-2xl p-3 border border-gray-200',
  shadow: 'bg-white rounded-2xl p-3 shadow-md',
  divider: 'bg-transparent px-3 border-l border-gray-300/50',
  dashed: 'bg-transparent px-3 border-l-2 border-dashed border-gray-300/60',
};

function AddTaskForm({ columnId, onDone }: { columnId: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const { addTask } = useBoardStore();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await addTask(columnId, { title: title.trim() });
    setTitle('');
    onDone();
  };

  return (
    <form onSubmit={submit} className="mt-2">
      <textarea
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Название задачи..."
        className="w-full text-sm border border-brand-500 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        rows={2}
        onKeyDown={e => { if (e.key === 'Escape') onDone(); }}
      />
      <div className="flex gap-2 mt-1">
        <button type="submit" className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors">
          Добавить
        </button>
        <button type="button" onClick={onDone} className="text-xs text-gray-500 px-3 py-1.5 hover:text-gray-700">
          Отмена
        </button>
      </div>
    </form>
  );
}

const COLUMN_COLORS = ['#94a3b8', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

function ColumnHeader({ column, boardId, myRole }: { column: Column; boardId: string; myRole: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const { updateColumn, deleteColumn, setCompletedColumn, board } = useBoardStore();
  const [menu, setMenu] = useState(false);
  const canEdit = ['admin', 'manager', 'member'].includes(myRole);
  const canManage = ['admin', 'manager'].includes(myRole);
  const isCompletedColumn = board?.completed_column_id === column.id;

  const save = async () => {
    if (name.trim() && name !== column.name) {
      await updateColumn(boardId, column.id, { name: name.trim() });
    } else {
      setName(column.name);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setName(column.name); setEditing(false); } }}
          className="flex-1 text-sm font-semibold bg-transparent border-b border-brand-500 focus:outline-none"
        />
      ) : (
        <span
          className={`flex-1 text-sm font-semibold text-gray-700 truncate ${canEdit ? 'cursor-pointer hover:text-brand-600' : ''}`}
          onDoubleClick={() => canEdit && setEditing(true)}
        >
          {column.name}
        </span>
      )}
      <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{column.tasks.length}</span>
      {canEdit && (
        <div className="relative">
          <button
            onClick={() => setMenu(!menu)}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
            </svg>
          </button>
          {menu && (
            <div className="absolute right-0 top-6 bg-white rounded-lg shadow-lg border border-gray-100 py-1 w-44 z-10">
              <button
                onClick={() => { setEditing(true); setMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Переименовать
              </button>
              <div className="px-3 py-1.5">
                <div className="text-xs text-gray-400 mb-1.5">Цвет</div>
                <div className="flex flex-wrap gap-1.5">
                  {COLUMN_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => { updateColumn(boardId, column.id, { color: c }); }}
                      className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${column.color === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              {canManage && (
                <button
                  onClick={() => { setCompletedColumn(boardId, column.id); setMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 border-t border-gray-100 mt-1 flex items-center gap-2"
                >
                  <span className={`w-2 h-2 rounded-full ${isCompletedColumn ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {isCompletedColumn ? 'Столбец выполненных ✓' : 'Сделать выполненными'}
                </button>
              )}
              <button
                onClick={() => { if (confirm('Удалить столбец и все задачи?')) deleteColumn(boardId, column.id); setMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 border-t border-gray-100 mt-1"
              >
                Удалить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BoardColumn({ column, projectId, myRole, columnStyle = 'cards' }: Props) {
  const [addingTask, setAddingTask] = useState(false);
  const board = useBoardStore(s => s.board);
  const canAdd = ['admin', 'manager', 'member'].includes(myRole);

  const { setNodeRef: dropRef, isOver } = useDroppable({ id: column.id, data: { type: 'column' } });
  const { attributes, listeners, setNodeRef: dragRef, transform, transition, isDragging } = useSortable({
    id: `col-${column.id}`,
    data: { type: 'column', column },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={dragRef}
      style={style}
      className="flex-shrink-0 w-72 flex flex-col"
    >
      <div
        className={`mello-col ${COLUMN_STYLE_CLASSES[columnStyle] || COLUMN_STYLE_CLASSES.cards} flex flex-col h-full transition-colors ${isOver ? 'ring-2 ring-brand-500/40' : ''}`}
        style={columnStyle === 'minimal' ? { borderTopColor: column.color } : undefined}
        ref={dropRef}
      >
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <ColumnHeader column={column} boardId={board?.id || ''} myRole={myRole} />
        </div>

        <SortableContext items={column.tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2 flex-1 min-h-[2rem]">
            {column.tasks.map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </SortableContext>

        {canAdd && (
          addingTask ? (
            <AddTaskForm columnId={column.id} onDone={() => setAddingTask(false)} />
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              className="mt-2 flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand-600 transition-colors px-1 py-1 rounded-lg hover:bg-white/60"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить задачу
            </button>
          )
        )}
      </div>
    </div>
  );
}
