import {afterEach,expect,test,vi} from 'vitest';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
vi.mock('server-only',()=>({}));
import {storeBotToken} from '@/lib/operatorNotifications/secretBroker';
afterEach(()=>{vi.unstubAllEnvs();});
const bot='11111111-1111-4111-8111-111111111111',operation='22222222-2222-4222-8222-222222222222';
async function exchange(reply:unknown){
 const dir=await mkdtemp(join(tmpdir(),'nl-broker-'));const path=join(dir,'b.sock');
 const server=createServer((req,res)=>{req.resume();req.on('end',()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(reply));});});
 await new Promise<void>(resolve=>server.listen(path,resolve));vi.stubEnv('OPERATOR_SECRET_BROKER_SOCKET',path);
 try{return await storeBotToken(bot,operation,'123:synthetic_token');}finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await rm(dir,{recursive:true});}
}
test('returns only a receipt for the requested operation',async()=>{expect(await exchange({operation,version:'a'.repeat(32),token:'do-not-return'})).toBe('a'.repeat(32));});
test('rejects stale operation responses without exposing provider data',async()=>{await expect(exchange({operation:bot,version:'a'.repeat(32),error:'secret'})).rejects.toThrow('secret storage unavailable');});
test('rejects network endpoints as broker configuration',async()=>{vi.stubEnv('OPERATOR_SECRET_BROKER_SOCKET','https://evil.test');await expect(storeBotToken(bot,operation,'123:synthetic_token')).rejects.toThrow('secret storage unavailable');});
