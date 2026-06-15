import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { projectsApi, companiesApi } from '../api/client';
import { Project } from '../types';
import Header from '../components/Header';
import Modal from '../components/Modal';

const PROJECT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

function SetupCompany() {
  const [mode, setMode] = useState<'choice' | 'create' | 'join'>('choice');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setCompany, loadMe } = useAuthStore();
  const navigate = useNavigate();

  const createCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const company = await companiesApi.create(name);
      setCompany(company);
      await loadMe();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const joinCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const company = await companiesApi.join(code);
      setCompany(company);
      await loadMe();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        {mode === 'choice' && (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Добро пожаловать в Mello!</h2>
            <p className="text-gray-500 mb-6">Присоединитесь к существующей компании или создайте свою</p>
            <div className="space-y-3">
              <button
                onClick={() => setMode('create')}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-brand-500 hover:bg-brand-50 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center group-hover:bg-brand-500 transition-colors">
                  <svg className="w-5 h-5 text-brand-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900">Создать компанию</p>
                  <p className="text-sm text-gray-500">Станьте администратором</p>
                </div>
              </button>
              <button
                onClick={() => setMode('join')}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-brand-500 hover:bg-brand-50 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center group-hover:bg-brand-500 transition-colors">
                  <svg className="w-5 h-5 text-brand-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-semibold text-gray-900">Присоединиться</p>
                  <p className="text-sm text-gray-500">Введите код приглашения</p>
                </div>
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <button onClick={() => setMode('choice')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
              ← Назад
            </button>
            <h2 className="text-xl font-bold text-gray-900 mb-6">Создать компанию</h2>
            <form onSubmit={createCompany} className="space-y-4">
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Название компании"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <button type="submit" disabled={loading} className="w-full bg-brand-500 text-white py-2.5 rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-60">
                {loading ? 'Создаём...' : 'Создать'}
              </button>
            </form>
          </>
        )}

        {mode === 'join' && (
          <>
            <button onClick={() => setMode('choice')} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Назад</button>
            <h2 className="text-xl font-bold text-gray-900 mb-6">Присоединиться к компании</h2>
            <form onSubmit={joinCompany} className="space-y-4">
              <input
                autoFocus
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Код приглашения (XXXXXXXX)"
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 uppercase tracking-widest font-mono"
              />
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <button type="submit" disabled={loading} className="w-full bg-brand-500 text-white py-2.5 rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-60">
                {loading ? 'Подключаемся...' : 'Присоединиться'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all p-5 group"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ backgroundColor: `${project.color}20` }}>
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: project.color }} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors truncate">{project.name}</h3>
          {project.description && <p className="text-sm text-gray-500 truncate">{project.description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span>{project.member_count} участн.</span>
        <span>{project.board_count} досок</span>
        {project.my_role && (
          <span className="ml-auto bg-gray-100 px-2 py-0.5 rounded-full text-gray-500">{project.my_role}</span>
        )}
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user, company, setCompany } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', color: PROJECT_COLORS[0] });
  const [error, setError] = useState('');

  // Если у пользователя есть компания, но объект не подгрузился (например, фоновый
  // запрос в loadMe сбойнул после простоя) — догружаем, не показывая «создать компанию»
  useEffect(() => {
    if (user?.company_id && !company) {
      companiesApi.getMy().then(setCompany).catch(() => {});
    }
  }, [user?.company_id, company]);

  useEffect(() => {
    if (!user?.company_id) return;
    projectsApi.list().then(setProjects).finally(() => setLoading(false));
  }, [user?.company_id]);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const p = await projectsApi.create(newProject);
      setProjects(prev => [p, ...prev]);
      setShowCreateProject(false);
      setNewProject({ name: '', description: '', color: PROJECT_COLORS[0] });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка');
    }
  };

  // «Создать компанию» — только если у пользователя реально нет компании
  if (!user?.company_id) return <SetupCompany />;
  // Компания есть, но объект ещё грузится — показываем спиннер, а не форму создания
  if (!company) {
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
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Проекты</h1>
            <p className="text-gray-500 mt-1">{company.name}</p>
          </div>
          {['admin', 'manager'].includes(user?.role || '') && (
            <button
              onClick={() => setShowCreateProject(true)}
              className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded-xl hover:bg-brand-600 transition-colors font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Новый проект
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl h-28 animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-gray-600 font-medium">Нет проектов</h3>
            <p className="text-gray-400 text-sm mt-1">
              {['admin', 'manager'].includes(user?.role || '') ? 'Создайте первый проект' : 'Ожидайте приглашения в проект'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </main>

      {showCreateProject && (
        <Modal onClose={() => setShowCreateProject(false)} title="Новый проект" size="sm">
          <form onSubmit={createProject} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
              <input
                autoFocus
                value={newProject.name}
                onChange={e => setNewProject(v => ({ ...v, name: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                placeholder="Название проекта"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
              <input
                value={newProject.description}
                onChange={e => setNewProject(v => ({ ...v, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                placeholder="Краткое описание..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Цвет</label>
              <div className="flex gap-2 flex-wrap">
                {PROJECT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewProject(v => ({ ...v, color: c }))}
                    className={`w-7 h-7 rounded-lg transition-transform ${newProject.color === c ? 'scale-125 ring-2 ring-offset-1' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {error && <div className="text-red-500 text-sm">{error}</div>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowCreateProject(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
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
