import {getUiMessages,formatUiMessage} from '@/lib/uiMessages';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
/** Exact selected meanings are optional while an older database is still serving pages. */
export function formatLibraryCounts(language:OnboardingLanguage,articles:number,meanings?:number|null):string {
 const number=new Intl.NumberFormat(language);
 if(meanings==null)return formatUiMessage(getUiMessages(language).librarySearch.foundCount,{count:number.format(articles)});
 const rules=new Intl.PluralRules(language);
 const word=(count:number,forms:{other:string;[key:string]:string|undefined})=>forms[rules.select(count)]??forms.other;
 const article=language==='ru'?{one:'статья',few:'статьи',many:'статей',other:'статьи'}:language==='nl'?{one:'artikel',other:'artikelen'}:{one:'article',other:'articles'};
 const meaning=language==='ru'?{one:'значение',few:'значения',many:'значений',other:'значения'}:language==='nl'?{one:'betekenis',other:'betekenissen'}:{one:'meaning',other:'meanings'};
 return `${number.format(articles)} ${word(articles,article)}`+(meanings==null?'':` · ${number.format(meanings)} ${word(meanings,meaning)}`);
}
