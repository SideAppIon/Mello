import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mello_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mello_token');
      window.location.href = '/Mello/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  register: (data: { email: string; password: string; full_name: string; invite_code?: string }) =>
    api.post('/auth/register', data).then(r => r.data),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  updateMe: (data: any) => api.patch('/auth/me', data).then(r => r.data),
};

// Companies
export const companiesApi = {
  create: (name: string) => api.post('/companies', { name }).then(r => r.data),
  getMy: () => api.get('/companies/my').then(r => r.data),
  join: (invite_code: string) => api.post('/companies/join', { invite_code }).then(r => r.data),
  getMembers: () => api.get('/companies/members').then(r => r.data),
  createMember: (data: any) => api.post('/companies/members', data).then(r => r.data),
  updateMember: (userId: string, data: any) => api.patch(`/companies/members/${userId}`, data).then(r => r.data),
  setMemberPassword: (userId: string, password: string) => api.patch(`/companies/members/${userId}/password`, { password }).then(r => r.data),
};

// Projects
export const projectsApi = {
  list: () => api.get('/projects').then(r => r.data),
  create: (data: any) => api.post('/projects', data).then(r => r.data),
  get: (id: string) => api.get(`/projects/${id}`).then(r => r.data),
  update: (id: string, data: any) => api.patch(`/projects/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/projects/${id}`).then(r => r.data),
  addMember: (id: string, data: any) => api.post(`/projects/${id}/members`, data).then(r => r.data),
  updateMember: (id: string, userId: string, data: any) => api.patch(`/projects/${id}/members/${userId}`, data).then(r => r.data),
  removeMember: (id: string, userId: string) => api.delete(`/projects/${id}/members/${userId}`).then(r => r.data),
  setPermissions: (id: string, permissions: any[]) => api.put(`/projects/${id}/permissions`, { permissions }).then(r => r.data),
  createCustomField: (id: string, data: { name: string; field_type: string; options?: string[] }) =>
    api.post(`/projects/${id}/custom-fields`, data).then(r => r.data),
  updateCustomField: (id: string, fieldId: string, data: { name?: string; options?: string[] }) =>
    api.patch(`/projects/${id}/custom-fields/${fieldId}`, data).then(r => r.data),
  deleteCustomField: (id: string, fieldId: string) =>
    api.delete(`/projects/${id}/custom-fields/${fieldId}`).then(r => r.data),
};

