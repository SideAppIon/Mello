import { pool } from './db';

// Схема для Yandex Managed Service for MySQL (MySQL 8.0).
// Отличия от PostgreSQL-версии:
//   - UUID -> CHAR(36), значение генерируется приложением (DEFAULT (UUID()) как страховка)
//   - TIMESTAMPTZ -> DATETIME, NOW() / CURRENT_TIMESTAMP
//   - BOOLEAN -> TINYINT(1)
//   - JSONB -> JSON (с DEFAULT через выражение)
//   - нет расширения uuid-ossp, нет "ADD COLUMN IF NOT EXISTS" (всё внутри CREATE TABLE)
const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS companies (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(255) NOT NULL,
    invite_code VARCHAR(32) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    company_id CHAR(36) NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    avatar_color VARCHAR(16) DEFAULT '#6366f1',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_role CHECK (role IN ('admin','manager','member','viewer')),
    CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS projects (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    company_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(16) DEFAULT '#6366f1',
    created_by CHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS project_members (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    project_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    UNIQUE KEY uq_project_member (project_id, user_id),
    CONSTRAINT chk_pm_role CHECK (role IN ('admin','manager','member','viewer')),
    CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS project_field_permissions (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    project_id CHAR(36) NOT NULL,
    role VARCHAR(32) NOT NULL,
    field_name VARCHAR(64) NOT NULL,
    can_edit TINYINT(1) DEFAULT 1,
    UNIQUE KEY uq_pfp (project_id, role, field_name),
    CONSTRAINT fk_pfp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS boards (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    project_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    completed_column_id CHAR(36) NULL,
    background VARCHAR(64) NOT NULL DEFAULT 'default',
    column_style VARCHAR(32) NOT NULL DEFAULT 'cards',
    is_restricted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_boards_project (project_id),
    CONSTRAINT fk_boards_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS columns (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    board_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    color VARCHAR(16) DEFAULT '#94a3b8',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_columns_board (board_id),
    CONSTRAINT fk_columns_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // FK boards.completed_column_id -> columns(id): добавляем после создания columns
  // (на момент CREATE TABLE boards таблицы columns ещё нет).
  `ALTER TABLE boards
    ADD CONSTRAINT fk_boards_completed_col
    FOREIGN KEY (completed_column_id) REFERENCES columns(id) ON DELETE SET NULL`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    column_id CHAR(36) NOT NULL,
    title VARCHAR(512) NOT NULL,
    description TEXT,
    priority INT NOT NULL DEFAULT 3,
    deadline DATETIME NULL,
    estimated_hours DECIMAL(6,2) NULL,
    position INT NOT NULL DEFAULT 0,
    created_by CHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    hidden_custom_fields JSON NOT NULL DEFAULT (JSON_ARRAY()),
    is_completed TINYINT(1) NOT NULL DEFAULT 0,
    completed_at DATETIME NULL,
    KEY idx_tasks_column (column_id),
    KEY idx_tasks_completed (column_id, is_completed),
    CONSTRAINT chk_tasks_priority CHECK (priority BETWEEN 1 AND 5),
    CONSTRAINT fk_tasks_column FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE,
    CONSTRAINT fk_tasks_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS task_tags (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    task_id CHAR(36) NOT NULL,
    name VARCHAR(64) NOT NULL,
    color VARCHAR(16) DEFAULT '#6366f1',
    KEY idx_task_tags_task (task_id),
    CONSTRAINT fk_task_tags_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS task_assignees (
    task_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    PRIMARY KEY (task_id, user_id),
    CONSTRAINT fk_ta_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_ta_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS task_comments (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    task_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_task_comments_task (task_id),
    CONSTRAINT fk_tc_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_tc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS task_history (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    task_id CHAR(36) NOT NULL,
    user_id CHAR(36) NULL,
    action VARCHAR(64) NOT NULL,
    field_name VARCHAR(64),
    old_value TEXT,
    new_value TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_task_history_task (task_id),
    CONSTRAINT fk_th_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_th_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS project_custom_fields (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    project_id CHAR(36) NOT NULL,
    name VARCHAR(128) NOT NULL,
    field_type VARCHAR(16) NOT NULL DEFAULT 'text',
    options JSON NOT NULL DEFAULT (JSON_ARRAY()),
    position INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_custom_fields_project (project_id),
    CONSTRAINT chk_pcf_type CHECK (field_type IN ('text','number','date','select')),
    CONSTRAINT fk_pcf_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS task_custom_values (
    task_id CHAR(36) NOT NULL,
    field_id CHAR(36) NOT NULL,
    value TEXT,
    PRIMARY KEY (task_id, field_id),
    KEY idx_custom_values_task (task_id),
    CONSTRAINT fk_tcv_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_tcv_field FOREIGN KEY (field_id) REFERENCES project_custom_fields(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS subtasks (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    task_id CHAR(36) NOT NULL,
    title VARCHAR(512) NOT NULL,
    is_done TINYINT(1) NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_subtasks_task (task_id),
    CONSTRAINT fk_subtasks_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS board_members (
    board_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    PRIMARY KEY (board_id, user_id),
    CONSTRAINT fk_bm_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    CONSTRAINT fk_bm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS attachments (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    task_id CHAR(36) NOT NULL,
    comment_id CHAR(36) NULL,
    file_name VARCHAR(512) NOT NULL,
    file_key VARCHAR(1024) NOT NULL,
    url TEXT NOT NULL,
    content_type VARCHAR(128),
    size BIGINT,
    uploaded_by CHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_attachments_task (task_id),
    KEY idx_attachments_comment (comment_id),
    CONSTRAINT fk_att_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_att_comment FOREIGN KEY (comment_id) REFERENCES task_comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_att_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // --- Календарь ---
  // Все DATETIME в календарных таблицах хранятся в UTC. Конвертация в часовой
  // пояс пользователя выполняется только на границах (route-слой / UI).
  `CREATE TABLE IF NOT EXISTS calendar_settings (
    user_id CHAR(36) NOT NULL PRIMARY KEY,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
    work_days JSON NOT NULL,
    work_start VARCHAR(5) NOT NULL DEFAULT '09:00',
    work_end VARCHAR(5) NOT NULL DEFAULT '18:00',
    slot_minutes INT NOT NULL DEFAULT 30,
    booking_slug VARCHAR(64) NULL UNIQUE,
    booking_enabled TINYINT(1) NOT NULL DEFAULT 0,
    default_meeting_url TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS calendar_events (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    owner_id CHAR(36) NOT NULL,
    title VARCHAR(512) NOT NULL,
    description TEXT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    meeting_url TEXT NULL,
    location VARCHAR(512) NULL,
    source VARCHAR(16) NOT NULL DEFAULT 'internal',
    created_by CHAR(36) NULL,
    guest_name VARCHAR(255) NULL,
    guest_email VARCHAR(255) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'confirmed',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cal_events_owner (owner_id, starts_at),
    CONSTRAINT chk_cal_source CHECK (source IN ('internal','booking')),
    CONSTRAINT chk_cal_status CHECK (status IN ('confirmed','cancelled')),
    CONSTRAINT fk_cal_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cal_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS calendar_event_attendees (
    event_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    PRIMARY KEY (event_id, user_id),
    CONSTRAINT fk_cea_event FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
    CONSTRAINT fk_cea_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS calendar_away (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cal_away_user (user_id, starts_at),
    CONSTRAINT fk_cal_away_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // --- Уведомления ---
  // Простой центр уведомлений: запись создаётся, когда другой пользователь
  // затрагивает получателя (назначил встречу/задачу, прислал бронь).
  `CREATE TABLE IF NOT EXISTS notifications (
    id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    type VARCHAR(16) NOT NULL,
    title VARCHAR(512) NOT NULL,
    link VARCHAR(512) NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_notif_user (user_id, created_at),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// Коды ошибок MySQL, которые можно безопасно игнорировать при повторном запуске
// миграции (объект уже существует).
const BENIGN = new Set([
  'ER_TABLE_EXISTS_ERROR', // 1050
  'ER_DUP_FIELDNAME', // 1060
  'ER_DUP_KEYNAME', // 1061
  'ER_FK_DUP_NAME', // 1826 — дубль имени внешнего ключа
]);

async function migrate() {
  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (e: any) {
      if (BENIGN.has(e.code)) {
        console.log(`skip (${e.code}): ${sql.slice(0, 60).replace(/\s+/g, ' ')}...`);
        continue;
      }
      throw e;
    }
  }
  console.log('Migration completed successfully');
  await pool.end();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
