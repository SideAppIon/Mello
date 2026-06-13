import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors, DragOverlay, closestCorners,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useBoardStore } from '../store/board';
import { useAuthStore } from '../store/auth';
import Header from '../components/Header';
import BoardColumn from '../components/BoardColumn';
import TaskModal from '../components/TaskModal';
import { Task, Column } from '../types';
import TaskCard from '../components/TaskCard';

export const BOARD_BACKGROUNDS: { key: string; label: string; css: string; dark?: boolean }[] = [
  { key: 'default', label: 'Светлый', css: '#f9fafb' },
  { key: 'white', label: 'Белый', css: '#ffffff' },
  { key: 'mint', label: 'Мята', css: 'linear-gradient(135deg, #d1fae5, #f0fdfa)' },
  { key: 'sky', label: 'Небо', css: 'linear-gradient(135deg, #dbeafe, #eff6ff)' },
  { key: 'peach', label: 'Персик', css: 'linear-gradient(135deg, #fef3c7, #ffe4e6)' },
  { key: 'lavender', label: 'Лаванда', css: 'linear-gradient(135deg, #ede9fe, #fae8ff)' },
  { key: 'ocean', label: 'Океан', css: 'linear-gradient(135deg, #38bdf8, #6366f1)', dark: true },
  { key: 'graphite', label: 'Графит', css: 'linear-gradient(135deg, #1f2937, #374151)', dark: true },
];

export const COLUMN_STYLES: { key: string; label: string }[] = [
  { key: 'cards', label: 'Карточки' },
  { key: 'minimal', label: 'Минимал' },
  { key: 'glass', label: 'Стекло' },
];

export function getBackgroundCss(key: string): string {
  return (BOARD_BACKGROUNDS.find(b => b.key === key) || BOARD_BACKGROUNDS[0]).css;
}

