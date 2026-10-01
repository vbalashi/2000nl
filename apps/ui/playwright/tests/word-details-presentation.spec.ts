import {expect,test} from '@playwright/test';
import {gateBankGroup,gateFurnitureEntry} from '../../lib/platform/fixtures/senseCardV1GateFixture';
import {projectPlatformV2WordDetails} from '../../lib/platform/platformV2RichContent';

// Shared forms are part of the independently enabled article presentation.
test.skip(process.env.NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1 !== 'true', 'Shared article presentation is opt-in.');
const wordDetails=projectPlatformV2WordDetails({id:gateFurnitureEntry.entryId,headword:'gaan',raw:{verb_forms:['ging','is gegaan'],conjugation_table:{present:{ik:'ga',wij:'gaan'},past:{ik:'ging',wij:'gingen'},perfect:{auxiliary:'is',participle:'gegaan'}},meanings:[{synonyms:['zich bewegen']}]}},[])!;
const group={...gateBankGroup,header:{...gateBankGroup.header,text:'gaan',article:undefined,displayPronunciation:undefined,partOfSpeech:{termId:'partOfSpeech.ww',messageKey:'partOfSpeech.ww',sourceValue:'ww'}},entries:[{...gateFurnitureEntry,wordDetails}],senseCount:1,entryCount:1};
for(const width of [320,430,1440])for(const colorScheme of ['light','dark'] as const)test(`shared forms and relations at ${width} ${colorScheme}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:width===320?568:932});await page.emulateMedia({colorScheme});
 await page.route('**/api/platform/v2/lookup',route=>route.fulfill({json:{contractVersion:'platform-lookup-v2',query:'gaan',request:{...route.request().postDataJSON(),contentLanguageCode:'nl',translationTargetLanguageCode:null},groups:[group],page:{selectedTierComplete:true,nextGroupCursor:null}}}));
 await page.goto(`/dev/sense-card-gate?prototype=details&size=largest${width<1024?'&wrapper=drawer':''}`);
 if(colorScheme==='dark')await page.evaluate(()=>document.documentElement.classList.add('dark'));
 const panel=page.getByTestId('library-sense-card-group');await expect(panel).toBeVisible();
 const disclosure=panel.getByRole('button',{name:'Meer vormen van gaan tonen',exact:true});
 await expect(disclosure).toBeVisible();await disclosure.click();
 await expect(panel.getByRole('table')).toBeVisible();await expect(panel.getByText('is gegaan',{exact:true})).toHaveCount(1);
 await expect(panel.getByText('zich bewegen',{exact:true})).toBeVisible();
 const scroll=page.getByTestId('library-sense-card-scroll-region');await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);
 await expect(panel.getByRole('button',{name:'Meer vormen van gaan verbergen',exact:true})).toBeInViewport({ratio:1});
 const bounds=await scroll.evaluate(e=>({width:e.scrollWidth,client:e.clientWidth}));expect(bounds.width).toBeLessThanOrEqual(bounds.client+1);
 await expect(page.getByRole('button',{name:'Kopieer naar mijn woordenboek',exact:true})).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('shared-forms.png')});
});
