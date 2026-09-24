import "server-only";

import { NextResponse } from "next/server";
import { adminErrorResponse, requireAdmin } from "@/lib/admin/adminAccess";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  try {
    const principal = await requireAdmin(request);
    return NextResponse.json({ email: principal.email, permissions: principal.permissions }, {
      headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
