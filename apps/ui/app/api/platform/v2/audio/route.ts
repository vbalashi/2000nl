import {consumeAudioRateLimit} from "@/lib/audio/audioRateLimit";
import {NextRequest} from "next/server";
import {getAuthenticatedSupabase,jsonNoStore,requirePlatformScope} from "@/lib/platform/serverSupabase";
import {parseCurrentTrainingCardRead} from "@/lib/platform/currentTrainingCardRequest";
import {readEntryAudioSource} from "@/lib/audio/entryAudioSource";
import {contentFingerprint,normalizeDictionaryContent} from "@/lib/platform/projections/dictionaryContent";
import {resolvePrivateEntryTtsAudio} from "@/lib/audio/ttsCache";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export async function POST(request:NextRequest) {
  const auth=await getAuthenticatedSupabase(request);
  if(auth instanceof Response)return auth;
  const denied=jsonNoStore({error:"entry_audio_not_available"},404);
  if(auth.principal.authKind!=="first_party")return jsonNoStore({error:"entry_audio_forbidden"},403);
  const scopeError=requirePlatformScope(auth,"platform:write");
  if(scopeError)return scopeError;
  const rate=consumeAudioRateLimit(`entry-read:${auth.user.id}`,120);
  if(!rate.allowed)return jsonNoStore({error:"rate_limited",retryAfterMs:rate.retryAfterMs},429);
  const body=await request.json().catch(()=>null);
  if(!body||Array.isArray(body)||typeof body!=="object"||!uuid(body.entryId)
    ||Object.keys(body).some(key=>!["entryId","currentCard","prepareOnly","node","sourceVersion"].includes(key))
    ||(body.sourceVersion!==undefined&&(!Number.isSafeInteger(body.sourceVersion)||body.sourceVersion<1))
    ||(body.prepareOnly!==undefined&&typeof body.prepareOnly!=="boolean"))
    return jsonNoStore({error:"invalid_entry_audio_request"},400);
  if(body.node!==undefined&&(!body.node||typeof body.node!=="object"||Array.isArray(body.node)
    ||!uuid(body.node.contentNodeId)||typeof body.node.sourceTextFingerprint!=="string"
    ||!body.node.sourceTextFingerprint.length||body.node.sourceTextFingerprint.length>160
    ||Object.keys(body.node).some(key=>!["contentNodeId","sourceTextFingerprint"].includes(key))))
    return jsonNoStore({error:"invalid_entry_audio_request"},400);
  const current=body.currentCard===undefined?undefined:parseCurrentTrainingCardRead(body.currentCard);
  if(current===null)return jsonNoStore({error:"invalid_current_training_card_request"},400);
  if(current&&process.env.NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED!=="true")return jsonNoStore({error:"current_training_card_forbidden"},403);
  const read=()=>readEntryAudioSource(auth,body.entryId,current,body.node);
  const source=await read();
  if(!source||(body.sourceVersion!==undefined&&String(source.entry.content_version)!==String(body.sourceVersion)))return denied;
  const entry=source.entry;
  try {
    const result=await resolvePrivateEntryTtsAudio(source.text,()=>{
      if(!consumeAudioRateLimit(auth.user.id).allowed)throw new Error("audio_rate_limited");
    });
    const latest=await read();
    const stillReadable=Boolean(latest&&latest.text===source.text
      &&String(latest.entry.content_version)===String(entry.content_version)
      &&latest.entry.dictionary_id===entry.dictionary_id&&latest.entry.language_code===entry.language_code
      &&contentFingerprint(normalizeDictionaryContent(latest.entry))===contentFingerprint(normalizeDictionaryContent(entry)));
    if(!stillReadable)return denied;
    if(body.prepareOnly){
      const response=jsonNoStore({status:"ready"});
      response.headers.set("X-Platform-Cache",result.cached?"hit":"miss");
      return response;
    }
    return new Response(new Uint8Array(result.audio),{headers:{"Content-Type":"audio/mpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Platform-Cache":result.cached?"hit":"miss"}});
  } catch(error) {
    if(error instanceof Error&&error.message==="audio_rate_limited")return jsonNoStore({error:"rate_limited"},429);
    return jsonNoStore({error:"entry_audio_unavailable"},502);
  }
}
