import 'server-only';
export function adminEmailEnabled() { return process.env.ADMIN_EMAIL_OTP_ENABLED === 'true'; }
export function adminAuthOrigin(request: Request) {
 const configured=process.env.ADMIN_SITE_URL;
 try { return configured ? new URL(configured).origin : process.env.NODE_ENV==='development' ? new URL(request.url).origin : null; }
 catch { return null; }
}
export function adminAuthSameOrigin(request: Request) { const origin=adminAuthOrigin(request);return !!origin && request.headers.get('origin')===origin; }
export function adminEmail(value: unknown) {
 if(typeof value!=='string')return null;
 const email=value.trim().toLowerCase();
 return email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function adminAuthInput(request: Request): Promise<Record<string, unknown>> {
 const reader=request.body?.getReader();if(!reader)throw new Error('input required');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>1024){await reader.cancel();throw new Error('input too large');}chunks.push(result.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('object required');return value;
}
