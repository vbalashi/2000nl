import { supabase } from "../supabaseClient";

export type PersonalField = {
  kind: "example" | "note" | "synonym" | "reference" | "expression";
  text: string;
  targetEntryId?: string;
  children?: {kind: "example" | "explanation"; text: string}[];
};
export type PersonalSense = {entryId?: string; definition: string; fields?: PersonalField[]};

export async function savePersonalArticle(input: {
  languageCode: string;
  headword: string;
  partOfSpeech?: string | null;
  article?: "de" | "het" | null;
  kind?: "word" | "expression";
  senses: PersonalSense[];
  anchorEntryId?: string | null;
  beforeEntryId?: string | null;
}): Promise<string[]> {
  const {data,error} = await supabase.rpc("save_personal_article_v1", {
    p_language: input.languageCode, p_headword: input.headword, p_part: input.partOfSpeech ?? null,
    p_header: {article:input.article,kind:input.kind},
    p_senses: input.senses.map(sense => !sense.entryId && input.beforeEntryId
      ? {...sense, insertBeforeEntryId:input.beforeEntryId} : sense), p_anchor: input.anchorEntryId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string[];
}

export async function movePersonalMeaning(entryId: string, targetEntryId: string | null): Promise<void> {
  const {error} = await supabase.rpc("move_personal_meaning_v1", {p_entry: entryId, p_target: targetEntryId});
  if (error) throw new Error(error.message);
}

export function detachPersonalMeaning(entryId: string): Promise<void> {
  return movePersonalMeaning(entryId, null);
}

export type PersonalMoveTarget = {entryId:string; definitions:string[]};

export async function listPersonalMoveTargets(entryId: string): Promise<PersonalMoveTarget[]> {
  const {data,error} = await supabase.rpc("list_personal_move_targets_v1", {p_entry:entryId});
  if (error) throw new Error(error.message);
  return (data as {entry_id:string;definitions:string[]}[]).map(row => ({
    entryId: row.entry_id, definitions: row.definitions,
  }));
}
