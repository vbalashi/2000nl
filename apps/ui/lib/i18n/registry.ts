import {getInterfaceSnapshot, subscribeInterfaceSnapshot} from './runtime';
/** Message keys are compile-time checked; available locale identifiers are runtime data. */
export type InterfaceLanguage = string;
export const defaultInterfaceLanguage: InterfaceLanguage = 'en';
const locales=()=>Object.entries(getInterfaceSnapshot().registry).map(([code,value])=>({code,...value}));
export let interfaceLanguages = locales();
subscribeInterfaceSnapshot(()=>{interfaceLanguages=locales();});
export function isInterfaceLanguage(value:unknown):value is InterfaceLanguage {
  return typeof value==='string'&&Object.hasOwn(getInterfaceSnapshot().registry,value);
}
export function matchInterfaceLanguage(value:string|null|undefined):InterfaceLanguage|null {
  const code=value?.toLowerCase().replaceAll('_','-').split('-')[0];
  return isInterfaceLanguage(code)?code:null;
}
export function interfaceDirection(language:InterfaceLanguage):'ltr'|'rtl' {
  return getInterfaceSnapshot().registry[language]?.direction??'ltr';
}
export function interfaceFormattingLocale(language:InterfaceLanguage):string {
  return getInterfaceSnapshot().registry[language]?.formatLocale??language;
}
