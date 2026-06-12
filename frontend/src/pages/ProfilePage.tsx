import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { authApi } from '../api/client';
import Header from '../components/Header';
import Avatar from '../components/Avatar';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6', '#f97316', '#84cc16'];

export default function ProfilePage() {
  const { user, loadMe } = useAuthStore();
  const [full_name, setFullName] = useState(user?.full_name || '');
  const [password, setPassword] = useState('');
  const [avatar_color, setAvatarColor] = useState(user?.avatar_color || '#6366f1');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data: any = { full_name, avatar_color };
      if (password) data.password = password;
      await authApi.updateMe(data);
      await loadMe();
      setPassword('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-lg mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Профиль</h1>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar name={full_name || user.full_name} color={avatar_color} size="lg" />
            <div>
              <p className="font-semibold text-gray-900">{user.full_name}</p>
              <p className="text-sm text-gray-400">{user.email}</p>
            </div>
          </div>

          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Полное имя</label>
              <input
                value={full_name}
                onChange={e => setFullName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Цвет аватара</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarColor(c)}
                    className={`w-8 h-8 rounded-full transition-transform ${avatar_color === c ? 'scale-125 ring-2 ring-offset-2' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Новый пароль <span className="text-gray-400 font-normal">(оставьте пустым чтобы не менять)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={8}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                placeholder="Минимум 8 символов"
              />
            </div>

            {success && (
              <div className="bg-green-50 text-green-600 text-sm px-4 py-2.5 rounded-xl">
                Профиль успешно обновлён!
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-brand-500 text-white py-2.5 rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-60 font-medium"
            >
              {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
