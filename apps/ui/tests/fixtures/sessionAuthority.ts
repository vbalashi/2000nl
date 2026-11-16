import { encryptProviderSession } from '@/lib/connect/sessionCredentials';
export const fixtureConnectToken='nlc_a2_'+ 'a'.repeat(43);
export const fixtureAuthSessionId='11111111-1111-4111-8111-111111111168';
export const fixtureProviderToken='header.'+Buffer.from(JSON.stringify({session_id:fixtureAuthSessionId})).toString('base64url')+'.signature';
// Route unit tests mock the DB session-authority RPC separately from the
// business RPC under test. Real role/claims/GoTrue coverage lives in integration.
export function withSessionAuthorityFactory(factory:(...args:any[])=>any) {
 return (...args:any[])=>{
  const client=factory(...args);if(!client)return client;
  return {...client,rpc:(name:string,...params:any[])=>name==='check_first_party_session_v1'
   ? Promise.resolve({data:true,error:null}):client.rpc?.(name,...params)};
 };
}
export function connectedSessionFixture(id='session-1',user='user-1') {
 process.env.CONNECT_SESSION_ENCRYPTION_KEY=Buffer.alloc(32,68).toString('base64');
 return {grant_revision:"fixture-grant",refresh_token_family_hashes:[],credential_version:2,auth_session_id:fixtureAuthSessionId,
  refresh_token_expires_at:new Date(Date.now()+86400000).toISOString(),
  provider_session_ciphertext:encryptProviderSession({proof:'fixture-proof',session:{access_token:fixtureProviderToken,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user} as any}},id)};
}
