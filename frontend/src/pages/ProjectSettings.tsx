import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { projectsApi, companiesApi } from '../api/client';
import { Project, ProjectMember, ROLE_LABELS, TASK_FIELDS } from '../types';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';

const PROJECT_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

export default function ProjectSettings() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [companyMembers, setCompanyMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'permissions'>('general');
  const [showAddMember, setShowAddMember] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('member');
  const [form, setForm] = useState({ name: '', description: '', color: PROJECT_COLORS[0] });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    if (!projectId) return;
    const [p, cm] = await Promise.all([projectsApi.get(projectId), companiesApi.getMembers()]);
    setProject(p);
    setForm({ name: p.name, description: p.description || '', color: p.color || PROJECT_COLORS[0] });
    setCompanyMembers(cm);
  };

  const saveGeneral = async () => {
    if (!projectId || !form.name.trim()) return;
    setSaving(true);
    try {
      await projectsApi.update(projectId, { name: form.name.trim(), description: form.description, color: form.color });
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async () => {
    if (!projectId || !confirm('Удалить проект со всеми досками и задачами? Это необратимо.')) return;
    await projectsApi.delete(projectId);
    navigate('/');
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, [projectId]);

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-gray-50"><Header />
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const members = project.members || [];
  const memberIds = new Set(members.map(m => m.id));
  const availableToAdd = companyMembers.filter(m => !memberIds.has(m.id));

  const addMember = async () => {
    if (!projectId || !addUserId) return;
    await projectsApi.addMember(projectId, { user_id: addUserId, role: addRole });
    setShowAddMember(false);
    setAddUserId('');
    await load();
  };

  const updateMemberRole = async (userId: string, role: string) => {
    if (!projectId) return;
    await projectsApi.updateMember(projectId, userId, { role });
    await load();
  };

  const removeMember = async (userId: string) => {
    if (!projectId || !confirm('Удалить участника?')) return;
    await projectsApi.removeMember(projectId, userId);
    await load();
  };

  // Permissions matrix
  const perms = project.permissions || [];
  const getRoleFieldPerm = (role: string, field: string) => {
    const p = perms.find(x => x.role === role && x.field_name === field);
    return p?.can_edit !== false;
  };

  const togglePerm = async (role: string, field: string, current: boolean) => {
    if (!projectId) return;
    await projectsApi.setPermissions(projectId, [{ role, field_name: field, can_edit: !current }]);
    await load();
  };

  const roles = ['manager', 'member', 'viewer'];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link to="/" className="hover:text-gray-600">Проекты</Link>
          <span>/</span>
          <Link to={`/projects/${projectId}`} className="hover:text-gray-600">{project.name}</Link>
          <span>/</span>
          <span className="text-gray-700">Настройки</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Настройки проекта</h1>

        <div className="flex gap-1 mb-6 bg-white rounded-xl border border-gray-100 p-1 w-fit">
          {(['general', 'members', 'permissions'] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === t ? 'bg-brand-500 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {t === 'general' ? 'Общие' : t === 'members' ? 'Участники' : 'Права доступа'}
            </button>
          ))}
        </div>

        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Цвет</label>
                <div className="flex gap-2">
                  {PROJECT_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-xl transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={saveGeneral}
                  disabled={saving || !form.name.trim()}
                  className="bg-brand-500 text-white px-5 py-2 rounded-xl text-sm hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
                {saved && <span className="text-sm text-green-600">✓ Сохранено</span>}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-red-100 p-6">
              <h3 className="font-semibold text-gray-900">Опасная зона</h3>
              <p className="text-sm text-gray-500 mt-1 mb-4">Удаление проекта необратимо — будут удалены все доски, колонки и задачи.</p>
              <button
                onClick={deleteProject}
                className="bg-red-50 text-red-600 px-5 py-2 rounded-xl text-sm hover:bg-red-100 transition-colors font-medium"
              >
                Удалить проект
              </button>
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Участники проекта</h2>
              <button
                onClick={() => setShowAddMember(true)}
                className="text-sm bg-brand-500 text-white px-4 py-2 rounded-xl hover:bg-brand-600 transition-colors"
              >
                + Добавить
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {members.map(m => (
                <div key={m.id} className="flex items-center gap-4 px-6 py-3">
                  <Avatar name={m.full_name} color={m.avatar_color} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{m.full_name}</p>
                    <p className="text-sm text-gray-400">{m.email}</p>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {ROLE_LABELS[m.company_role]}
                  </span>
                  <select
                    value={m.project_role}
                    onChange={e => updateMemberRole(m.id, e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    <option value="admin">Админ</option>
                    <option value="manager">Менеджер</option>
                    <option value="member">Участник</option>
                    <option value="viewer">Наблюдатель</option>
                  </select>
                  <button
                    onClick={() => removeMember(m.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors text-sm px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Права редактирования полей</h2>
              <p className="text-sm text-gray-400 mt-0.5">Настройте какие роли могут редактировать поля задач</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Поле</th>
                    {roles.map(r => (
                      <th key={r} className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {ROLE_LABELS[r]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {TASK_FIELDS.map(field => (
                    <tr key={field.key}>
                      <td className="px-6 py-3 text-sm text-gray-700 font-medium">{field.label}</td>
                      {roles.map(role => {
                        const canEdit = getRoleFieldPerm(role, field.key);
                        return (
                          <td key={role} className="text-center px-4 py-3">
                            <button
                              onClick={() => togglePerm(role, field.key, canEdit)}
                              className={`w-10 h-6 rounded-full transition-colors relative ${canEdit ? 'bg-brand-500' : 'bg-gray-200'}`}
                            >
                              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${canEdit ? 'translate-x-5' : 'translate-x-1'}`} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showAddMember && (
        <Modal onClose={() => setShowAddMember(false)} title="Добавить участника" size="sm">
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пользователь</label>
              <select
                value={addUserId}
                onChange={e => setAddUserId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="">Выберите пользователя...</option>
                {availableToAdd.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name} ({m.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Роль в проекте</label>
              <select
                value={addRole}
                onChange={e => setAddRole(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="admin">Администратор</option>
                <option value="manager">Менеджер</option>
                <option value="member">Участник</option>
                <option value="viewer">Наблюдатель</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAddMember(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
                Отмена
              </button>
              <button onClick={addMember} disabled={!addUserId} className="flex-1 bg-brand-500 text-white py-2 rounded-xl text-sm hover:bg-brand-600 disabled:opacity-50 transition-colors">
                Добавить
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
