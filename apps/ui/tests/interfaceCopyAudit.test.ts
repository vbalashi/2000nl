// @vitest-environment node
import {afterEach, expect, test} from "vitest";
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
const directories: string[] = [];
afterEach(() => {for (const directory of directories.splice(0)) rmSync(directory,{recursive:true,force:true});});
function fixture(files: Record<string,string>) {
  const root = mkdtempSync(path.join(tmpdir(), "interface-copy-audit-"));directories.push(root);
  function save(file: string, text: string) {const target=path.join(root,file);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,text);}
  for(const [file,text] of Object.entries(files))save(file,text);
  const run=()=>{const result=spawnSync(process.execPath,[path.resolve("scripts/interface-copy-audit.mjs"),"--root",root,"--json"],{encoding:"utf8"});expect(result.stderr).toBe("");return {status:result.status,...JSON.parse(result.stdout)};};
  return {run,save,root};
}

test("rejects hardcoded settings notes in JSX, variables, templates, ternaries and local helpers",()=>{
 const f=fixture({"components/Settings.tsx":`const note="Translations are provided by AI"; const helper=()=>"AI may make mistakes";
 export function Settings({enabled,name}){return <section><p>New setting description</p><p>{note}</p><p>{\`\${note}\`}</p><p>{helper()}</p><button title={enabled?"Show information":"Hide information"} aria-label={\`Explain \${name}\`}>Continue</button></section>}`});
 const result=f.run();expect(result.status).toBe(1);
 expect(result.issues.map((issue:{text:string})=>issue.text)).toEqual(expect.arrayContaining(["Translations are provided by AI","AI may make mistakes","New setting description","Show information","Hide information","Explain {…}","Continue"]));
});

test("checks column arrays, named label objects, non-JSX helpers and independent app routes",()=>{
 const f=fixture({
  "components/Table.tsx":`const headings=["Word","Translation"];const pairs=[["first","Examples"],["last","Meanings"]];export const Table=()=> <table><tr>{headings.map(heading=><th>{heading}</th>)}{pairs.map(([id,label])=><th key={id}>{label}</th>)}</tr></table>;`,
  "lib/presentation/columns.ts":`export const columns=[{id:"a",label:"Untranslated header"}];`,
  "app/connect/page.tsx":`export default function Page(){return <><button>Connect app</button><Table columns={["Column from prop"]}/><Help helpText="An explanation"/></>}`,
 });
 const result=f.run();expect(result.status).toBe(1);
 expect(result.issues.map((issue:{text:string})=>issue.text)).toEqual(expect.arrayContaining(["Word","Translation","Examples","Meanings","Untranslated header","Connect app","Column from prop","An explanation"]));
});

test("traces displayed message state and rejects raw provider errors",()=>{
 const f=fixture({"components/Notice.tsx":`import {useState} from "react";export function Notice({error}){const [message,setMessage]=useState(null);const show=()=>setMessage(error.message);return <p>{message}</p>;}`});
 const result=f.run();expect(result.status).toBe(1);expect(result.issues.some((issue:{text:string})=>issue.text.includes("Raw error.message"))).toBe(true);
});

test("accepts catalog-backed copy, interpolation parameters and non-UI identifiers",()=>{
 const f=fixture({"components/Settings.tsx":`const kind="loading";const modes=["new","review"];export const Settings=({copy,count})=><section aria-label={copy.title}>{modes.map(id=><button key={id}>{copy.modes[id]}</button>)}<p>{kind==="loading"?copy.loading:copy.ready}</p><p>{count} / {count}</p></section>;`,"app/api/health/route.ts":`export const status={message:"Machine health details"}`});
 expect(f.run()).toMatchObject({status:0,issues:[]});
});

test("admin tools are explicitly outside learner scope and exceptions must be exact and used",()=>{
 const f=fixture({"components/admin/Console.tsx":`export const Admin=()=> <h1>Operator console</h1>;`,"components/Forms.ts":`export const form={label:"Form"};`});
 expect(f.run().status).toBe(1);
 f.save("locales/copy-audit-exceptions.json",JSON.stringify([{file:"components/Forms.ts",rule:"property",text:"Form",reason:"Semantic identity localized by the renderer."}]));
 expect(f.run()).toMatchObject({status:0,issues:[]});
 f.save("components/Forms.ts",`export const form={label:copy.form};`);
 expect(f.run().issues[0].rule).toBe("exception");
 // The exception for a semantic property must not permit visible JSX prose.
 f.save("components/Forms.tsx",`export const Form=()=> <span>Form</span>;`);
 expect(f.run().issues.some((issue:{rule:string})=>issue.rule==="jsx")).toBe(true);
});

test("same-named state in different components does not mix catalog keys with rendered prose",()=>{
 const f=fixture({"components/Notices.tsx":`import {useState} from "react";
 function Keys({copy}){const[message,setMessage]=useState(null);setMessage("pending");return <p>{copy[message]}</p>;}
 function Raw(){const[message,setMessage]=useState(null);setMessage("saved");return <p>{message}</p>;}`});
 const result=f.run();expect(result.status).toBe(1);
 expect(result.issues.some((issue:{text:string})=>issue.text==="saved")).toBe(true);
 expect(result.issues.some((issue:{text:string})=>issue.text==="pending")).toBe(false);
});

test("rejects literal formatter text and misspelled catalog keys, including local lookup wrappers",()=>{
 const f=fixture({
  "locales/en.json":JSON.stringify({ui:{settings:{title:"Languages"}}}),
  "components/Settings.tsx":`const t=key=>platformV2Message(language,key);export const Settings=({word})=><section><h1>{t("ui.settings.title")}</h1><p>{formatMessage("Uncatalogued AI note for {word}",{word})}</p><p>{platformV2Message(language,"ui.settings.missing")}</p><p>{t("ui.settings.typo")}</p></section>;`,
 });
 const result=f.run();expect(result.status).toBe(1);
 expect(result.issues.map((issue:{text:string})=>issue.text)).toEqual(expect.arrayContaining(["Uncatalogued AI note for {word}","Unknown catalog message: ui.settings.missing","Unknown catalog message: ui.settings.typo"]));
 expect(result.issues.some((issue:{text:string})=>issue.text==="Unknown catalog message: ui.settings.title")).toBe(false);
});

test("checks CSS generated prose and imperative DOM text while allowing spacing glyphs",()=>{
 const f=fixture({
  "styles/notices.css":`.hint::after{content:"AI translations may contain errors"}.space::before{content:"\\00a0"}`,
  "components/Measure.ts":`const node=document.createElement("span");node.textContent="New settings explanation";`,
 });
 const result=f.run();expect(result.status).toBe(1);
 expect(result.issues.map((issue:{text:string})=>issue.text)).toEqual(expect.arrayContaining(["AI translations may contain errors","New settings explanation"]));
 expect(result.issues).toHaveLength(2);
});
