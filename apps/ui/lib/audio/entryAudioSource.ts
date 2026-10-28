import {getPlatformServiceSupabase,type AuthenticatedSupabase} from "../platform/serverSupabase";
import type {DictionaryLookupPayload} from "../platform/lookupService";
import type {CurrentTrainingCardRead} from "../platform/currentTrainingCardRequest";
import {extractPlatformV2ContentSections} from "../platform/platformV2RichContent";

export type EntryAudioNode={contentNodeId:string;sourceTextFingerprint:string};
export type EntryAudioSource={entry:DictionaryLookupPayload;text:string};

/** Node ids are resolved only through caller-authorized presentation bindings;
 * client text and arbitrary raw paths never enter audio generation.
 */
export async function readEntryAudioSource(
  auth:AuthenticatedSupabase,entryId:string,current?:CurrentTrainingCardRead,node?:EntryAudioNode,
):Promise<EntryAudioSource|null>{
  try{
    // Use the same versioned browse source as the library presentation. The
    // legacy fetch_dictionary_entry_by_id_gated payload omits content_version.
    const service=current?null:getPlatformServiceSupabase();
    if(service instanceof Response)return null;
    const {data,error}=current
      ?await auth.supabase.rpc("read_current_training_entry_v1",{p_user_id:auth.user.id,p_session_id:current.sessionId,p_permit_id:current.permitId})
      :await service!.supabase.rpc("read_platform_v2_library_group",{p_user_id:auth.user.id,p_entry_id:entryId,p_group_entry_bound:100});
    if(error)return null;
    const entry=Array.isArray(data?.items)?data.items.find((item:{id?:string})=>item.id===entryId):null;
    if(entry?.id!==entryId||!entry.raw)return null;
    if(!node)return typeof entry.headword==="string"&&entry.headword.trim()&&entry.headword.length<=160?{entry,text:entry.headword}:null;
    const identity=entry.platform_v2_identity;
    if(identity?.entryId!==entryId)return null;
    const bindings=Array.isArray(identity?.contentNodeBindings)?identity.contentNodeBindings:[];
    const matches=bindings.filter((binding:EntryAudioNode)=>binding.contentNodeId===node.contentNodeId&&binding.sourceTextFingerprint===node.sourceTextFingerprint);
    if(matches.length!==1)return null;
    const binding=matches[0];
    if(binding.kind!=="example"&&binding.kind!=="idiom")return null;
    const sections=extractPlatformV2ContentSections(entry).filter(section=>section.sourcePath===binding.sourcePath&&section.kind===binding.kind);
    if(sections.length!==1||!sections[0].text.trim()||sections[0].text.length>2000)return null;
    return {entry,text:sections[0].text};
  }catch{return null;}
}
