import { create } from 'zustand';
import { User, Company } from '../types';
import { authApi, companiesApi } from '../api/client';

interface AuthState {
  user: User | null;
  company: Company | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; full_name: string; invite_code?: string }) => Promise<void>;
  logout: () => void;
  loadMe: () => Promise<void>;
  setCompany: (c: Company) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  company: null,
  token: localStorage.getItem('mello_token'),
  // Если токен есть — стартуем в loading, чтобы ProtectedRoute ждал проверку,
  // а не редиректил на /login до завершения loadMe()
  loading: !!localStorage.getItem('mello_token'),

  login: async (email, password) => {
    const { user, token } = await authApi.login(email, password);
    localStorage.setItem('mello_token', token);
    set({ user, token });
    if (user.company_id) {
      try {
        const company = await companiesApi.getMy();
        set({ company });
      } catch {}
    }
  },

  register: async (data) => {
    const { user, token } = await authApi.register(data);
    localStorage.setItem('mello_token', token);
    set({ user, token });
    if (user.company_id) {
      try {
        const company = await companiesApi.getMy();
        set({ company });
      } catch {}
    }
  },

  logout: () => {
    localStorage.removeItem('mello_token');
    set({ user: null, token: null, company: null });
  },

  loadMe: async () => {
    const token = localStorage.getItem('mello_token');
    if (!token) { set({ loading: false }); return; }
    set({ loading: true });
    try {
      const user = await authApi.me();
      // Снимаем loading сразу — приложение можно показывать,
      // компанию догружаем в фоне, чтобы её запрос не блокировал вход
      set({ user, loading: false });
      if (user.company_id) {
        companiesApi.getMy().then(company => set({ company })).catch(() => {});
      }
    } catch {
      localStorage.removeItem('mello_token');
      set({ user: null, token: null, loading: false });
    }
  },

  setCompany: (company) => set((s) => ({
    company,
    user: s.user ? { ...s.user, company_id: company.id } : s.user,
  })),
}));
