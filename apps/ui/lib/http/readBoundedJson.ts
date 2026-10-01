/** Bound bytes even when Content-Length is absent/untrusted (streamed bodies). */
export async function readBoundedJson(
  request: Request,
  limit: number,
): Promise<{ body: unknown } | { error: "invalid" | "too_large" }> {
  if (Number(request.headers.get("content-length")) > limit)
    return { error: "too_large" };
  try {
    const reader = request.body?.getReader();
    if (!reader) return { error: "invalid" };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > limit) {
          await reader.cancel();
          return { error: "too_large" };
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { error: "invalid" };
  }
}
