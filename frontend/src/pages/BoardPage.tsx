import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors, DragOverlay, closestCorners,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useBoardStore } from '../store/board';
import Header from '../components/Header';
import BoardColumn from '../components/BoardColumn';
import TaskModal from '../components/TaskModal';
import { Task, Column } from '../types';
import TaskCard from '../components/TaskCard';

export default function BoardPage() {
  const { projectId, boardId } = useParams<{ projectId: string; boardId: string }>();
  const { board, loading, loadBoard, addColumn, moveTask, reorderColumns, taskModal } = useBoardStore();
  const [addingColumn, setAddingColumn] = useState(false);
  const [colName, setColName] = useState('');
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    if (projectId && boardId) loadBoard(projectId, boardId);
  }, [projectId, boardId]);

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
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
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
              {board.columns.map(col => (
                <BoardColumn key={col.id} column={col} projectId={projectId!} myRole={myRole} />
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
