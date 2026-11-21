import { createHash } from 'node:crypto';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';

type TelegramMessage = {
  chat?: TelegramChat;
  from?: {id?: number; is_bot?: boolean};
  date?: number;
  text?: string;
  message_thread_id?: number;
  is_topic_message?: boolean;
  forum_topic_created?: {name?: string};
  forum_topic_edited?: {name?: string};
  forum_topic_closed?: object;
  forum_topic_reopened?: object;
};
type TelegramChat = {id?: number; type?: string; title?: string; is_forum?: boolean};
type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  my_chat_member?: {chat?: TelegramChat; from?: {id?: number}; date?: number; new_chat_member?: {status?: string; is_member?: boolean}};
};

export const linkHash = (code: string) => createHash('sha256').update(code).digest('hex');
const title = (value: unknown) => typeof value === 'string' && value.trim()
  ? Array.from(value.trim().replaceAll('\0', '')).slice(0, 128).join('') || null : null;
const validTopic = (id: number | undefined): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 1;

function mappedOperator(id?: number): string | null {
  if (!Number.isSafeInteger(id)) return null;
  const mapping = JSON.parse(process.env.OPERATOR_TELEGRAM_ADMIN_MAP || '{}');
  const result = mapping?.[String(id)];
  return typeof result === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result) ? result : null;
}

export async function recordDiscovery(update: unknown, botId: string, version: string) {
  const data = update as TelegramUpdate | null;
  const membership = data?.my_chat_member;
  const message = data?.message;
  const chat = membership?.chat ?? message?.chat;
  const date = membership?.date ?? message?.date;
  if (!chat || !['group', 'supergroup'].includes(chat.type ?? '') || !Number.isSafeInteger(chat.id) ||
    !Number.isSafeInteger(data?.update_id) || typeof date !== 'number' || !Number.isInteger(date)) return;
  const forum = chat.is_forum === true || message?.is_topic_message === true;
  const topic = forum && validTopic(message?.message_thread_id) ? message.message_thread_id : null;
  const command = typeof message?.text === 'string' && message.from?.is_bot !== true
    ? /^\/connect(?:@[A-Za-z0-9_]+)? ([a-f0-9]{32})(?:[ \t]+([^\r\n]+))?$/.exec(message.text) : null;
  const status = membership?.new_chat_member?.status;
  const action = typeof status === 'string'
    ? (['member', 'administrator', 'creator'].includes(status) ||
      (status === 'restricted' && membership?.new_chat_member?.is_member === true) ? 'joined' : 'left')
    : command ? 'link'
    : topic && message?.forum_topic_created ? 'topic'
    : topic && message?.forum_topic_edited ? 'renamed'
    : topic && message?.forum_topic_closed ? 'closed'
    : topic && message?.forum_topic_reopened ? 'reopened' : null;
  if (!action) return;

  const {data: recorded, error} = await createAdminServiceClient().rpc('operator_telegram_target_event_v1', {
    p_bot: botId, p_version: version, p_chat: String(chat.id), p_chat_title: title(chat.title), p_forum: forum,
    p_topic: topic, p_title: title(message?.forum_topic_created?.name ?? message?.forum_topic_edited?.name ?? command?.[2]),
    p_action: action, p_at: new Date(date * 1000).toISOString(), p_update: data?.update_id,
    p_hash: command ? linkHash(command[1]) : null, p_operator: membership ? mappedOperator(membership.from?.id) : null,
  });
  if (error) throw new Error('Telegram destination unavailable');
  if (action === 'link' && recorded === true) return {method: 'sendMessage', chat_id: chat.id,
    ...(topic ? {message_thread_id: topic} : {}), text: 'Назначение подключено к 2000NL. Обновите список в админке.'};
}
