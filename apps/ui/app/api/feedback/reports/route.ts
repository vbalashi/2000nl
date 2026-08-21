import { NextRequest } from "next/server";
import { submitDiagnosticReport } from "@/lib/feedback/diagnosticReportService";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
  jsonNoStore,
  platformCorsPreflight,
  requirePlatformScope,
  withPlatformCors,
} from "@/lib/platform/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request: NextRequest) { return platformCorsPreflight(request); }

export async function POST(request: NextRequest) {
  const reply = (payload: unknown, status = 200) => withPlatformCors(request, jsonNoStore(payload, status));
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return withPlatformCors(request, auth);
  const scopeError = requirePlatformScope(auth, "platform:write");
  if (scopeError) return withPlatformCors(request, scopeError);
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return withPlatformCors(request, service);
  const bodyResult = await readBoundedJson(request, 70 * 1024);
  if (!bodyResult.ok) return reply({ error: bodyResult.error }, bodyResult.status);
  const result = await submitDiagnosticReport(auth, service, bodyResult.value);
  return reply(result.payload, result.status);
}

async function readBoundedJson(request: Request, maxBytes: number): Promise<
  { ok: true; value: unknown } | { ok: false; error: string; status: number }
> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, error: "payload_too_large", status: 413 };
  }
  if (!request.body) return { ok: false, error: "invalid_json", status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { ok: false, error: "payload_too_large", status: 413 };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, error: "invalid_json", status: 400 };
  }
}
