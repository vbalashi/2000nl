import {expect,test} from "@playwright/test";

test.use({viewport:{width:390,height:844}});
test("related words follow the shared translation toggle in Library and Training",async({page})=>{
 await page.goto("/dev/sense-card-gate?prototype=related-words");
 const translations=["(тёплый)","(раскалённый)","(холодный)"];
 for(const text of translations) await expect(page.getByText(text,{exact:true})).toBeHidden();
 await page.getByRole("button",{name:/translate/i}).click();
 for(const text of translations) await expect(page.getByText(text,{exact:true})).toBeVisible();
 await expect(page.getByText("warm",{exact:true})).toHaveAttribute("lang","nl");
 await expect(page.getByText("(тёплый)",{exact:true})).toHaveAttribute("lang","ru");
 await page.getByRole("button",{name:/translate/i}).click();
 for(const text of translations) await expect(page.getByText(text,{exact:true})).toBeHidden();
 await page.getByRole("button",{name:"Training",exact:true}).click();
 await page.getByRole("button",{name:/show answer/i}).click();
 for(const text of translations) await expect(page.getByText(text,{exact:true})).toBeHidden();
 await page.getByRole("button",{name:/translate/i}).click();
 for(const text of translations) await expect(page.getByText(text,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole("button",{name:/translate/i}).click();
 for(const text of translations) await expect(page.getByText(text,{exact:true})).toBeHidden();
});
