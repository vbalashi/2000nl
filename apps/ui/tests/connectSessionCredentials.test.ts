import { afterEach, describe, expect, test } from 'vitest';
import { assertConnectEncryptionConfigured, connectedCredentialPayload, decryptProviderSession, encryptProviderSession, opaqueToken, CONNECT_ACCESS_PREFIX, isConnectAccessToken, type ProviderEnvelope } from '@/lib/connect/sessionCredentials';
const original=process.env.CONNECT_SESSION_ENCRYPTION_KEY;
afterEach(()=>{if(original===undefined)delete process.env.CONNECT_SESSION_ENCRYPTION_KEY;else process.env.CONNECT_SESSION_ENCRYPTION_KEY=original;});
const envelope:ProviderEnvelope={proof:'server-proof',session:{access_token:'provider-access',refresh_token:'provider-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'fixture'} as any}};
describe('Connect credential envelope',()=>{
 test('requires a separate 256-bit key and rejects malformed configuration',()=>{
  for(const key of ['',Buffer.alloc(16).toString('base64'),'not-base64']){process.env.CONNECT_SESSION_ENCRYPTION_KEY=key;expect(assertConnectEncryptionConfigured).toThrow('connect_credentials_unavailable');}
 });
 test('binds ciphertext to its connection, authenticates tampering and uses fresh nonces',()=>{
  process.env.CONNECT_SESSION_ENCRYPTION_KEY=Buffer.alloc(32,1).toString('base64');
  const value=encryptProviderSession(envelope,'connection-a');
  expect(decryptProviderSession(value,'connection-a')).toEqual(envelope);
  expect(encryptProviderSession(envelope,'connection-a')).not.toBe(value);
  expect(()=>decryptProviderSession(value,'connection-b')).toThrow();
  const parts=value.split('.');parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);
  expect(()=>decryptProviderSession(parts.join('.'),'connection-a')).toThrow();
  process.env.CONNECT_SESSION_ENCRYPTION_KEY=Buffer.alloc(32,2).toString('base64');
  expect(()=>decryptProviderSession(value,'connection-a')).toThrow();
 });
 test('returns only external credentials and bounded user identity',()=>{
  const result=connectedCredentialPayload(envelope.session,['platform:read'],'external-access','external-refresh');
  expect(JSON.stringify(result)).not.toContain('provider-');expect(result).toMatchObject({access_token:'external-access',refresh_token:'external-refresh',user:{id:'fixture',email:null}});
 });
 test('opaque access credentials have the expected entropy-bearing format',()=>{
  const values=Array.from({length:100},()=>opaqueToken(CONNECT_ACCESS_PREFIX));
  expect(new Set(values).size).toBe(100);expect(values.every(isConnectAccessToken)).toBe(true);
 });
});
