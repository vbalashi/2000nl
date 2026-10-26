import {expect,test,type Locator} from "@playwright/test";
import {getUiMessages} from "../../lib/uiMessages";
import {organizationCopy} from "../../components/library/organization/copy";
import {platformV2Message} from "../../lib/platform/platformV2ClientI18n";
import type {OnboardingLanguage} from "../../lib/onboardingI18n";
import {mkdir} from "node:fs/promises";

test("@local-collection-words exact meanings and labels use the real Library",async({page,request,baseURL},testInfo)=>{
 test.skip(process.env.COLLECTION_WORDS_QA!=="1","Requires reviewed local contract231");test.setTimeout(180_000);page.setDefaultTimeout(15_000);
 expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
 const health=await(await request.get("/api/health?deep=1")).json();
 expect(health.status).toBe("ok");expect(health.database.target).toBe("local");expect(health.database.contract.expectedMigration).toBeGreaterThanOrEqual(231);
 const prefix=`QA753-${Date.now()}`,collectionName=`${prefix}-lesson`,labelName=`${prefix}-YouTube`;
 const output=process.env.COLLECTION_WORDS_QA_ARTIFACT_DIR ?? testInfo.outputPath("screenshots");await mkdir(output,{recursive:true});
 await page.setViewportSize({width:1280,height:900});await page.goto("/dev/test-login?redirectTo=/");await page.waitForURL(url=>url.pathname==="/",{timeout:60_000});
 const token=await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(/^sb-.*-auth-token$/.test(key)){const value=JSON.parse(localStorage.getItem(key)!);if(value.access_token)return value.access_token as string;}throw new Error("Missing local QA session");});
 const headers={authorization:`Bearer ${token}`};
 const readLabels=async()=>{const response=await request.get("/api/library/collection-labels",{headers});expect(response.ok()).toBeTruthy();return response.json();};
 await page.getByRole("button",{name:/^(Library|Библиотека|Bibliotheek)$/}).click();
 const libraryNav=page.getByRole("navigation",{name:/^(Library|Библиотека|Bibliotheek)$/});
 const wordsTab=libraryNav.getByRole("button",{name:/^(Words|Слова|Woorden)$/});const tabText=(await wordsTab.textContent())?.trim();
 const locale:OnboardingLanguage=tabText==="Слова"?"ru":tabText==="Woorden"?"nl":"en";
 const ui=getUiMessages(locale),org=organizationCopy(locale),message=(key:string,variables?:Record<string,string|number>)=>platformV2Message(locale,key,variables);
 const catalog=async()=>{await libraryNav.getByRole("button",{name:org.collections,exact:true}).click();await page.getByTestId("personal-collections").waitFor();};
 const save=async()=>{const dialog=page.getByRole("dialog");await dialog.getByRole("button",{name:org.save,exact:true}).click();await expect(dialog).toBeHidden();};
 const more=async(name:string)=>page.getByRole("button",{name:`${org.more}: ${name}`,exact:true}).click();
 const rows=()=>page.locator('[data-testid="library-headword-group-row"]:visible');
 const cards=()=>page.locator('article[data-entry-id][data-testid^="library-sense-card-"]:visible');
 const card=(id:string)=>page.locator(`article[data-entry-id="${id}"]:visible`);
 const expand=async(target:Locator)=>{if(await target.getAttribute("data-expanded")!=="true")await target.getByRole("button",{name:message("senseCard.expand"),exact:true}).click();await expect(target).toHaveAttribute("data-expanded","true");};
 let failure:unknown;
 const toggle=async(id:string,included:boolean)=>test.step(`${included?"Remove":"Add"} exact meaning ${id}`,async()=>{const target=card(id);await expand(target);await target.getByRole("button",{name:new RegExp(`^${message("senseCard.collections.label")}`)}).click();await page.getByRole("menuitem",{name:message(included?"senseCard.collections.removeCurrent":"senseCard.collections.addCurrent",{name:collectionName}),exact:true}).click();await expect(target).toHaveAttribute("data-current-collection",included?"excluded":"included");});
 try{
  await catalog();await page.getByRole("button",{name:org.newCollection,exact:true}).click();await page.getByRole("dialog").getByRole("textbox").fill(collectionName);await save();
  await expect(page.getByRole("button",{name:collectionName,exact:true})).toBeVisible();
  await wordsTab.click();
  const searched=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/library/search"&&response.request().postDataJSON()?.query==="bank"&&response.ok());
  await page.getByRole("textbox",{name:ui.library.search,exact:true}).fill("bank");
  const lookup=await(await searched).json();
  const group=lookup.groups.find((item:{senseCount:number})=>item.senseCount>1);
  expect(group,"Local fixture must contain a readable bank source group with multiple exact meanings").toBeTruthy();
  await page.locator(`[data-testid="library-headword-group-${group.headwordGroupId}"]:visible`).click();
  const meaningCount=group.senseCount;await expect(cards()).toHaveCount(meaningCount);
  const entryId=(await cards().first().getAttribute("data-entry-id"))!,siblingId=(await cards().nth(1).getAttribute("data-entry-id"))!;
  await expand(card(entryId));await card(entryId).getByRole("button",{name:new RegExp(`^${message("senseCard.collections.label")}`)}).click();
  const picker=page.getByRole("dialog"),choice=picker.getByRole("checkbox",{name:new RegExp(collectionName)});
  await expect(choice).toBeEnabled();await choice.click();await expect(choice).toBeChecked();await expect(choice).toBeEnabled();await page.keyboard.press("Escape");await expect(picker).toBeHidden();
  await catalog();await page.getByRole("button",{name:collectionName,exact:true}).click();await expect(rows()).toHaveCount(1);await expect(card(entryId)).toHaveAttribute("data-current-collection","included");await expect(card(siblingId)).toHaveAttribute("data-current-collection","excluded");expect(await cards().count()).toBe(meaningCount);
  await page.screenshot({path:`${output}/desktop-light.png`,fullPage:true});
  await page.getByRole("button",{name:ui.library.filters,exact:true}).click();const filters=page.getByRole("dialog",{name:ui.library.filterTitle});await filters.getByRole("button",{name:ui.builder.parts.Nouns,exact:true}).click();await filters.getByRole("button",{name:ui.library.showResults,exact:true}).click();await expect(filters).toBeHidden();await expect(rows()).toHaveCount(1);await expect(card(entryId)).toHaveAttribute("data-current-collection","included");
  await toggle(siblingId,false);await toggle(siblingId,true);await toggle(entryId,true);await expect(rows()).toHaveCount(0);await expect(card(entryId)).toBeVisible();await toggle(entryId,false);await expect(rows()).toHaveCount(1);
  await catalog();await page.getByRole("button",{name:org.newLabel,exact:true}).click();await page.getByRole("dialog").getByRole("textbox").fill(labelName);await save();
  await more(collectionName);await page.getByRole("menuitem",{name:org.assign,exact:true}).click();await page.getByRole("dialog").getByRole("checkbox",{name:labelName,exact:true}).check();await save();await more(labelName);await page.getByRole("menuitem",{name:org.open,exact:true}).click();await expect(rows()).toHaveCount(1);await expect(cards().first()).toBeVisible();await expect(cards().first()).not.toHaveAttribute("data-current-collection");
  await catalog();await page.getByRole("button",{name:collectionName,exact:true}).click();await expect(card(entryId)).toHaveAttribute("data-current-collection","included");await page.setViewportSize({width:390,height:844});await rows().first().getByRole("button").click();await expect(card(entryId)).toBeVisible();await expect(card(siblingId)).toHaveAttribute("data-current-collection","excluded");expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:`${output}/mobile-light.png`,fullPage:true});
  await page.evaluate(()=>document.documentElement.classList.add("dark"));
  await page.waitForTimeout(500); // Screenshot phase: allow theme color transitions to finish.
  await page.screenshot({path:`${output}/mobile-dark.png`,fullPage:true});
  const includedBackground=await card(entryId).evaluate(element=>getComputedStyle(element).backgroundColor);
  const shades=await card(siblingId).evaluate(excludedCard=>{
   const canvas=document.createElement("canvas");canvas.width=canvas.height=1;const context=canvas.getContext("2d")!;
   const rgb=(color:string)=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3);};
   const luminance=(values:number[])=>values.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((n,value,index)=>n+value*[.2126,.7152,.0722][index],0);
   const background=getComputedStyle(excludedCard).backgroundColor,foreground=getComputedStyle(excludedCard.querySelector<HTMLElement>("[data-meaning-lead]")!).color,a=luminance(rgb(background)),b=luminance(rgb(foreground));
   return {excluded:background,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
  expect(includedBackground).not.toBe(shades.excluded);expect(shades.contrast).toBeGreaterThanOrEqual(4.5);
  const handle=page.getByRole("button",{name:ui.library.expandCard,exact:true});
  await handle.press("End");await page.waitForTimeout(500); // Sheet resize/theme evidence only.
  await expect(card(entryId).getByTestId("library-sense-card-lead")).toBeInViewport();
  await expect(card(siblingId).getByTestId("library-sense-card-lead")).toBeInViewport();
  await page.screenshot({path:`${output}/mobile-dark-meanings.png`,fullPage:true});
  await page.getByRole("button",{name:message("common.close"),exact:true}).click();
  await page.setViewportSize({width:1280,height:900});
  await expect(card(entryId)).toHaveAttribute("data-current-collection","included");
  await expect(card(siblingId)).toHaveAttribute("data-current-collection","excluded");
  await expect(card(entryId).getByTestId("library-sense-card-lead")).toBeInViewport();
  await expect(card(siblingId).getByTestId("library-sense-card-lead")).toBeInViewport();
  await page.waitForTimeout(500); // Final screenshot after responsive/theme transitions.
  await page.screenshot({path:`${output}/desktop-dark.png`,fullPage:true});
 }catch(error){failure=error;}finally{
  try{
  let snapshot=await readLabels();for(const label of snapshot.labels.filter((item:{name:string})=>item.name.startsWith(prefix))){const response=await request.post("/api/library/collection-labels",{headers,data:{expectedRevision:snapshot.revision,operation:{type:"delete",id:label.id}}});expect(response.ok()).toBeTruthy();snapshot=await response.json();}
  await page.setViewportSize({width:1280,height:900});await page.reload();await page.getByRole("button",{name:/^(Library|Библиотека|Bibliotheek)$/}).click();await catalog();
  if(await page.getByRole("button",{name:collectionName,exact:true}).count()){await more(collectionName);await page.getByRole("menuitem",{name:org.remove,exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:org.remove,exact:true}).click();await expect(page.getByRole("button",{name:collectionName,exact:true})).toBeHidden();}
  }catch(cleanupError){if(!failure)throw cleanupError;}
 }
 if(failure)throw failure;
});
