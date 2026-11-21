import { randomBytes } from 'node:crypto';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';
import { linkHash } from '@/lib/operatorNotifications/discovery';
import { createTelegramTopic, refreshTelegramWebhook } from '@/lib/operatorNotifications/secretBroker';

type Principal = {userId: string; requestId: string};
type Reply = (body: unknown, status?: number) => Response;

export async function readTelegramDestinations(principal: Principal, reply: Reply) {
  const {data, error} = await createAdminServiceClient().rpc('admin_telegram_targets_v1', {p_operator: principal.userId});
  if (error) throw new Error('Telegram destinations unavailable');
  return reply(data);
}

export async function handleDestinationAction(input: Record<string, unknown>, principal: Principal, reply: Reply) {
  const {action, botId, chatId, title} = input;
  if (typeof botId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(botId)) {
    return reply({error:'invalid_bot'}, 400);
  }
  const service = createAdminServiceClient();
  const auth = {p_operator: principal.userId, p_request: principal.requestId, p_bot: botId};
  if (action === 'link-telegram-destination') {
    const code = randomBytes(16).toString('hex');
    const {data: version, error} = await service.rpc('admin_telegram_link_v1', {...auth, p_hash: linkHash(code)});
    if (error?.code === '22023') return reply({error:'bot_not_ready'}, 422);
    if (error || typeof version !== 'string') throw new Error('Telegram linking unavailable');
    try {
      const username = await refreshTelegramWebhook(botId, version);
      return reply({username, command: `/connect@${username} ${code}`});
    } catch {
      return reply({error:'telegram_connection_unavailable'}, 502);
    }
  }

  if (typeof chatId !== 'string' || !/^-[1-9][0-9]{0,19}$/.test(chatId) ||
    typeof title !== 'string' || !title.trim() || Array.from(title.trim()).length > 128 || title.includes('\0')) {
    return reply({error:'invalid_topic'}, 400);
  }
  const {data: version, error} = await service.rpc('admin_telegram_topic_credential_v1', {...auth, p_chat: chatId});
  if (error?.code === '22023') return reply({error:'forum_not_connected'}, 422);
  if (error || typeof version !== 'string') throw new Error('Telegram topic unavailable');
  try {
    const topic = await createTelegramTopic({botId, version, chatId, title: title.trim()});
    if (!topic) return reply({error:'telegram_topic_rejected'}, 422);
    const saved = await service.rpc('operator_telegram_target_event_v1', {
      p_bot: botId, p_version: version, p_chat: chatId, p_chat_title: null, p_forum: true, p_topic: topic.topicId,
      p_title: topic.title, p_action: 'created', p_at: new Date().toISOString(), p_update: 0, p_operator: principal.userId,
    });
    if (saved.error || saved.data !== true) return reply({error:'telegram_topic_unsaved'}, 502);
    return reply(topic, 201);
  } catch {
    return reply({error:'telegram_topic_uncertain'}, 502);
  }
}
