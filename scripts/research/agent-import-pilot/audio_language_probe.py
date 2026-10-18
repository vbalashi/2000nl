"""Operator preflight for an unlabelled default audio track before AudioFilms API.
Uses the existing worker model for language detection only, not full transcription.
The endpoint remains responsible for the actual ASR job; no API safeguards disabled.
"""
import argparse,json,re,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('video',type=Path);parser.add_argument('--ssh-host',default='dell');args=parser.parse_args()
video=json.loads((args.video/'metadata.json').read_text())['id']
if not re.fullmatch(r'[A-Za-z0-9_-]{11}',video):raise ValueError('invalid_video_id')
code='''import json,subprocess,time
from pathlib import Path
from faster_whisper import WhisperModel
root=Path('/tmp/2000nl-742-language-preflight');root.mkdir(exist_ok=True);audio=root/'9ZQaqL7K-rE.m4a';start=time.monotonic()
if not audio.exists():
 p=subprocess.run(['/usr/local/bin/yt-dlp','--no-playlist','--no-warnings','-f','ba[ext=m4a]/ba','-o',str(audio),'https://www.youtube.com/watch?v=9ZQaqL7K-rE'],capture_output=True,text=True,timeout=180)
 if p.returncode:raise RuntimeError('audio_preflight_download_failed')
loaded=time.monotonic();model=WhisperModel('mobiuslabsgmbh/faster-whisper-large-v3-turbo',device='cpu',compute_type='int8');segments,info=model.transcribe(str(audio),language=None,vad_filter=True)
print(json.dumps({'videoId':'9ZQaqL7K-rE','language':info.language,'languageProbability':info.language_probability,'audioBytes':audio.stat().st_size,'downloadSeconds':loaded-start,'languageProbeSeconds':time.monotonic()-loaded,'method':'same faster-whisper model automatic language detection; no transcript segment iteration','temporaryAudio':str(audio)}))
'''
code=code.replace('9ZQaqL7K-rE',video)
p=subprocess.run(['ssh','-o','BatchMode=yes',args.ssh_host,'docker','exec','-i','audiofilms-audiofilms-asr-worker-1','/data/audiofilms/asr-cache/.venv/bin/python','-'],input=code,text=True,capture_output=True,timeout=240)
if p.returncode:
 print(json.dumps({'error':'language_preflight_failed','stderr':p.stderr[-700:]}));raise SystemExit(1)
d=json.loads(p.stdout);root=args.video;(root/'audio-language-probe.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps(d))
