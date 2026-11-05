import {getUiMessages,formatUiMessage,formatUiCount} from '@/lib/uiMessages';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';
/** Exact selected meanings are optional while an older database is still serving pages. */
export function formatLibraryCounts(language:OnboardingLanguage,articles:number,meanings?:number|null):string {
 const copy=getUiMessages(language).librarySearch;
 if(meanings==null)return formatUiMessage(copy.foundCount,{count:new Intl.NumberFormat(language).format(articles)});
 return formatUiMessage(copy.articleMeaningCount,{
  articles:formatUiCount(language,articles,copy,'articleCount'),
  meanings:formatUiCount(language,meanings,copy,'meaningCount'),
 });
}
