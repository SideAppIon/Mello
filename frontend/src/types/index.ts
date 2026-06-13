export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'manager' | 'member' | 'viewer';
  company_id: string | null;
  avatar_color: string;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface ProjectMember {
  id: string;
  full_name: string;
  email: string;
  avatar_color: string;
  company_role: string;
  project_role: 'admin' | 'manager' | 'member' | 'viewer';
}

export interface FieldPermission {
  role: string;
  field_name: string;
  can_edit: boolean;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'select';

export interface CustomField {
  id: string;
  project_id: string;
  name: string;
  field_type: CustomFieldType;
  options: string[];
  position: number;
  created_at: string;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  creator_name: string;
  created_at: string;
  member_count: number;
  board_count: number;
  my_role?: string;
  members?: ProjectMember[];
  permissions?: FieldPermission[];
  custom_fields?: CustomField[];
}

export interface Board {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Attachment {
  id: string;
  task_id: string;
  comment_id: string | null;
  file_name: string;
  file_key: string;
  url: string;
  content_type: string | null;
  size: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  position: number;
  created_at: string;
}

export type Priority = 1 | 2 | 3 | 4 | 5;

export interface Task {
  id: string;
  column_id: string;
  title: string;
  description: string | null;
  priority: Priority;
  deadline: string | null;
  estimated_hours: number | null;
  position: number;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  assignees: Pick<User, 'id' | 'full_name' | 'avatar_color'>[];
  custom_values?: Record<string, string>;
  hidden_custom_fields?: string[];
  subtasks?: Subtask[];
  attachments?: Attachment[];
  attachment_count?: number;
  is_completed?: boolean;
  completed_at?: string | null;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  color: string;
  tasks: Task[];
}

export interface FullBoard extends Board {
  columns: Column[];
  custom_fields: CustomField[];
  completed_column_id: string | null;
  background: string;
  column_style: string;
  my_role: string;
}

export interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  full_name: string;
  avatar_color: string;
  content: string;
  created_at: string;
  updated_at: string;
  attachments?: Attachment[];
}

export interface HistoryEntry {
  id: string;
  task_id: string;
  user_id: string | null;
  full_name: string | null;
  avatar_color: string | null;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'Критический',
  2: 'Высокий',
  3: 'Средний',
  4: 'Низкий',
  5: 'Минимальный',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#f59e0b',
  4: '#3b82f6',
  5: '#94a3b8',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  member: 'Участник',
  viewer: 'Наблюдатель',
};

export const TASK_FIELDS = [
  { key: 'title', label: 'Название' },
  { key: 'description', label: 'Описание' },
  { key: 'priority', label: 'Приоритет' },
  { key: 'deadline', label: 'Дедлайн' },
  { key: 'estimated_hours', label: 'Оцениваемое время' },
];
