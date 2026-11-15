import { NextRequest } from "next/server";
import { catalogReadPreflight, handlePlatformCatalogRead } from "@/lib/platform/platformCatalogReadService";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const OPTIONS = catalogReadPreflight;
export async function GET(request: NextRequest, { params }: { params: Promise<{ collectionId: string }> }) { return handlePlatformCatalogRead(request, "entries", (await params).collectionId); }
