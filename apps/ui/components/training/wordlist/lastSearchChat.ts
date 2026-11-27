import type {AssistantSnapshot} from "./PersonalCardAssistant";

type Context = {word:string;scope:string;category:string;language:string};
export type SearchChat = Context & AssistantSnapshot & {id:string};

export function openSearchChat(key:string, userId:string, context:Context, startSearch:boolean):SearchChat {
  const fresh = {...context,id:crypto.randomUUID(),turns:[],draft:""};
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!startSearch && stored && typeof stored.id==="string" && stored.language===context.language && Array.isArray(stored.turns)) return stored;
    // Bring forward the conversation from the preceding tab-only editor once.
    const legacy = "2000nl.search-chat.v1." + JSON.stringify([userId,context.language]);
    const old = JSON.parse(sessionStorage.getItem(legacy) ?? "null");
    const oldContext = JSON.parse(sessionStorage.getItem(legacy+".context") ?? "null");
    const chat = !startSearch && old && Array.isArray(old.turns) && typeof old.draft==="string"
      ? {...fresh,...oldContext,turns:old.turns,draft:old.draft} : fresh;
    localStorage.setItem(key,JSON.stringify(chat));
    sessionStorage.removeItem(legacy);
    sessionStorage.removeItem(legacy+".context");
    return chat;
  } catch { return fresh; }
}

export function saveSearchChat(key:string,chat:SearchChat,snapshot:AssistantSnapshot) {
  try {
    const latest = JSON.parse(localStorage.getItem(key) ?? "null");
    // A late reply from a different tab must not replace a newer search.
    if (latest?.id===chat.id) localStorage.setItem(key,JSON.stringify({...chat,...snapshot}));
  } catch { /* The open panel still owns its in-memory conversation. */ }
}
