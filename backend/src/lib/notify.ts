import { insertOne } from '../db';

// Создать уведомление для пользователя. Никогда не роняет основной запрос —
// уведомления вторичны, поэтому ошибки только логируем.
export async function notify(
  userId: string,
  type: 'event' | 'task' | 'booking',
  title: string,
  link: string | null = null
): Promise<void> {
  try {
    await insertOne('notifications', { user_id: userId, type, title, link });
  } catch (e) {
    console.error('notify failed:', (e as any)?.message);
  }
}
