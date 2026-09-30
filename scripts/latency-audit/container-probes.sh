#!/usr/bin/env bash
# Read-only probes from inside the production UI container (ssh host `nuc`).
# - config: audio link target, non-secret env that affects latency
# - audio-head: HEAD latency for random real audio files (the lookup audio probe path)
# - rtt: GoTrue health and a trivial PostgREST RPC round trip to Supabase
set -euo pipefail
HOST="${LATENCY_AUDIT_SSH_HOST:-nuc}"
CONTAINER="${LATENCY_AUDIT_CONTAINER:-2000nl-ui-ui-1}"
probe="${1:-all}"

run() { ssh -o BatchMode=yes "$HOST" "docker exec $CONTAINER $*"; }

if [[ "$probe" == config || "$probe" == all ]]; then
  echo "## config"
  run sh -c "'ls -la /app/public/audio 2>&1 | head -1; test -d /app/public/audio/ && echo audio-root:inspectable || echo audio-root:NOT-inspectable; env | grep -oE \"^(PLATFORM_AUDIO_PUBLIC_ROOT|PLATFORM_AUDIO_PUBLIC_BASE_URL|PLATFORM_AUTH_CACHE_TTL_MS|PLATFORM_FIRST_PARTY_AUTH_CACHE_TTL_MS|NEXT_PUBLIC_SITE_URL)=.*\" || true'"
fi

if [[ "$probe" == audio-head || "$probe" == all ]]; then
  echo "## audio HEAD (n=40 random files)"
  run node -e "'
const fs=require(\"fs\"),path=require(\"path\");const root=\"/db/audio/nl\";const files=[];
for(const l of fs.readdirSync(root)){const d=path.join(root,l);if(!fs.statSync(d).isDirectory())continue;for(const f of fs.readdirSync(d)){files.push(\"/audio/nl/\"+l+\"/\"+f);if(files.length>4000)break}if(files.length>4000)break}
const q=(a,p)=>{a=[...a].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(p*a.length))].toFixed(0)};
(async()=>{const t=[];for(let i=0;i<40;i++){const u=new URL(files[Math.floor(Math.random()*files.length)],\"https://2000.dilum.io\").toString();const s=performance.now();await fetch(u,{method:\"HEAD\"}).catch(()=>null);t.push(performance.now()-s)}
console.log(\"files\",files.length,\"p50\",q(t,.5),\"p95\",q(t,.95),\"max\",Math.max(...t).toFixed(0))})()'"
fi

if [[ "$probe" == rtt || "$probe" == all ]]; then
  echo "## Supabase round trips (n=20)"
  run node -e "'
const u=process.env.NEXT_PUBLIC_SUPABASE_URL,k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const q=(a,p)=>{a=[...a].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor(p*a.length))].toFixed(0)};
(async()=>{const r={gotrue_health:[],postgrest_rpc:[]};for(let i=0;i<20;i++){let t=performance.now();await fetch(u+\"/auth/v1/health\",{headers:{apikey:k}});r.gotrue_health.push(performance.now()-t);
t=performance.now();await fetch(u+\"/rest/v1/rpc/get_training_scenarios\",{method:\"POST\",headers:{apikey:k,\"content-type\":\"application/json\"},body:\"{}\"});r.postgrest_rpc.push(performance.now()-t)}
for(const [n,a] of Object.entries(r))console.log(n,\"p50\",q(a,.5),\"p95\",q(a,.95),\"min\",Math.min(...a).toFixed(0))})()'"
fi
