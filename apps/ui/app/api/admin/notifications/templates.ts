import { createAdminServiceClient } from '@/lib/admin/adminServerClient';
import { sendBotMessage } from '@/lib/operatorNotifications/secretBroker';
import { defaultTemplates, isTemplateKind, previewTemplate, templateFields } from '@/lib/operatorNotifications/templates';

type Principal = {userId: string; requestId: string};
type Reply = (body: unknown, status?: number) => Response;

export async function readTemplates(principal: Principal, reply: Reply) {
  const {data, error} = await createAdminServiceClient().rpc('admin_notification_templates_v1', {
    p_operator: principal.userId,
    p_request: principal.requestId,
  });
  if (error) throw new Error('templates unavailable');
  return reply(Object.fromEntries(Object.keys(defaultTemplates).map(key => {
    if (!isTemplateKind(key)) throw new Error('invalid template kind');
    return [key, {body: defaultTemplates[key], revision: '0', ...data?.[key], fields: templateFields[key]}];
  })));
}

const validBotId = (id: unknown): id is string => typeof id === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const validChatId = (id: unknown): id is string => typeof id === 'string' && /^-?[1-9][0-9]{0,19}$/.test(id);
const validTopicId = (id: unknown): id is number | null => id === null
  || (typeof id === 'number' && Number.isSafeInteger(id) && id > 0);

type TestTarget = Pick<Parameters<typeof sendBotMessage>[0], 'botId' | 'version' | 'chatId' | 'topicId'>;

async function deliverTest(target: TestTarget, text: string, reply: Reply) {
  try {
    const result = await sendBotMessage({...target, text: `[ТЕСТ]\n${text}`, buttons: null});
    if (result.status === 'sent') return reply({sent: true});
    return reply({error: result.status === 'failed' ? 'test_delivery_rejected' : 'test_delivery_uncertain'}, 502);
  } catch {
    return reply({error: 'test_delivery_uncertain'}, 502);
  }
}

export async function handleTemplateAction(input: Record<string, unknown>, principal: Principal, reply: Reply) {
  const {action, kind, body, revision, botId, chatId, topicId, title} = input;
  const auth = {p_operator: principal.userId, p_request: principal.requestId};
  if (action === 'save-test-destination') {
    if (!validBotId(botId) || !validChatId(chatId) || !validTopicId(topicId) ||
      typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 120 || title.includes('\0')) {
      return reply({error: 'invalid_test_destination'}, 400);
    }
    const {data, error} = await createAdminServiceClient().rpc('admin_notification_save_test_destination_v1', {
      ...auth, p_bot: botId, p_title: title.trim(), p_chat: chatId, p_topic: topicId,
    });
    if (error?.code === '22023') return reply({error: error.message === 'chat_is_routed' ? 'chat_is_routed' : 'bot_not_ready'}, 422);
    if (error || typeof data !== 'string') throw new Error('test destination unavailable');
    return reply({id: data});
  }
  if (!isTemplateKind(kind) || typeof body !== 'string') return reply({error: 'invalid_template'}, 400);
  let text: string;
  try {
    const configured = process.env.OPERATOR_NOTIFICATION_SITE_URL;
    if (configured) previewTemplate(kind, body, new URL(configured).origin);
    text = previewTemplate(kind, body);
  } catch {
    return reply({error: 'invalid_template'}, 400);
  }

  if (action === 'preview-template') return reply({text});
  const service = createAdminServiceClient();
  if (action === 'publish-template') {
    if (typeof revision !== 'string' || !/^\d{1,18}$/.test(revision)) return reply({error: 'invalid_revision'}, 400);
    const {data, error} = await service.rpc('admin_notification_publish_template_v1', {
      ...auth, p_kind: kind, p_body: body, p_revision: revision,
    });
    if (error?.code === '40001') return reply({error: 'revision_conflict'}, 409);
    if (error) throw new Error('template publish unavailable');
    return reply({revision: data});
  }

  if (action === 'test-route-template') {
    const {routeId, routeRevision} = input;
    if (Object.keys(input).length !== 5 || !validBotId(routeId) ||
      typeof routeRevision !== 'number' || !Number.isInteger(routeRevision) ||
      routeRevision < 1 || routeRevision > 2147483647) {
      return reply({error: 'invalid_test_destination'}, 400);
    }
    const {data, error} = await service.rpc('admin_notification_authorize_route_test_v1', {
      ...auth, p_route: routeId, p_revision: routeRevision,
      p_kind: kind === 'feedback' || kind === 'admission-request' ? kind : 'deployment',
    });
    if (error?.code === 'PT409' || (error?.code === '40001' && error.message === 'test_route_changed')) {
      return reply({error: 'test_route_changed'}, 409);
    }
    if (error?.code === '22023') return reply({error: 'bot_not_ready'}, 422);
    if (error?.code === 'P0001') return reply({error: 'test_rate_limit'}, 429);
    if (error || !data || !validBotId(data.botId) || !validChatId(data.chatId) ||
      !validTopicId(data.topicId) || typeof data.version !== 'string') throw new Error('test route unavailable');
    const {botId, chatId, topicId, version} = data;
    return deliverTest({botId, chatId, topicId, version}, text, reply);
  }

  if (action !== 'test-template' || !validBotId(botId) || !validChatId(chatId) || !validTopicId(topicId)) {
    return reply({error: 'invalid_test_destination'}, 400);
  }

  const {data: version, error} = await service.rpc('admin_notification_authorize_test_v1', {
    ...auth, p_bot: botId, p_chat: chatId,
  });
  if (error?.code === '22023') return reply({error: error.message === 'chat_is_routed' ? 'chat_is_routed' : 'bot_not_ready'}, 422);
  if (error?.code === 'P0001') return reply({error: 'test_rate_limit'}, 429);
  if (error || typeof version !== 'string') throw new Error('test send unavailable');
  return deliverTest({botId, version, chatId, topicId}, text, reply);
}
