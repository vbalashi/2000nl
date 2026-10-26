import { isCanonicalShareCode, parseShareCode } from './shareCode';

const key = '2000nl.pending-share-invitation.v1';
const ttlMs = 30 * 60 * 1000;
type Invitation = {code: string; capturedAt: number};
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Tab-local auth resume only. Never put this record in OAuth state or redirect URLs. */
export function rememberShareInvitation(storage: Storage, code: string, now = Date.now()): boolean {
  if (!isCanonicalShareCode(code) || !Number.isSafeInteger(now) || now < 0) return false;
  try {
    storage.setItem(key, JSON.stringify({code, capturedAt: now}));
    return true;
  } catch { return false; }
}

/** A pending invitation only allows preview; acceptance always needs an explicit signed-in action. */
export function readPendingShareInvitation(storage: Storage, now = Date.now()): string | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    if(raw.length>1024){storage.removeItem(key);return null;}
    const value: unknown = JSON.parse(raw);
    const record = value as Partial<Invitation> | null;
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        Object.keys(record).length !== 2 || !isCanonicalShareCode(record.code) ||
        !Number.isSafeInteger(record.capturedAt) || !Number.isSafeInteger(now) ||
        Number(record.capturedAt) < 0 || Number(record.capturedAt) > now ||
        now - Number(record.capturedAt) >= ttlMs) {
      storage.removeItem(key);
      return null;
    }
    return record.code;
  } catch {
    try { storage.removeItem(key); } catch { /* Storage may be denied. */ }
    return null;
  }
}

export function forgetShareInvitation(storage: Storage): void {
  try { storage.removeItem(key); } catch { /* No persistent fallback for invitation secrets. */ }
}

/** Call before preview/auth navigation. Returns the code in memory even if storage is denied. */
export function captureShareInvitation(
  href: string, applicationOrigin: string, storage: Storage,
  replaceUrl: (path: string) => void, now = Date.now(),
): string | null {
  const code = parseShareCode(href, applicationOrigin);
  if (!code) return null;
  // Refuse bare pasted codes here: this function consumes only the actual /share URL.
  try {
    if (new URL(href).pathname !== '/share') return null;
  } catch { return null; }
  replaceUrl('/share');
  rememberShareInvitation(storage, code, now);
  return code;
}

const previewKey=(userId:string)=>'2000nl.pending-share-preview.v1.'+encodeURIComponent(userId);
/** Once claimed, preview resume belongs only to that account in this tab. */
export function rememberAccountSharePreview(storage:Storage,userId:string,code:string,now=Date.now()):boolean{
 if(!userId||userId.length>100||!isCanonicalShareCode(code)||!Number.isSafeInteger(now)||now<0)return false;
 try{const raw=JSON.stringify({code,capturedAt:now});storage.setItem(previewKey(userId),raw);return storage.getItem(previewKey(userId))===raw;}catch{return false;}
}
export function readAccountSharePreview(storage:Storage,userId:string,now=Date.now()):string|null{
 if(!userId||userId.length>100)return null;
 // Reuse the same bounded TTL/parser without exposing other account keys.
 const scoped:Storage={getItem:()=>storage.getItem(previewKey(userId)),setItem:(_key,value)=>storage.setItem(previewKey(userId),value),removeItem:()=>storage.removeItem(previewKey(userId))};
 return readPendingShareInvitation(scoped,now);
}
export function forgetAccountSharePreview(storage:Storage,userId:string):void{
 try{storage.removeItem(previewKey(userId));}catch{/* In-memory close still works. */}
}
