import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net';
const bucket = process.env.S3_BUCKET || '';

export const s3 = new S3Client({
  region: process.env.S3_REGION || 'ru-central1',
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
});

// Безопасное имя файла для ключа объекта (латиница/цифры, расширение сохраняем)
export function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).replace(/[^.a-zA-Z0-9]/g, '') : '';
  const base = (dot >= 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'file';
  return base + ext.toLowerCase();
}

export async function presignUpload(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(s3, cmd, { expiresIn: 600 });
}

export function publicUrl(key: string): string {
  return `${endpoint}/${bucket}/${key}`;
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // объект мог быть уже удалён — игнорируем
  }
}
