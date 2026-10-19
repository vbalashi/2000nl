"""Operator adapter for existing AudioFilms ASR HTTP API over an existing SSH host.
No ASR implementation, deployment/auth changes, refresh, or dictionary writes.
"""
import argparse,json,re,subprocess,time
from datetime import datetime,timezone
from pathlib import Path

def api_request(host,method,path,payload=None):
    # Token-free internal connection to the existing API. No secrets or raw env reads.
    code='''import json,urllib.request,urllib.error
payload=PAYLOAD
request=urllib.request.Request('http://127.0.0.1:3010'+PATH,data=json.dumps(payload).encode() if payload is not None else None,headers={'Content-Type':'application/json'},method=METHOD)
try:
 response=urllib.request.urlopen(request,timeout=30);status=response.status;body=json.load(response)
except urllib.error.HTTPError as error:status=error.code;body=json.load(error)
print(json.dumps({'status':status,'body':body}))
'''.replace('PAYLOAD',repr(payload)).replace('PATH',repr(path)).replace('METHOD',repr(method))
    p=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10',host,'python3','-'],input=code,text=True,capture_output=True,timeout=45)
    p.check_returncode();return json.loads(p.stdout)

def normalize(result,job):
    b=result['body'];j=job['body'];meta=b.get('meta',{})
    if result['status']!=200 or j.get('request',{}).get('textSource')!='asr':raise ValueError('not_completed_asr_result')
    if b.get('language')!='nl' or meta.get('sourceKind')!='provider' or not meta.get('retrievalPath','').startswith('asr-job:'):raise ValueError('asr_source_identity_mismatch')
    phrases=b.get('phrases',[])
    if not phrases:raise ValueError('empty_asr_result')
    for cue in phrases:
        if not isinstance(cue.get('text'),str) or not cue['text'].strip() or not 0<=cue['startSec']<cue['endSec']:raise ValueError('invalid_asr_cue')
    return {'language':b['language'],'sourceKind':'provider','asrJobId':j['jobId'],'retrievalPath':meta['retrievalPath'],'provider':meta.get('provider'),'languageEvidence':'ASR requested nl; result language is not independent language detection','phrases':phrases,'sourceMeta':meta,'asrSummary':b.get('localAsrPreview')}

def run(args):
    root=args.video;meta=json.loads((root/'metadata.json').read_text());vid=meta['id']
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}',vid):raise ValueError('invalid_video_id')
    created=root/'asr-create.json'
    if args.mode=='create':
        if created.exists() and json.loads(created.read_text()).get('body',{}).get('jobId'):print('Reusing existing ASR job receipt');return
        duration=meta['duration']
        if not isinstance(duration,(int,float)) or not 0<duration<=getattr(args,'max_video_seconds',900):raise ValueError('bounded_asr_duration_exceeded')
        payload={'videoId':vid,'lang':'nl','textSource':'asr','sourceKind':'auto','durationSec':int(duration),'fullAudio':args.full_audio,'refresh':False}
        evidence=json.loads((root/'audio-track-evidence.json').read_text())
        langs={f['language'] for f in evidence['audioFormats'] if f.get('acodec') not in [None,'none'] and f.get('language')}
        if langs=={'nl'}:payload.update(audioTrackId='youtube-default',audioTrackCount=1,audioLanguage='nl',audioProvenance='unknown',audioEvidence='yt-dlp audio format language nl; default audio')
        probe=root/'audio-language-probe.json'
        if langs!={'nl'} and probe.exists():
            detected=json.loads(probe.read_text())
            if detected.get('videoId')!=vid or detected.get('language')!='nl' or detected.get('languageProbability',0)<0.9:raise ValueError('unconfirmed_dutch_audio')
            payload.update(audioTrackId='youtube-default',audioTrackCount=1,audioLanguage='nl',audioProvenance='unknown',audioEvidence=f"faster-whisper automatic default-audio language detection nl, probability={detected['languageProbability']:.6f}; yt-dlp unnamed default audio family")
        # If provider language is unknown, require a real audio-language probe instead of invented evidence.
        result=api_request(args.ssh_host,'POST','/api/asr/jobs',payload)
        (root/'asr-request.json').write_text(json.dumps(payload,indent=2)+'\n')
    else:
        job=json.loads(created.read_text());jid=job['body']['jobId']
        if not re.fullmatch(r'[A-Za-z0-9_-]+',jid):raise ValueError('invalid_job_id')
        result=api_request(args.ssh_host,'GET','/api/asr/jobs/'+jid+('/result' if args.mode=='result' else ''))
        if args.mode=='result' and result['status']==200:(root/'captions-asr.json').write_text(json.dumps(normalize(result,job),ensure_ascii=False,indent=2)+'\n')
    (root/f'asr-{args.mode}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    with (root/'asr-receipts.jsonl').open('a') as f:f.write(json.dumps({'utc':datetime.now(timezone.utc).isoformat(),'mode':args.mode,'httpStatus':result['status'],'status':result['body'].get('status'),'jobId':result['body'].get('jobId'),'error':result['body'].get('error')})+'\n')
    print(json.dumps({'video':vid,'httpStatus':result['status'],'status':result['body'].get('status'),'error':result['body'].get('error'),'phrases':len(result['body'].get('phrases',[]))}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['create','status','result']);p.add_argument('video',type=Path);p.add_argument('--ssh-host',default='dell');p.add_argument('--full-audio',action='store_true');p.add_argument('--max-video-seconds',type=int,choices=[900,1200],default=900);run(p.parse_args())