// Boards
export const boardsApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/boards`).then(r => r.data),
  create: (projectId: string, name: string) => api.post(`/projects/${projectId}/boards`, { name }).then(r => r.data),
  update: (projectId: string, boardId: string, data: { name?: string; completed_column_id?: string | null; background?: string; column_style?: string; is_restricted?: boolean }) => api.patch(`/projects/${projectId}/boards/${boardId}`, data).then(r => r.data),
  delete: (projectId: string, boardId: string) => api.delete(`/projects/${projectId}/boards/${boardId}`).then(r => r.data),
  getFull: (projectId: string, boardId: string) => api.get(`/projects/${projectId}/boards/${boardId}/full`).then(r => r.data),
  getCompleted: (projectId: string, boardId: string) => api.get(`/projects/${projectId}/boards/${boardId}/completed`).then(r => r.data),
  getAccess: (projectId: string, boardId: string) => api.get(`/projects/${projectId}/boards/${boardId}/access`).then(r => r.data),
  addMember: (projectId: string, boardId: string, user_id: string) => api.post(`/projects/${projectId}/boards/${boardId}/members`, { user_id }).then(r => r.data),
  removeMember: (projectId: string, boardId: string, userId: string) => api.delete(`/projects/${projectId}/boards/${boardId}/members/${userId}`).then(r => r.data),
};

// Columns
export const columnsApi = {
  create: (boardId: string, data: any) => api.post(`/boards/${boardId}/columns`, data).then(r => r.data),
  update: (boardId: string, columnId: string, data: any) => api.patch(`/boards/${boardId}/columns/${columnId}`, data).then(r => r.data),
  delete: (boardId: string, columnId: string) => api.delete(`/boards/${boardId}/columns/${columnId}`).then(r => r.data),
  reorder: (boardId: string, columns: any[]) => api.patch(`/boards/${boardId}/columns/reorder`, { columns }).then(r => r.data),
};

// Tasks
export const tasksApi = {
  create: (columnId: string, data: any) => api.post(`/tasks/column/${columnId}`, data).then(r => r.data),
  get: (taskId: string) => api.get(`/tasks/${taskId}`).then(r => r.data),
  update: (taskId: string, data: any) => api.patch(`/tasks/${taskId}`, data).then(r => r.data),
  move: (taskId: string, column_id: string, position: number) => api.patch(`/tasks/${taskId}/move`, { column_id, position }).then(r => r.data),
  delete: (taskId: string) => api.delete(`/tasks/${taskId}`).then(r => r.data),
  addTag: (taskId: string, data: any) => api.post(`/tasks/${taskId}/tags`, data).then(r => r.data),
  removeTag: (taskId: string, tagId: string) => api.delete(`/tasks/${taskId}/tags/${tagId}`).then(r => r.data),
  addAssignee: (taskId: string, user_id: string) => api.post(`/tasks/${taskId}/assignees`, { user_id }).then(r => r.data),
  removeAssignee: (taskId: string, userId: string) => api.delete(`/tasks/${taskId}/assignees/${userId}`).then(r => r.data),
  getComments: (taskId: string) => api.get(`/tasks/${taskId}/comments`).then(r => r.data),
  addComment: (taskId: string, content: string, allowEmpty = false) => api.post(`/tasks/${taskId}/comments`, { content, allow_empty: allowEmpty }).then(r => r.data),
  updateComment: (taskId: string, commentId: string, content: string) => api.patch(`/tasks/${taskId}/comments/${commentId}`, { content }).then(r => r.data),
  deleteComment: (taskId: string, commentId: string) => api.delete(`/tasks/${taskId}/comments/${commentId}`).then(r => r.data),
  getHistory: (taskId: string) => api.get(`/tasks/${taskId}/history`).then(r => r.data),
  setCustomValue: (taskId: string, fieldId: string, value: string | null) =>
    api.put(`/tasks/${taskId}/custom-values/${fieldId}`, { value }).then(r => r.data),
  setHiddenFields: (taskId: string, hidden: string[]) =>
    api.patch(`/tasks/${taskId}/hidden-fields`, { hidden }).then(r => r.data),
  addSubtask: (taskId: string, title: string) =>
    api.post(`/tasks/${taskId}/subtasks`, { title }).then(r => r.data),
  updateSubtask: (taskId: string, subtaskId: string, data: { title?: string; is_done?: boolean }) =>
    api.patch(`/tasks/${taskId}/subtasks/${subtaskId}`, data).then(r => r.data),
  deleteSubtask: (taskId: string, subtaskId: string) =>
    api.delete(`/tasks/${taskId}/subtasks/${subtaskId}`).then(r => r.data),
  complete: (taskId: string, completed: boolean) =>
    api.patch(`/tasks/${taskId}/complete`, { completed }).then(r => r.data),
  listAttachments: (taskId: string) => api.get(`/tasks/${taskId}/attachments`).then(r => r.data),
  deleteAttachment: (taskId: string, attachmentId: string) =>
    api.delete(`/tasks/${taskId}/attachments/${attachmentId}`).then(r => r.data),
  // Полный цикл загрузки: presign → PUT в хранилище → запись метаданных
  uploadAttachment: async (taskId: string, file: File, commentId?: string) => {
    const ct = file.type || 'application/octet-stream';
    const { upload_url, key, url } = await api
      .post(`/tasks/${taskId}/attachments/presign`, { file_name: file.name, content_type: ct })
      .then(r => r.data);
    const putRes = await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': ct } });
    if (!putRes.ok) throw new Error('Upload failed');
    return api.post(`/tasks/${taskId}/attachments`, {
      file_name: file.name, file_key: key, url, content_type: ct, size: file.size, comment_id: commentId || undefined,
    }).then(r => r.data);
  },
};

// Calendar
export const calendarApi = {
  getSettings: () => api.get('/calendar/settings').then(r => r.data),
  updateSettings: (data: any) => api.patch('/calendar/settings', data).then(r => r.data),
  listEvents: (from: string, to: string, include: 'meetings' | 'tasks' | 'both') =>
    api.get('/calendar/events', { params: { from, to, include } }).then(r => r.data),
  createEvent: (data: any) => api.post('/calendar/events', data).then(r => r.data),
  createEventFor: (userId: string, data: any) => api.post(`/calendar/events/for/${userId}`, data).then(r => r.data),
  updateEvent: (id: string, data: any) => api.patch(`/calendar/events/${id}`, data).then(r => r.data),
  deleteEvent: (id: string) => api.delete(`/calendar/events/${id}`).then(r => r.data),
  members: () => api.get('/calendar/members').then(r => r.data),
  listAway: () => api.get('/calendar/away').then(r => r.data),
  addAway: (data: any) => api.post('/calendar/away', data).then(r => r.data),
  deleteAway: (id: string) => api.delete(`/calendar/away/${id}`).then(r => r.data),
};

// Booking (публичные эндпоинты — без токена)
export const bookingApi = {
  getInfo: (slug: string) => api.get(`/booking/${slug}`).then(r => r.data),
  getSlots: (slug: string, date: string) => api.get(`/booking/${slug}/slots`, { params: { date } }).then(r => r.data),
  book: (slug: string, data: { guest_name: string; guest_email: string; starts_at: string; note?: string }) =>
    api.post(`/booking/${slug}`, data).then(r => r.data),
};
