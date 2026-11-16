import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dispatchOne } from '@/lib/operatorNotifications/dispatch';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 const expected=process.env.OPERATOR_NOTIFICATION_DISPATCH_SECRET;
 const value=request.headers.get('authorization');
 const given=value?.startsWith('Bearer ')?value.slice(7):'';
 if (!expected || expected.length<32 || expected.length>256 || Buffer.byteLength(given)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(given),Buffer.from(expected))) return NextResponse.json({error:'unauthorized'},{status:401});
 try {const status=await dispatchOne();return NextResponse.json({status},{status:status==='disabled'?503:200,headers:{'Cache-Control':'no-store'}});}
 catch {return NextResponse.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
