/** Worker REST calls are bounded independently of provider operation time. */
export const dictionaryTranslationWorkerFetch: typeof fetch = async (
  input,
  init,
) => {
  const controller = new AbortController();
  const forward = () => controller.abort();
  if (init?.signal?.aborted) controller.abort();
  else init?.signal?.addEventListener("abort", forward, { once: true });
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    return new Response(
      [204, 205, 304].includes(response.status) ? null : text,
      {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      },
    );
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", forward);
  }
};
