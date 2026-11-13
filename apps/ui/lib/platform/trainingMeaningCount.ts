import type {DictionaryLookupPayload} from "./lookupService";

const record = (value:unknown):Record<string,unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};

/**
 * A filtered row count is not a total. The training-group reader returns every
 * active member only for curated dictionaries: entry_access_v1 applies the same
 * dictionary-level train permission to all members. User dictionaries instead
 * have per-entry sharing and cannot establish completeness from visible rows.
 * Do not broaden this rule without an authoritative membership-complete signal.
 */
export function completeTrainingMeaningCount(payload:unknown, target:DictionaryLookupPayload, bound:number):number|undefined {
  const article=record(payload), page=record(article.page), targetIdentity=record(record(target).platform_v2_identity);
  if(article.error || page.selectedTierComplete!==true || page.nextGroupCursor!==null ||
    !Array.isArray(article.items) || article.items.length<1 || article.items.length>bound ||
    typeof targetIdentity.headwordGroupId!=="string" || !targetIdentity.headwordGroupId ||
    targetIdentity.entryId!==target.id ||
    !Number.isSafeInteger(targetIdentity.meaningOrdinal) || Number(targetIdentity.meaningOrdinal)<1 ||
    typeof target.dictionary_id!=="string" || !target.dictionary_id || record(target.dictionary).id!==target.dictionary_id ||
    record(target.dictionary).kind!=="curated") return undefined;
  const ids=new Set<string>(), ordinals=new Set<number>();
  let found=false;
  for(const value of article.items) {
    const item=record(value), dictionary=record(item.dictionary), identity=record(item.platform_v2_identity);
    if(typeof item.id!=="string" || !item.id || ids.has(item.id) ||
      dictionary.kind!=="curated" || dictionary.id!==target.dictionary_id || item.dictionary_id!==target.dictionary_id ||
      identity.entryId!==item.id || identity.headwordGroupId!==targetIdentity.headwordGroupId ||
      !Number.isSafeInteger(identity.meaningOrdinal) || Number(identity.meaningOrdinal)<1 ||
      ordinals.has(Number(identity.meaningOrdinal))) return undefined;
    ids.add(item.id);ordinals.add(Number(identity.meaningOrdinal));
    if(item.id===target.id) {
      if(identity.meaningOrdinal!==targetIdentity.meaningOrdinal)return undefined;
      found=true;
    }
  }
  if(!found || !Array.from({length:ids.size},(_,index)=>index+1).every(ordinal=>ordinals.has(ordinal)))return undefined;
  return ids.size;
}
