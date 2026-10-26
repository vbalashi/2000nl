import { publicConfigScript, publicRuntimeConfig } from "@/lib/runtime/serverPublicConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  const config = publicRuntimeConfig();
  return new Response(config ? publicConfigScript(config) : "/* Public configuration is unavailable. */", {
    status: config ? 200 : 503,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
