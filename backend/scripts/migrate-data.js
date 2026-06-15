/**
 * Перенос данных из старой PostgreSQL в новую Yandex Managed MySQL без потерь.
 *
 * Перед запуском:
 *   1) Создайте схему в MySQL:  npm run migrate   (использует DATABASE_URL = mysql://...)
 *   2) Укажите строку подключения к ИСТОЧНИКУ (PostgreSQL) в переменной PG_URL.
 *
 * Запуск:
 *   PG_URL="postgresql://user:pass@host:6432/mello" \
 *   DATABASE_URL="mysql://user:pass@host:3306/mello" \
 *   npm run migrate:data
 *
 * Скрипт идемпотентен: использует INSERT IGNORE, поэтому повторный запуск
 * не создаёт дублей и до-зальёт недостающее.
 */
const { Client } = require('pg');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Порядок важен: родительские таблицы заливаются раньше дочерних (внешние ключи).
const TABLES = [
  'companies',
  'users',
  'projects',
  'project_members',
  'project_field_permissions',
  'boards',
  'columns',
  'tasks',
  'task_tags',
  'task_assignees',
  'task_comments',
  'task_history',
  'project_custom_fields',
  'task_custom_values',
  'subtasks',
  'board_members',
  'attachments',
];

function mysqlCoords() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith('mysql')) {
    throw new Error('DATABASE_URL должен указывать на MySQL (mysql://user:pass@host:3306/db)');
  }
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

// PostgreSQL отдаёт jsonb как объекты, boolean как true/false, timestamptz как Date.
// Приводим к виду, который примет MySQL.
function prep(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v;
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v); // jsonb / массивы -> JSON-текст
  return v;
}

async function main() {
  const pgUrl = process.env.PG_URL || process.env.SOURCE_DATABASE_URL;
  if (!pgUrl) throw new Error('Укажите PG_URL — строку подключения к исходной PostgreSQL');

  const pg = new Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  const my = await mysql.createConnection({
    ...mysqlCoords(),
    ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
    multipleStatements: false,
  });

  await my.query('SET FOREIGN_KEY_CHECKS=0');
  try {
    for (const table of TABLES) {
      const { rows } = await pg.query(`SELECT * FROM ${table}`);
      if (rows.length === 0) {
        console.log(`${table}: 0 строк`);
        continue;
      }
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `\`${c}\``).join(', ');
      const rowPh = `(${cols.map(() => '?').join(', ')})`;

      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const values = [];
        const placeholders = chunk
          .map((r) => {
            for (const c of cols) values.push(prep(r[c]));
            return rowPh;
          })
          .join(', ');
        const [res] = await my.query(
          `INSERT IGNORE INTO \`${table}\` (${colList}) VALUES ${placeholders}`,
          values
        );
        inserted += res.affectedRows || 0;
      }
      console.log(`${table}: ${rows.length} прочитано, ${inserted} вставлено`);
    }
  } finally {
    await my.query('SET FOREIGN_KEY_CHECKS=1');
    await my.end();
    await pg.end();
  }
  console.log('\nПеренос данных завершён.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
