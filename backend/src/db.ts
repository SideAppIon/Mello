import mysql from 'mysql2/promise';
import { randomUUID } from 'crypto';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// --- Конфигурация подключения к Yandex Managed Service for MySQL ---
// Поддерживаются два способа задать координаты:
//   1) DATABASE_URL=mysql://user:password@host:3306/dbname
//   2) Отдельные переменные MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
function coords() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
    };
  }
  return {
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  };
}

// Yandex требует TLS для подключения извне VPC. Кладём корневой сертификат
// (https://storage.yandexcloud.net/cloud-certs/CA.pem) и указываем путь в
// MYSQL_SSL_CA_PATH либо его PEM-содержимое в MYSQL_SSL_CA.
// DB_SSL=false полностью отключает TLS (например, для локального MySQL).
function ssl(): mysql.PoolOptions['ssl'] {
  if (process.env.DB_SSL === 'false') return undefined;
  const inline = process.env.MYSQL_SSL_CA;
  const path = process.env.MYSQL_SSL_CA_PATH;
  let ca: string | undefined;
  if (inline) ca = inline;
  else if (path && fs.existsSync(path)) ca = fs.readFileSync(path, 'utf8');
  if (ca) return { ca, rejectUnauthorized: true };
  // Шифруем соединение, но без проверки цепочки (паритет со старой pg-конфигурацией).
  return { rejectUnauthorized: false };
}

export const pool = mysql.createPool({
  ...coords(),
  ssl: ssl(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL || 5),
  charset: 'utf8mb4',
  // Соглашение проекта: все DATETIME хранятся в UTC. Фиксируем интерпретацию
  // драйвером в UTC, иначе на машине разработчика (не-UTC локаль) mysql2 читает
  // и пишет DATETIME со сдвигом — критично для календаря. На проде сервер уже UTC.
  timezone: 'Z',
  // Возвращаем TINYINT(1) как boolean, чтобы JSON-ответы API совпадали с прежними
  // (PostgreSQL отдавал настоящие true/false).
  typeCast(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      const s = field.string();
      return s === null ? null : s === '1';
    }
    return next();
  },
});

// Запросы в коде написаны на нумерованных плейсхолдерах PostgreSQL ($1, $2, ...).
// MySQL использует позиционные '?', поэтому транслируем на лету. Все запросы в
// проекте используют плейсхолдеры строго по возрастанию и по одному разу.
function toMysql(text: string): string {
  return text.replace(/\$(\d+)/g, '?');
}

// undefined в параметрах MySQL-драйвер не принимает — приводим к NULL.
function clean(params: any[]): any[] {
  return params.map((p) => (p === undefined ? null : p));
}

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(toMysql(text), clean(params));
  return rows as T[];
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

// Аналог "INSERT ... RETURNING *" из PostgreSQL: генерируем UUID в приложении,
// вставляем строку и возвращаем её свежим SELECT. Объекты/массивы сериализуются
// для JSON-колонок.
export async function insertOne<T = any>(table: string, data: Record<string, any>): Promise<T> {
  const row = 'id' in data ? data : { id: randomUUID(), ...data };
  const cols = Object.keys(row);
  const values = cols.map((c) => {
    const v = row[c];
    if (v === undefined) return null;
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      return JSON.stringify(v);
    }
    return v;
  });
  const sql = `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${cols
    .map(() => '?')
    .join(', ')})`;
  await pool.query(sql, values);
  const [rows]: any = await pool.query(`SELECT * FROM \`${table}\` WHERE id = ?`, [(row as any).id]);
  return rows[0];
}
