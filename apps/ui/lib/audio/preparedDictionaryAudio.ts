import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {DictionaryLookupPayload} from "../platform/lookupService";
const hash=(value:string|Buffer)=>crypto.createHash("sha256").update(value).digest("hex");
/** Caller must authorize the source before resolution and reauthorize before delivery. */
export async function resolvePreparedDictionaryAudio(entry:DictionaryLookupPayload,text:string):Promise<{audio:Buffer;cached:true}|null>{
  const root=process.env.PREPARED_DICTIONARY_AUDIO_ROOT;
  if(!root)return null;
  const realRoot=await fs.realpath(root);
  const manifest=JSON.parse(await fs.readFile(path.join(realRoot,"manifest.json"),"utf8"));
  if(manifest.schema!=="prepared-dictionary-audio-v1"||typeof manifest.dictionarySlug!=="string")throw new Error("invalid_audio_manifest");
  if(entry.dictionary&&entry.dictionary.id!==entry.dictionary_id)throw new Error("invalid_audio_dictionary_identity");
  const dictionarySlug=entry.dictionary?.slug??entry.dictionary_slug;
  if(dictionarySlug!==manifest.dictionarySlug)return null;
  const raw=entry.raw as Record<string,unknown>;
  const source=raw?._source as Record<string,unknown>|undefined;
  const key=source?.source_entry_key;
  if(typeof key!=="string"||!Object.hasOwn(manifest.bindings,key))throw new Error("prepared_audio_missing");
  const binding=manifest.bindings[key];
  if(binding.textSha256!==hash(text.trim())||typeof binding.assetPath!=="string"||typeof binding.sha256!=="string")throw new Error("prepared_audio_stale");
  const file=await fs.realpath(path.resolve(realRoot,binding.assetPath));
  if(!file.startsWith(realRoot+path.sep)||!file.endsWith(".mp3"))throw new Error("invalid_audio_path");
  const audio=await fs.readFile(file);
  if(hash(audio)!==binding.sha256)throw new Error("corrupt_prepared_audio");
  return {audio,cached:true};
}
