import manifest from '@/public/manifest.json';
import {getRequestInterfaceSnapshot} from '@/lib/i18n/serverSnapshot';
export const dynamic='force-dynamic';
export async function GET() {
  const copy=(await getRequestInterfaceSnapshot()).catalogs.en.features.appMetadata;
  return Response.json({...manifest,name:copy.title,description:copy.description},{headers:{'Cache-Control':'no-store'}});
}
