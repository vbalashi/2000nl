import 'server-only';
import { request } from 'node:http';

/** Private host socket only; the browser never receives a token or Vault response. */
export async function storeBotToken(botId:string,operation:string,token:string):Promise<string> {
 const socketPath=process.env.OPERATOR_SECRET_BROKER_SOCKET;
 if(!socketPath || !socketPath.startsWith('/') || socketPath.includes('\0') || socketPath.length>100)throw new Error('secret storage unavailable');
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!uuid.test(botId) || !uuid.test(operation) || !/^[0-9]{1,20}:[A-Za-z0-9_-]{1,200}$/.test(token))throw new Error('invalid secret operation');
 const body=JSON.stringify({botId,operation,token});
 return new Promise((resolve,reject)=>{
  let settled=false;
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const fail=()=>{if(!settled){settled=true;clearTimeout(timeout);reject(new Error('secret storage unavailable'));}};
  const req=request({socketPath,path:'/v1/bot-token',method:'PUT',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
   const chunks:Buffer[]=[];let size=0;
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1024){res.destroy();fail();}else chunks.push(chunk);});
   res.on('error',fail);res.on('aborted',fail);
   res.on('end',()=>{
    try {
     if(res.statusCode!==200)throw new Error();
     const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     if(value.operation!==operation || typeof value.version!=='string' || !/^[0-9a-f]{32}$/.test(value.version))throw new Error();
     if(!settled){settled=true;clearTimeout(timeout);resolve(value.version);}
    }catch{fail();}
   });
  });
  timeout=setTimeout(()=>{req.destroy();fail();},15000);
  req.on('error',fail);req.end(body);
 });
}
