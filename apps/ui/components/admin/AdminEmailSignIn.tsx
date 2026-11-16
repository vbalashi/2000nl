"use client";
import React,{useEffect,useState} from 'react';

/** Tokens stay in the form and HttpOnly server session, never browser storage. */
export function AdminEmailSignIn() {
 const [enabled,setEnabled]=useState(false),[email,setEmail]=useState(''),[token,setToken]=useState(''),[enterCode,setEnterCode]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false),[accepted,setAccepted]=useState(false);
 useEffect(()=>{let active=true;void fetch('/api/admin/auth/email',{cache:'no-store'}).then(async response=>{if(response.ok && active)setEnabled((await response.json()).enabled===true);}).catch(()=>{});return()=>{active=false;};},[]);
 if(!enabled)return null;
 async function submit(event:React.FormEvent) {
  event.preventDefault();setBusy(true);setError(false);
  const verification=enterCode;const code=token;if(verification)setToken('');
  try {
   const response=await fetch(verification?'/api/admin/auth/email/verify':'/api/admin/auth/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(verification?{email,token:code}:{email})});
   if(!response.ok)throw new Error();
   if(verification){const result=await response.json();if(result.url!=='/admin')throw new Error();window.location.assign('/admin');}
   else {setEnterCode(true);setAccepted(true);}
  } catch {setError(true);} finally {setBusy(false);}
 }
 return <section className="mt-5 border-t border-slate-200 pt-5" aria-label="Вход по почте"><h2 className="mb-3 font-semibold">Вход по почте</h2><form onSubmit={event=>void submit(event)} className="space-y-3"><label className="block text-sm">Электронная почта<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"/></label>{enterCode&&<label className="block text-sm">Код из письма<input value={token} onChange={event=>setToken(event.target.value.replace(/\D/g,'').slice(0,10))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"/></label>}{accepted&&<p role="status" className="text-sm text-slate-600">Запрос принят. Если у этой учётной записи есть доступ, код придёт на почту.</p>}{error&&<p role="alert" className="text-sm text-red-700">Не удалось выполнить вход. Проверьте код и доступ к учётной записи.</p>}<button disabled={busy} className="min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{busy?'Подождите…':enterCode?'Войти по коду':'Получить код'}</button>{!enterCode&&<button type="button" className="text-sm text-primary underline" onClick={()=>setEnterCode(true)}>Уже есть код</button>}{enterCode&&<button type="button" disabled={busy} className="text-sm text-primary underline" onClick={()=>{setEnterCode(false);setToken('');setAccepted(false);}}>Запросить новый код</button>}</form><p className="mt-3 text-xs text-slate-500">Сессия действует до 7 дней. Выход или отзыв прав закрывает доступ раньше.</p></section>;
}
