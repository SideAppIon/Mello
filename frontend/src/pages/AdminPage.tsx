import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { companiesApi } from '../api/client';
import { useAuthStore } from '../store/auth';
import { ROLE_LABELS } from '../types';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';

export default function AdminPage() {
  const { user, company } = useAuthStore();
  const navigate = useNavigate();
  const [members, setMembers] = useState<any[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'member' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pwUser, setPwUser] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone, setPwDone] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') { navigate('/'); return; }
    load();
  }, []);

  const load = () => companiesApi.getMembers().then(setMembers);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await companiesApi.createMember(form);
      setShowCreateUser(false);
      setForm({ email: '', password: '', full_name: '', role: 'member' });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (userId: string, is_active: boolean) => {
    await companiesApi.updateMember(userId, { is_active: !is_active });
    await load();
  };

  const changeRole = async (userId: string, role: string) => {
    await companiesApi.updateMember(userId, { role });
    await load();
  };

  const openPassword = (m: any) => {
    setPwUser(m);
    setNewPassword('');
    setPwError('');
    setPwDone(false);
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwUser) return;
    setPwError('');
    setPwSaving(true);
    try {
      await companiesApi.setMemberPassword(pwUser.id, newPassword);
      setPwDone(true);
      setTimeout(() => setPwUser(null), 1200);
    } catch (err: any) {
      setPwError(err.response?.data?.error || 'Ошибка');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Управление командой</h1>
            {company && (
              <div className="flex items-center gap-3 mt-2">
                <span className="text-gray-500">Компания: <strong>{company.name}</strong></span>
                <span className="text-sm text-gray-400">Код приглашения:</span>
                <code className="text-sm font-mono bg-brand-50 text-brand-600 px-3 py-1 rounded-lg font-bold tracking-widest">
                  {company.invite_code}
                </code>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowCreateUser(true)}
            className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded-xl hover:bg-brand-600 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Создать пользователя
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Пользователи компании</h2>
            <span className="text-sm text-gray-400">{members.length} участников</span>
          </div>
          <div className="divide-y divide-gray-50">
            {members.map(m => (
              <div key={m.id} className={`flex items-center gap-4 px-6 py-4 ${!m.is_active ? 'opacity-50' : ''}`}>
                <Avatar name={m.full_name} color={m.avatar_color} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{m.full_name}</p>
                    {!m.is_active && (
                      <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full">Деактивирован</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">{m.email}</p>
                </div>
                {m.id !== user?.id ? (
                  <>
                    <select
                      value={m.role}
                      onChange={e => changeRole(m.id, e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    >
                      <option value="admin">Администратор</option>
                      <option value="manager">Менеджер</option>
                      <option value="member">Участник</option>
                      <option value="viewer">Наблюдатель</option>
                    </select>
                    <button
                      onClick={() => openPassword(m)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Пароль
                    </button>
                    <button
                      onClick={() => toggleActive(m.id, m.is_active)}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                        m.is_active
                          ? 'border-red-200 text-red-500 hover:bg-red-50'
                          : 'border-green-200 text-green-500 hover:bg-green-50'
                      }`}
                    >
                      {m.is_active ? 'Деактивировать' : 'Активировать'}
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-gray-400 italic">Это вы</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      {showCreateUser && (
        <Modal onClose={() => setShowCreateUser(false)} title="Создать пользователя" size="sm">
          <form onSubmit={createUser} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Полное имя</label>
              <input
                autoFocus
                value={form.full_name}
                onChange={e => setForm(v => ({ ...v, full_name: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                placeholder="Иван Иванов"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(v => ({ ...v, email: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(v => ({ ...v, password: e.target.value }))}
                required
                minLength={8}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Роль</label>
              <select
                value={form.role}
                onChange={e => setForm(v => ({ ...v, role: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="admin">Администратор</option>
                <option value="manager">Менеджер</option>
                <option value="member">Участник</option>
                <option value="viewer">Наблюдатель</option>
              </select>
            </div>
            {error && <div className="text-red-500 text-sm">{error}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCreateUser(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
                Отмена
              </button>
              <button type="submit" disabled={loading} className="flex-1 bg-brand-500 text-white py-2 rounded-xl text-sm hover:bg-brand-600 disabled:opacity-60 transition-colors">
                {loading ? 'Создаём...' : 'Создать'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {pwUser && (
        <Modal onClose={() => setPwUser(null)} title={`Новый пароль — ${pwUser.full_name}`} size="sm">
          <form onSubmit={savePassword} className="p-6 space-y-4">
            <p className="text-sm text-gray-500">Задайте новый пароль для <strong>{pwUser.email}</strong>. Сотрудник сможет войти с ним сразу.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Новый пароль</label>
              <input
                autoFocus
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                placeholder="Минимум 6 символов"
              />
            </div>
            {pwError && <div className="text-red-500 text-sm">{pwError}</div>}
            {pwDone && <div className="text-green-600 text-sm">✓ Пароль изменён</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setPwUser(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
                Отмена
              </button>
              <button type="submit" disabled={pwSaving || newPassword.length < 6} className="flex-1 bg-brand-500 text-white py-2 rounded-xl text-sm hover:bg-brand-600 disabled:opacity-60 transition-colors">
                {pwSaving ? 'Сохраняем...' : 'Сменить пароль'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
