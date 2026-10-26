import {platformV2Message} from "@/lib/platform/platformV2ClientI18n";
import {formatUiMessage, getUiMessages} from "@/lib/uiMessages";
import {afterEach, expect, test, vi} from "vitest";
import defaults from "../../../packages/shared/dictionary-source/defaults.json";
import {dictionarySourceProfile, dictionarySourceReference, isDictionarySourceList, isDictionaryMirror} from "@/lib/dictionary/sourceProfile";
afterEach(()=>{vi.unstubAllEnvs();});
test("keeps the current catalog identity and exact RPC reference field by default",()=>{
  expect(dictionarySourceProfile()).toEqual(defaults);
  expect(isDictionarySourceList({type:"curated",name:`  ${defaults.fullListName.toUpperCase()}  `})).toBe(true);
  expect(isDictionarySourceList({type:"user",name:defaults.fullListName})).toBe(false);
  expect(dictionarySourceReference({[defaults.sourceRankKey]:17})).toEqual({[defaults.sourceRankKey]:17});
  expect(Object.keys(dictionarySourceReference({}))).toEqual([defaults.sourceRankKey]);
});
test("accepts private catalog labels without changing list eligibility or a legacy response shape",()=>{
  vi.stubEnv("NEXT_PUBLIC_DICTIONARY_SOURCE_PROFILE",JSON.stringify({fullListName:"Example Source",fullListSlug:"example-all",sourceRankKey:"legacyReference"}));
  expect(isDictionarySourceList({type:"curated",name:"example source"})).toBe(true);
  expect(dictionarySourceReference({legacyReference:42})).toEqual({legacyReference:42});
  expect(isDictionaryMirror({listType:"curated",slug:"example-all",total:12},{kind:"dictionary",name:"Example Source Dutch",total:12})).toBe(true);
  expect(isDictionaryMirror({listType:"curated",slug:"example-all",total:12},{kind:"dictionary",name:"Example Sourcery",total:12})).toBe(false);
});
test("rejects malformed or secret-shaped configuration without echoing it",()=>{
  for(const value of ["not-json", "[]", JSON.stringify({API_KEY:"private-marker"}),JSON.stringify({fullListName:""}),JSON.stringify({sourceRankColumn:'x; SELECT 1'})]){
    vi.stubEnv("NEXT_PUBLIC_DICTIONARY_SOURCE_PROFILE",value);
    expect(()=>dictionarySourceProfile()).toThrow("invalid_dictionary_source_profile");
  }
});

test("only hides a matching full dictionary mirror with the same material count", () => {
  vi.stubEnv("NEXT_PUBLIC_DICTIONARY_SOURCE_PROFILE", JSON.stringify({fullListName: "Example Source", fullListSlug: "example-all"}));
  const collection = {listType: "curated", slug: "example-all", total: 12};
  const dictionary = {kind: "dictionary", name: "EXAMPLE SOURCE Dutch", total: 12};
  expect(isDictionaryMirror(collection, dictionary)).toBe(true);
  expect(isDictionaryMirror(collection, {...dictionary, total: 11})).toBe(false);
  expect(isDictionaryMirror({...collection, listType: "user"}, dictionary)).toBe(false);
  expect(isDictionaryMirror({...collection, slug: "another-list"}, dictionary)).toBe(false);
  expect(isDictionaryMirror(collection, {...dictionary, kind: "collection"})).toBe(false);
  expect(isDictionaryMirror(collection, {...dictionary, name: "Example Sources"})).toBe(false);
});

test("resolves the configured catalog message without a provider-specific locale key", () => {
  for (const language of ["en", "nl", "ru"] as const) {
    expect(platformV2Message(language, `dictionary.${defaults.catalogKey}`)).toBe(defaults.localizedName);
    expect(formatUiMessage(getUiMessages(language).settings.useDictionary, {language: "Dutch", dictionary: defaults.settingsName})).toContain(defaults.settingsName);
  }
  vi.stubEnv("NEXT_PUBLIC_DICTIONARY_SOURCE_PROFILE", JSON.stringify({catalogKey: "example-catalog", localizedName: "Example dictionary"}));
  expect(platformV2Message("en", "dictionary.example-catalog")).toBe("Example dictionary");
  expect(platformV2Message("en", "dictionary.unknown-catalog")).toBe("dictionary.unknown-catalog");
});
