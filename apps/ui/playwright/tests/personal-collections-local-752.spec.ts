import {expect,test} from "@playwright/test";
import {accountTextSizeStyles} from "../../lib/reading/textScale";

test("@local-labels personal organization persists through real authenticated API",async({page,request,baseURL})=>{
 test.skip(process.env.COLLECTION_ORGANIZATION_QA!=="1","Requires reviewed local contract230 and feature");
 test.setTimeout(150_000);
 expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
 const health=await (await request.get("/api/health?deep=1")).json();
 expect(health.status).toBe("ok");expect(health.database.target).toBe("local");expect(health.database.contract.expectedMigration).toBeGreaterThanOrEqual(230);
 const prefix=`QA752-${Date.now()}`,collectionName=`${prefix}-lesson`,parentName=`${prefix}-parent`,childName=`${prefix}-child`;
 await page.goto("/dev/test-login?redirectTo=/");await page.waitForURL(url=>url.pathname==="/",{timeout:60_000});
 const token=await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(/^sb-.*-auth-token$/.test(key)){const value=JSON.parse(localStorage.getItem(key)!);if(value.access_token)return value.access_token as string;}throw new Error("Missing local QA session");});
 const headers={authorization:`Bearer ${token}`};
 const read=async()=>{const response=await request.get("/api/library/collection-labels",{headers});expect(response.ok()).toBeTruthy();return response.json();};
 const mutate=async(revision:number,operation:unknown)=>request.post("/api/library/collection-labels",{headers,data:{expectedRevision:revision,operation}});
 const save=async(close=true)=>{const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:/^(Save|Сохранить|Opslaan)$/}).click();if(close)await expect(dialog).toBeHidden();};
 const name=(value:string)=>page.getByRole("dialog").getByRole("textbox").fill(value);
 const enter=async()=>{await page.getByRole("button",{name:/^(Library|Библиотека|Bibliotheek)$/}).click();await page.getByRole("button",{name:/^(Collections|Коллекции|Collecties)$/}).click();await page.getByTestId("personal-collections").waitFor();};
 const more=(value:string)=>page.getByRole("button",{name:new RegExp(`(More actions|Действия|Acties): ${value}`)}).click();
 const deleteAction=()=>page.getByRole("menuitem",{name:/^(Delete|Удалить|Verwijderen)$/}).click();
 const confirmDelete=()=>page.getByRole("dialog").getByRole("button",{name:/^(Delete|Удалить|Verwijderen)$/}).click();
 await enter();
 await expect(page.getByRole("main")).toHaveCount(1);
 try {
  await page.getByRole("button",{name:/^(New collection|Новая коллекция|Nieuwe collectie)$/}).click();await name(collectionName);await save();
  await expect(page.getByRole("button",{name:collectionName,exact:true})).toBeVisible();
  await page.getByRole("button",{name:/^(New label|Новая метка|Nieuw label)$/}).click();await name(parentName);await save();
  await expect(page.getByRole("button",{name:parentName,exact:true})).toBeVisible();
  await page.getByRole("button",{name:/^(New label|Новая метка|Nieuw label)$/}).click();await name(childName);
  await page.getByRole("dialog").getByRole("combobox").selectOption({label:parentName});await save();
  await more(collectionName);await page.getByRole("menuitem",{name:/^(Choose labels|Выбрать метки|Labels kiezen)$/}).click();
  await page.getByRole("dialog").getByRole("checkbox",{name:parentName}).check();await save();
  let state=await read();const parent=state.labels.find((item:{name:string})=>item.name===parentName),child=state.labels.find((item:{name:string})=>item.name===childName);
  expect(child.parent_id).toBe(parent.id);expect(state.assignments.some((item:{label_id:string})=>item.label_id===parent.id)).toBeTruthy();
  for(let index=0;index<200;index++){
   const response=await mutate(state.revision,{type:"create",id:crypto.randomUUID(),name:`${prefix}-scale-${String(index).padStart(3,"0")}`});expect(response.ok()).toBeTruthy();state=await response.json();
  }
  await page.reload();await enter();await page.getByRole("button",{name:parentName,exact:true}).click();await expect(page.getByRole("button",{name:collectionName,exact:true})).toBeVisible();
  await more(parentName);await page.getByRole("menuitem",{name:/^(Edit label|Изменить метку|Label wijzigen)$/}).click();
  state=await read();expect((await mutate(state.revision,{type:"create",id:crypto.randomUUID(),name:`${prefix}-concurrent`})).ok()).toBeTruthy();
  await name(`${parentName}-renamed`);await save(false);await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();await expect(page.getByRole("dialog").getByRole("textbox")).toHaveValue(`${parentName}-renamed`);
  await save();await expect(page.getByRole("dialog")).toBeHidden();state=await read();expect(state.labels.find((item:{id:string})=>item.id===parent.id).parent_id).toBeNull();
  await more(`${parentName}-renamed`);await deleteAction();await confirmDelete();await expect(page.getByRole("dialog")).toBeHidden();
  state=await read();expect(state.labels.find((item:{id:string})=>item.id===child.id).parent_id).toBeNull();await expect(page.getByRole("button",{name:collectionName,exact:true})).toBeVisible();
  // Real largest account typography, without changing saved preferences.
  await page.evaluate(styles=>{const root=document.querySelector<HTMLElement>("[data-text-size]")!;for(const [key,value]of Object.entries(styles))root.style.setProperty(key,String(value));},accountTextSizeStyles("extra"));
  for(const width of [320,390,701,1280]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);}
  await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:/^(All collections|Все коллекции|Alle collecties)$/}).click();await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("textbox").fill("scale-199");await expect(page.getByRole("button",{name:`${prefix}-scale-199`,exact:true})).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toBeHidden();
 } finally {
  // Only this run's disposable objects; never reset the persistent QA database.
  let state=await read();for(const label of state.labels.filter((item:{name:string})=>item.name.startsWith(prefix))){const response=await mutate(state.revision,{type:"delete",id:label.id});expect(response.ok()).toBeTruthy();state=await response.json();}
  await page.setViewportSize({width:1280,height:800});await page.reload();await enter();
  const card=page.locator("article").filter({has:page.getByRole("button",{name:collectionName,exact:true})});
  if(await card.count()){await more(collectionName);await deleteAction();await confirmDelete();await expect(card).toBeHidden();}
 }
});
