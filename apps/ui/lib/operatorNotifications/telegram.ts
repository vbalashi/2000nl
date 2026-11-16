/** A transport only: the caller owns persistence, retry and operator authorization. */
export type TelegramDelivery =
  | { status: "sent"; messageId: number }
  | { status: "retry"; retryAfterSeconds?: number }
  | { status: "failed" };

export type TelegramMessage = {
  chatId: string;
  topicId: number | null;
  text: string;
  buttons?: ReadonlyArray<ReadonlyArray<{ text: string; callbackData: string }>>;
};

type Request = (url: string, init: RequestInit) => Promise<Response>;

/** Never expose provider responses, credentials or exception details to callers. */
export async function sendTelegramMessage(
  token: string,
  message: TelegramMessage,
  request: Request = fetch,
): Promise<TelegramDelivery> {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token) || !/^-?\d+$/.test(message.chatId)
    || (message.topicId !== null && (!Number.isSafeInteger(message.topicId) || message.topicId <= 0))
    || message.text.length < 1 || message.text.length > 4096
    || (message.buttons && (message.buttons.length > 8 || message.buttons.some(row =>
      row.length < 1 || row.length > 4 || row.some(button =>
        !button.text || button.text.length > 64 || !/^[A-Za-z0-9_-]{1,64}$/.test(button.callbackData)))))) {
    return { status: "failed" };
  }
  try {
    const response = await request(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: message.chatId,
        ...(message.topicId === null ? {} : { message_thread_id: message.topicId }),
        text: message.text,
        ...(message.buttons ? { reply_markup: { inline_keyboard: message.buttons.map(row =>
          row.map(button => ({ text: button.text, callback_data: button.callbackData }))) } } : {}),
      }),
    });
    if (response.status === 429) {
      // Telegram returns the retry interval in its JSON body, not necessarily a header.
      const body = await response.json().catch(() => null) as { parameters?: { retry_after?: unknown } } | null;
      const seconds = body?.parameters?.retry_after;
      return typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86_400
        ? { status: "retry", retryAfterSeconds: seconds } : { status: "retry" };
    }
    if (response.status >= 500 || response.status === 408) return { status: "retry" };
    if (!response.ok) return { status: "failed" };
    const body = await response.json() as { ok?: unknown; result?: { message_id?: unknown } };
    if (body.ok !== true) return { status: "failed" };
    const id = body.result?.message_id;
    // A zero ID means Telegram scheduled a message, and is not a usable receipt.
    return typeof id === "number" && Number.isSafeInteger(id) && id > 0
      ? { status: "sent", messageId: id } : { status: "retry" };
  } catch {
    // Timeouts and malformed success responses have an uncertain outcome: a retry can duplicate a message.
    return { status: "retry" };
  }
}
