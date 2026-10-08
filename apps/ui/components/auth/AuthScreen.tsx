"use client";
import React, {useEffect, useState} from "react";
import type {FormEvent} from "react";
import {supabase} from "@/lib/supabaseClient";
import {BrandLogo} from "@/components/BrandLogo";
import {authCopy, authErrorCopy, detectAuthLanguage, type AuthLanguage} from "./authCopy";
import styles from "./authScreen.module.css";
const PENDING_OTP_STORAGE_KEY="auth:pendingOtpEmail";
const configuredLength=Number(process.env.NEXT_PUBLIC_SUPABASE_OTP_LENGTH??8);
const OTP_LENGTH=Number.isInteger(configuredLength)&&configuredLength>0&&configuredLength<=12?configuredLength:8;
type Action="send"|"verify"|"resend"|"google";
export function AuthScreen(){
 const [lang,setLang]=useState<AuthLanguage>("en"),[email,setEmail]=useState(""),[otp,setOtp]=useState("");
 const [sent,setSent]=useState(false),[manual,setManual]=useState(false),[pending,setPending]=useState<Action|null>(null);
 const [message,setMessage]=useState<{text:string;error:boolean}|null>(null);const t=authCopy[lang];
 useEffect(()=>{const language=detectAuthLanguage(navigator.language||navigator.languages?.[0]||"en");setLang(language);
 if(new URLSearchParams(window.location.search).get("error")==="auth_failed")setMessage({text:authCopy[language].callbackError,error:true});
 try{const stored=localStorage.getItem(PENDING_OTP_STORAGE_KEY);if(stored){setEmail(stored);setSent(true)}}catch{}},[]);
 const rememberEmail=(value:string|null)=>{try{if(value===null)localStorage.removeItem(PENDING_OTP_STORAGE_KEY);else localStorage.setItem(PENDING_OTP_STORAGE_KEY,value)}catch{}};
 const sendCode=async(action:"send"|"resend")=>{if(pending)return;setPending(action);setMessage(null);const address=email.trim();
 try{const {error}=await supabase.auth.signInWithOtp({email:address,options:{emailRedirectTo:`${process.env.NEXT_PUBLIC_SITE_URL||window.location.origin}/auth/callback`}});if(error)throw error;setEmail(address);setSent(true);setOtp("");rememberEmail(address);if(action==="resend")setMessage({text:t.resent,error:false})}
 catch(error){setMessage({text:authErrorCopy(error,lang,"send"),error:true})}finally{setPending(null)}};
 const verify=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(pending)return;setPending("verify");setMessage(null);
 try{const {error}=await supabase.auth.verifyOtp({email:email.trim(),token:otp,type:"email"});if(error)throw error;rememberEmail(null);setMessage({text:t.success,error:false})}
 catch(error){setMessage({text:authErrorCopy(error,lang,"verify"),error:true})}finally{setPending(null)}};
 const google=async()=>{if(pending)return;setPending("google");setMessage(null);
 try{const {data,error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:`${process.env.NEXT_PUBLIC_SITE_URL||window.location.origin}/auth/callback`,queryParams:{access_type:"offline",prompt:"consent"},skipBrowserRedirect:true}});if(error)throw error;if(!data?.url)throw new Error("missing redirect");rememberEmail(null);window.location.assign(data.url)}
 catch(error){setMessage({text:authErrorCopy(error,lang,"google"),error:true});setPending(null)}};
 const changeEmail=()=>{setSent(false);setManual(false);setOtp("");setMessage(null);rememberEmail(null)};
 const codeStep=sent||manual;
 const feedback=message?<p role={message.error?"alert":"status"} className={`${styles.message} ${message.error?styles.error:""}`}>{message.text}</p>:null;
 const emailField=<label className={styles.field}>{t.email}<input type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} disabled={!!pending} onChange={e=>setEmail(e.target.value)} className={styles.input} placeholder={t.emailPlaceholder}/></label>;
 return <main className={styles.page} lang={lang}><div className={styles.content}>
 <BrandLogo className={styles.logo} accentClassName={styles.accent}/>
 <header className={styles.header}><h1>{codeStep?t.codeTitle:t.title}</h1><p>{codeStep?t.codeIntro:t.intro}{sent?<strong className={styles.email}>{email}</strong>:null}</p></header>
 {!codeStep?<><button className={`${styles.button} ${styles.google}`} type="button" onClick={()=>void google()} disabled={!!pending}><img src="/auth/google-g.png" alt="" width="20" height="20"/>{pending==="google"?t.googleLoading:t.google}</button><div className={styles.divider}>{t.or}</div>
 <form className={styles.form} onSubmit={e=>{e.preventDefault();void sendCode("send")}} aria-busy={pending==="send"}>{emailField}{feedback}<button className={`${styles.button} ${styles.primary}`} disabled={!!pending} type="submit">{pending==="send"?t.sending:t.send}</button></form>
 <p className={styles.note}>{t.passwordless}</p><div className={styles.links}><button type="button" className={styles.link} disabled={!!pending} onClick={()=>{setManual(true);setMessage(null)}}>{t.haveCode}</button></div></>:<>
 <form className={styles.form} onSubmit={verify} aria-busy={pending==="verify"}>{!sent?emailField:null}
 <label className={styles.field}>{t.code}<input className={`${styles.input} ${styles.code}`} type="text" inputMode="numeric" autoComplete="one-time-code" required minLength={OTP_LENGTH} maxLength={OTP_LENGTH} pattern={`[0-9]{${OTP_LENGTH}}`} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,OTP_LENGTH))} disabled={!!pending} placeholder={"0".repeat(OTP_LENGTH)} autoFocus/></label>
 {feedback}<button className={`${styles.button} ${styles.primary}`} type="submit" disabled={!!pending||!email}>{pending==="verify"?t.verifying:t.verify}</button></form><p className={styles.note}>{t.help}</p>
 <div className={styles.links}>{sent?<button type="button" className={styles.link} disabled={!!pending} onClick={()=>void sendCode("resend")}>{pending==="resend"?t.sending:t.resend}</button>:null}<button type="button" className={styles.link} disabled={!!pending} onClick={changeEmail}>{sent?t.change:t.back}</button></div></>}
 </div></main>;
}
