import { create } from 'zustand';
import { Column, Task, FullBoard } from '../types';
import { boardsApi, columnsApi, tasksApi } from '../api/client';

// Настройка «показывать выполненные» запоминается отдельно для каждой доски.
const showCompletedKey = (boardId: string) => `mello:showCompleted:${boardId}`;
const readShowCompleted = (boardId: string) => {
  try { return localStorage.getItem(showCompletedKey(boardId)) === '1'; } catch { return false; }
};
const writeShowCompleted = (boardId: string, v: boolean) => {
  try { localStorage.setItem(showCompletedKey(boardId), v ? '1' : '0'); } catch { /* ignore */ }
};

interface BoardState {
  board: FullBoard | null;
  loading: boolean;
  taskModal: Task | null;
  completedTasks: Task[];
  showCompleted: boolean;
  openTaskModal: (task: Task) => void;
  closeTaskModal: () => void;
  loadBoard: (projectId: string, boardId: string) => Promise<void>;
  loadCompleted: (projectId: string, boardId: string) => Promise<void>;
  setShowCompleted: (v: boolean) => void;
  completeTask: (taskId: string, completed: boolean) => Promise<void>;
  setCompletedColumn: (boardId: string, columnId: string) => Promise<void>;
  setBoardStyle: (boardId: string, data: { background?: string; column_style?: string }) => Promise<void>;
  addColumn: (boardId: string, name: string, color?: string) => Promise<void>;
  updateColumn: (boardId: string, columnId: string, data: any) => Promise<void>;
  deleteColumn: (boardId: string, columnId: string) => Promise<void>;
  addTask: (columnId: string, data: any) => Promise<Task>;
  updateTask: (taskId: string, data: any) => Promise<void>;
  patchTaskLocal: (taskId: string, patch: Partial<Task>) => void;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (taskId: string, fromColumnId: string, toColumnId: string, newPosition: number) => Promise<void>;
  reorderColumns: (boardId: string, newOrder: Column[]) => Promise<void>;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  board: null,
  loading: false,
  taskModal: null,
  completedTasks: [],
  showCompleted: false,

  openTaskModal: (task) => set({ taskModal: task }),
  closeTaskModal: () => set({ taskModal: null }),

  loadBoard: async (projectId, boardId) => {
    set({ loading: true });
    try {
      const board = await boardsApi.getFull(projectId, boardId);
      const showCompleted = readShowCompleted(boardId);
      set({ board, showCompleted });
      if (showCompleted) {
        const completedTasks = await boardsApi.getCompleted(projectId, boardId);
        set({ completedTasks });
      } else {
        set({ completedTasks: [] });
      }
    } finally {
      set({ loading: false });
    }
  },

  loadCompleted: async (projectId, boardId) => {
    const completedTasks = await boardsApi.getCompleted(projectId, boardId);
    set({ completedTasks });
  },

  setShowCompleted: (v) => {
    const b = get().board;
    if (b) writeShowCompleted(b.id, v);
    set({ showCompleted: v });
    if (!v) set({ completedTasks: [] });
  },

  completeTask: async (taskId, completed) => {
    const updated = await tasksApi.complete(taskId, completed);
    set((s) => ({ taskModal: s.taskModal?.id === taskId ? { ...s.taskModal, ...updated } : s.taskModal }));
    const board = get().board;
    if (board) await get().loadBoard(board.project_id, board.id);
  },

  setCompletedColumn: async (boardId, columnId) => {
    const board = get().board;
    if (!board) return;
    await boardsApi.update(board.project_id, boardId, { completed_column_id: columnId });
    set((s) => ({ board: s.board ? { ...s.board, completed_column_id: columnId } : s.board }));
  },

  setBoardStyle: async (boardId, data) => {
    const board = get().board;
    if (!board) return;
    set((s) => ({ board: s.board ? { ...s.board, ...data } : s.board }));
    await boardsApi.update(board.project_id, boardId, data);
  },

  addColumn: async (boardId, name, color) => {
    const col = await columnsApi.create(boardId, { name, color });
    set((s) => ({
      board: s.board ? { ...s.board, columns: [...s.board.columns, { ...col, tasks: [] }] } : s.board,
    }));
  },

