import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { projectsApi, boardsApi } from '../api/client';
import { Project, Board } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';
import { useAuthStore } from '../store/auth';

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [boardName, setBoardName] = useState('');
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!projectId) return;
    Promise.all([projectsApi.get(projectId), boardsApi.list(projectId)])
      .then(([p, b]) => { setProject(p); setBoards(b); })
      .finally(() => setLoading(false));
  }, [projectId]);

  const createBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !boardName.trim()) return;
    const board = await boardsApi.create(projectId, boardName.trim());
    setBoardName('');
    setShowCreateBoard(false);
    navigate(`/projects/${projectId}/boards/${board.id}`);
  };

  const myRole = project?.my_role || (user?.role === 'admin' ? 'admin' : 'viewer');
  const canManage = ['admin', 'manager'].includes(myRole);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link to="/" className="hover:text-gray-600">Проекты</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">{project.name}</span>
        </div>

        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${project.color}20` }}>
              <div className="w-5 h-5 rounded-md" style={{ backgroundColor: project.color }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {project.description && <p className="text-gray-500 mt-0.5">{project.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <Link
                to={`/projects/${projectId}/settings`}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-600 px-3 py-2 rounded-xl hover:bg-white border border-transparent hover:border-gray-200 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                </svg>
                Настройки
              </Link>
            )}
            {canManage && (
              <button
                onClick={() => setShowCreateBoard(true)}
                className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded-xl hover:bg-brand-600 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Новая доска
              </button>
            )}
          </div>
        </div>

        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Доски</h2>
        {boards.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">Нет досок</p>
            {canManage && (
              <button
                onClick={() => setShowCreateBoard(true)}
                className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                Создать первую доску →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map(board => (
              <Link
                key={board.id}
                to={`/projects/${projectId}/boards/${board.id}`}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 p-5 transition-all group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
                    <svg className="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">{board.name}</h3>
                </div>
                <p className="text-xs text-gray-400">Открыть доску →</p>
              </Link>
            ))}
          </div>
        )}
      </main>

      {showCreateBoard && (
        <Modal onClose={() => setShowCreateBoard(false)} title="Новая доска" size="sm">
          <form onSubmit={createBoard} className="p-6 space-y-4">
            <input
              autoFocus
              value={boardName}
              onChange={e => setBoardName(e.target.value)}
              placeholder="Название доски"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCreateBoard(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
                Отмена
              </button>
              <button type="submit" className="flex-1 bg-brand-500 text-white py-2 rounded-xl text-sm hover:bg-brand-600 transition-colors">
                Создать
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
