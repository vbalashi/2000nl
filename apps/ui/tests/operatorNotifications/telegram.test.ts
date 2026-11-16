import { describe, expect, it, vi } from "vitest";
import { sendTelegramMessage } from "@/lib/operatorNotifications/telegram";

const token = "123:fake_token";
const message = { chatId: "-100123", topicId: 7, text: "New request", buttons: [[{ text: "Approve", callbackData: "opaque_123" }]] };

describe("Telegram transport", () => {
  it("routes plain text and opaque callbacks to the configured topic", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 42 } })));
    expect(await sendTelegramMessage(token, message, request)).toEqual({ status: "sent", messageId: 42 });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body)).toEqual({ chat_id: "-100123", message_thread_id: 7, text: "New request", reply_markup: { inline_keyboard: [[{ text: "Approve", callback_data: "opaque_123" }]] } });
  });
  it("allows an explicitly unthreaded destination", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: { message_id: 42 } })));
    expect(await sendTelegramMessage(token, { ...message, topicId: null }, request)).toEqual({ status: "sent", messageId: 42 });
    expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty("message_thread_id");
  });
  it("classifies rate limiting, server failures and ambiguous responses without exposing details", async () => {
    const send = (response: Response) => sendTelegramMessage(token, message, async () => response);
    expect(await send(new Response(JSON.stringify({ parameters: { retry_after: 30 } }), { status: 429 }))).toEqual({ status: "retry", retryAfterSeconds: 30 });
    expect(await send(new Response("secret", { status: 503 }))).toEqual({ status: "retry" });
    expect(await send(new Response("secret", { status: 403 }))).toEqual({ status: "failed" });
    expect(await send(new Response(JSON.stringify({ ok: true, result: { message_id: 0 } })))).toEqual({ status: "retry" });
    expect(await sendTelegramMessage(token, message, async () => { throw Error(`secret ${token}`); })).toEqual({ status: "retry" });
  });
  it("rejects malformed routing and callback data before sending", async () => {
    const request = vi.fn();
    expect(await sendTelegramMessage(token, { ...message, topicId: 0 }, request)).toEqual({ status: "failed" });
    expect(await sendTelegramMessage(token, { ...message, buttons: [[{ text: "Approve", callbackData: "email@example.com" }]] }, request)).toEqual({ status: "failed" });
    expect(request).not.toHaveBeenCalled();
  });
});
