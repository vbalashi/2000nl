import {readInterfaceSnapshot} from '@/lib/i18n/serverSnapshot';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const snapshot=await readInterfaceSnapshot();
  const contract=new URL(request.url).searchParams.get('contract');
  const headers={'Cache-Control':'no-store','ETag':`"${snapshot.revision}"`};
  if(contract&&contract!==snapshot.contract)return Response.json({error:'incompatible_catalog_contract'},{status:409,headers});
  if(request.headers.get('if-none-match')===headers.ETag)return new Response(null,{status:304,headers});
  return Response.json(snapshot,{headers});
}