  updateColumn: async (boardId, columnId, data) => {
    const updated = await columnsApi.update(boardId, columnId, data);
    set((s) => ({
      board: s.board
        ? { ...s.board, columns: s.board.columns.map(c => c.id === columnId ? { ...c, ...updated } : c) }
        : s.board,
    }));
  },

  deleteColumn: async (boardId, columnId) => {
    await columnsApi.delete(boardId, columnId);
    set((s) => ({
      board: s.board
        ? { ...s.board, columns: s.board.columns.filter(c => c.id !== columnId) }
        : s.board,
    }));
  },

  addTask: async (columnId, data) => {
    const task = await tasksApi.create(columnId, data);
    set((s) => ({
      board: s.board
        ? {
            ...s.board,
            columns: s.board.columns.map(c =>
              c.id === columnId ? { ...c, tasks: [...c.tasks, task] } : c
            ),
          }
        : s.board,
    }));
    return task;
  },

  updateTask: async (taskId, data) => {
    const updated = await tasksApi.update(taskId, data);
    set((s) => ({
      taskModal: s.taskModal?.id === taskId ? { ...s.taskModal, ...updated } : s.taskModal,
      board: s.board
        ? {
            ...s.board,
            columns: s.board.columns.map(c => ({
              ...c,
              tasks: c.tasks.map(t => t.id === taskId ? { ...t, ...updated } : t),
            })),
          }
        : s.board,
    }));
  },

  patchTaskLocal: (taskId, patch) => {
    set((s) => ({
      taskModal: s.taskModal?.id === taskId ? { ...s.taskModal, ...patch } : s.taskModal,
      board: s.board
        ? {
            ...s.board,
            columns: s.board.columns.map(c => ({
              ...c,
              tasks: c.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t),
            })),
          }
        : s.board,
    }));
  },

  deleteTask: async (taskId) => {
    await tasksApi.delete(taskId);
    set((s) => ({
      taskModal: s.taskModal?.id === taskId ? null : s.taskModal,
      board: s.board
        ? {
            ...s.board,
            columns: s.board.columns.map(c => ({
              ...c,
              tasks: c.tasks.filter(t => t.id !== taskId),
            })),
          }
        : s.board,
    }));
  },

  moveTask: async (taskId, fromColumnId, toColumnId, newPosition) => {
    // Optimistic update
    const board = get().board;
    if (!board) return;

    const fromCol = board.columns.find(c => c.id === fromColumnId);
    const task = fromCol?.tasks.find(t => t.id === taskId);
    if (!task) return;

    const newColumns = board.columns.map(col => {
      if (col.id === fromColumnId && col.id === toColumnId) {
        // Reorder within same column
        const tasks = col.tasks.filter(t => t.id !== taskId);
        tasks.splice(newPosition, 0, { ...task, position: newPosition });
        return { ...col, tasks: tasks.map((t, i) => ({ ...t, position: i })) };
      }
      if (col.id === fromColumnId) {
        return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
      }
      if (col.id === toColumnId) {
        const tasks = [...col.tasks.filter(t => t.id !== taskId)];
        tasks.splice(newPosition, 0, { ...task, column_id: toColumnId, position: newPosition });
        return { ...col, tasks: tasks.map((t, i) => ({ ...t, position: i })) };
      }
      return col;
    });
    set({ board: { ...board, columns: newColumns } });

    try {
      await tasksApi.move(taskId, toColumnId, newPosition);
      // Если задача уехала в столбец выполненных (или из него) — статус меняется на сервере,
      // перезагружаем доску, чтобы корректно скрыть/показать выполненную
      const completedId = board.completed_column_id;
      if (completedId && (toColumnId === completedId || fromColumnId === completedId)) {
        await get().loadBoard(board.project_id, board.id);
      }
    } catch {
      // Rollback
      set({ board });
    }
  },

  reorderColumns: async (boardId, newOrder) => {
    const prev = get().board;
    const cols = newOrder.map((c, i) => ({ ...c, position: i }));
    set((s) => ({ board: s.board ? { ...s.board, columns: cols } : s.board }));
    try {
      await columnsApi.reorder(boardId, cols.map(c => ({ id: c.id, position: c.position })));
    } catch {
      set({ board: prev });
    }
  },
}));
