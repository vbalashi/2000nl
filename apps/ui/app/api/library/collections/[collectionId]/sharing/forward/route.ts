import { NextRequest } from 'next/server';
import { readCollectionShareState } from '@/lib/collections/sharing/readShareState';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(request:NextRequest,{params}:{params:Promise<{collectionId:string}>}){
 return readCollectionShareState(request,(await params).collectionId,'forward');
}
