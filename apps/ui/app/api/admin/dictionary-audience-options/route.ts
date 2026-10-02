import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";
import { getDictionaryAudienceOptions } from "@/lib/admin/publicationRepository";

export async function GET(request: Request) {
  try {
    await requireAdmin(request, "publication.manage");
    const pageValue = Number(new URL(request.url).searchParams.get("page") ?? "1");
    const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
    const options = await getDictionaryAudienceOptions(page);
    return NextResponse.json(options, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
