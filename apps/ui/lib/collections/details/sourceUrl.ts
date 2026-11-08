/** Accept pasted website addresses; keep the stored source link explicitly HTTP(S). */
export function normalizeSourceUrl(value:string):{ok:true;value:string|null}|{ok:false}{
 const text=value.trim();if(!text)return {ok:true,value:null};
 const candidate=text.startsWith('//')?`https:${text}`:/^[a-z][a-z\d+.-]*:/i.test(text)?text:`https://${text}`;
 const authority=candidate.match(/^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i)?.[1];
 if(authority&&/\s/.test(authority))return {ok:false};
 try{const url=new URL(candidate);if(!['http:','https:'].includes(url.protocol)||!url.hostname||/[\s%]/.test(url.hostname))return {ok:false};return {ok:true,value:url.href};}catch{return {ok:false};}
}
