import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { managedTermsEnabled } from "@/lib/legal/managedTerms";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  const directory = process.env.DILUM_SERVICE_TERMS_DIR;
  if (!directory || !managedTermsEnabled() || !["terms.html", "privacy.html"].includes(document)) {
    return new Response(null, { status: 404 });
  }
  try {
    const html = await readFile(join(directory, "2026-11-27", document), "utf8");
    return new Response(html, { headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    } });
  } catch {
    return new Response(null, { status: 503 });
  }
}