export default function BoardPage() {
  const { projectId, boardId } = useParams<{ projectId: string; boardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { board, loading, loadBoard, addColumn, moveTask, reorderColumns, taskModal, openTaskModal,
    completedTasks, showCompleted, setShowCompleted, loadCompleted, setBoardStyle } = useBoardStore();
  const [addingColumn, setAddingColumn] = useState(false);
  const [colName, setColName] = useState('');
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [styleMenu, setStyleMenu] = useState(false);
  const currentUser = useAuthStore(s => s.user);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    if (projectId && boardId) loadBoard(projectId, boardId);
  }, [projectId, boardId]);

  // Открыть задачу из ссылки (?task=<id>) после загрузки доски
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || !board) return;
    const found = board.columns.flatMap(c => c.tasks).find(t => t.id === taskId);
    if (found) {
      openTaskModal(found);
      // убираем параметр из URL, чтобы не открывалось повторно
      searchParams.delete('task');
      setSearchParams(searchParams, { replace: true });
    }
  }, [board, searchParams]);

  const handleDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === 'task') {
      setActiveTask(e.active.data.current.task);
    }
  };

  const handleDragOver = (e: DragOverEvent) => {
    if (!board) return;
    const { active, over } = e;
    if (!over) return;

    const activeType = active.data.current?.type;
    if (activeType !== 'task') return;

    const draggedId = String(active.id);
    const overId = String(over.id);

    // Find target column
    let toColumnId = overId;
    if (!board.columns.find(c => c.id === overId)) {
      const col = board.columns.find(c => c.tasks.some(t => t.id === overId));
      if (col) toColumnId = col.id;
    }

    // Find task's CURRENT column from board state (not stale dnd-kit data)
    const currentCol = board.columns.find(c => c.tasks.some(t => t.id === draggedId));
    if (!currentCol || currentCol.id === toColumnId) return;

    const draggedTask = currentCol.tasks.find(t => t.id === draggedId)!;

    // Optimistic cross-column move without duplicates
    const newColumns = board.columns.map(col => {
      if (col.id === currentCol.id) {
        return { ...col, tasks: col.tasks.filter(t => t.id !== draggedId) };
      }
      if (col.id === toColumnId) {
        return { ...col, tasks: [...col.tasks, { ...draggedTask, column_id: toColumnId }] };
      }
      return col;
    });
    useBoardStore.setState({ board: { ...board, columns: newColumns } });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    if (!board) return;
    const { active, over } = e;
    if (!over) return;

    const activeType = active.data.current?.type;

    if (activeType === 'column') {
      const oldIndex = board.columns.findIndex(c => `col-${c.id}` === active.id);
      const newIndex = board.columns.findIndex(c => `col-${c.id}` === over.id);
      if (oldIndex !== newIndex && oldIndex !== -1 && newIndex !== -1) {
        const newCols = arrayMove(board.columns, oldIndex, newIndex);
        reorderColumns(board.id, newCols);
      }
      return;
    }

    if (activeType === 'task') {
      const draggedId = String(active.id);
      const overId = String(over.id);

      // Find task's CURRENT column from board state (handleDragOver may have already moved it)
      const fromCol = board.columns.find(c => c.tasks.some(t => t.id === draggedId));
      if (!fromCol) return;
      const task = fromCol.tasks.find(t => t.id === draggedId)!;

      let toColumnId = overId;
      let toIndex = 0;

      const isColumn = board.columns.find(c => c.id === overId);
      if (isColumn) {
        toColumnId = overId;
        toIndex = isColumn.tasks.length;
      } else {
        const col = board.columns.find(c => c.tasks.some(t => t.id === overId));
        if (col) {
          toColumnId = col.id;
          toIndex = col.tasks.findIndex(t => t.id === overId);
        }
      }

      moveTask(task.id, fromCol.id, toColumnId, toIndex);
    }
  };

  const submitAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!board || !colName.trim()) return;
    await addColumn(board.id, colName.trim());
    setColName('');
    setAddingColumn(false);
  };

  const myRole = board?.my_role || 'viewer';

  const displayColumns = board
    ? board.columns.map(col => {
        let tasks = col.tasks;
        if (showCompleted && col.id === board.completed_column_id) {
          tasks = [...tasks, ...completedTasks];
        }
        if (onlyMine && currentUser) {
          tasks = tasks.filter(t => t.assignees.some(a => a.id === currentUser.id));
        }
        return { ...col, tasks };
      })
    : [];

  const toggleCompleted = () => {
    const v = !showCompleted;
    setShowCompleted(v);
    if (v && projectId && boardId) loadCompleted(projectId, boardId);
  };

  if (loading || !board) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      {/* Board header */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Link to="/" className="hover:text-gray-600">Проекты</Link>
          <span>/</span>
          <Link to={`/projects/${projectId}`} className="hover:text-gray-600">Проект</Link>
          <span>/</span>
          <span className="text-gray-700 font-semibold">{board.name}</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={toggleCompleted}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border transition-colors ${
            showCompleted ? 'bg-green-500 text-white border-green-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showCompleted ? 'Скрыть выполненные' : 'Показать выполненные'}
        </button>
        {['admin', 'manager'].includes(myRole) && (
          <div className="relative">
            <button
              onClick={() => setStyleMenu(v => !v)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border text-gray-600 border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              Оформление
            </button>
            {styleMenu && (
              <div className="absolute right-0 top-10 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-64 z-30">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Фон доски</div>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {BOARD_BACKGROUNDS.map(bg => (
                    <button
                      key={bg.key}
                      onClick={() => setBoardStyle(board.id, { background: bg.key })}
                      title={bg.label}
                      className={`h-10 rounded-lg border-2 transition-transform hover:scale-105 ${board.background === bg.key ? 'border-brand-500' : 'border-transparent ring-1 ring-gray-200'}`}
                      style={{ background: bg.css }}
                    />
                  ))}
                </div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Стиль столбцов</div>
                <div className="flex gap-2">
                  {COLUMN_STYLES.map(cs => (
                    <button
                      key={cs.key}
                      onClick={() => setBoardStyle(board.id, { column_style: cs.key })}
                      className={`flex-1 text-xs py-2 rounded-lg border transition-colors ${board.column_style === cs.key ? 'bg-brand-500 text-white border-brand-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                      {cs.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => setOnlyMine(v => !v)}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border transition-colors ${
            onlyMine ? 'bg-brand-500 text-white border-brand-500' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Только мои задачи
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto" style={{ background: getBackgroundCss(board.background) }}>
        <div className="p-6 flex gap-4 min-w-max min-h-full items-start">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={board.columns.map(c => `col-${c.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              {displayColumns.map(col => (
                <BoardColumn key={col.id} column={col} projectId={projectId!} myRole={myRole} columnStyle={board.column_style} />
              ))}
            </SortableContext>

            <DragOverlay>
              {activeTask && <TaskCard task={activeTask} />}
            </DragOverlay>
          </DndContext>

          {/* Add column */}
          {['admin', 'manager'].includes(myRole) && (
            <div className="w-72 flex-shrink-0">
              {addingColumn ? (
                <form onSubmit={submitAddColumn} className="bg-white rounded-2xl border-2 border-brand-500/30 p-3">
                  <input
                    autoFocus
                    value={colName}
                    onChange={e => setColName(e.target.value)}
                    placeholder="Название столбца"
                    className="w-full text-sm font-semibold border border-brand-500 rounded-lg px-3 py-2 focus:outline-none"
                    onKeyDown={e => { if (e.key === 'Escape') { setAddingColumn(false); setColName(''); } }}
                  />
                  <div className="flex gap-2 mt-2">
                    <button type="submit" className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600">
                      Добавить
                    </button>
                    <button type="button" onClick={() => { setAddingColumn(false); setColName(''); }} className="text-xs text-gray-500 px-3 py-1.5">
                      Отмена
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setAddingColumn(true)}
                  className="w-full h-12 flex items-center gap-2 text-gray-400 hover:text-brand-600 border-2 border-dashed border-gray-200 hover:border-brand-400 rounded-2xl px-4 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm font-medium">Добавить столбец</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {taskModal && <TaskModal />}
    </div>
  );
}
