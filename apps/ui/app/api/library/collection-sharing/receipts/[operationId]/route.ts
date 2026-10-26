import {NextRequest} from 'next/server';
import {getShareReceipt} from '@/lib/collections/sharing/shareCommandRoutes';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(request:NextRequest,{params}:{params:Promise<{operationId:string}>}){
 return getShareReceipt(request,(await params).operationId);
}
