# US-041-2 - NUC Docker volume verification

Date: 2026-01-23
Host: nuc (via ssh)

## Summary
The 2000nl UI container on the NUC has no volume mounts configured. The container's `/app/public/audio` is a symlink to `/home/khrustal/dev/2000nl-ui/db/audio`, which does not exist inside the container. The host has audio files at `/srv/2000nl-ui/db/audio`, but they are not mounted into the UI container.

## Checks performed

### 1) 2000nl service configuration on NUC
- Live compose file: `/srv/2000nl-ui/docker-compose.yml`
- `ui` service has no `volumes:` block.

### 2) Running containers
```
$ docker ps | grep -i 2000nl
2000nl-ui-ui-1  2000nl-ui-ui  Up 7 days  3000/tcp
```

### 3) Container audio paths
```
$ docker exec 2000nl-ui-ui-1 ls -la /app/public/audio
lrwxrwxrwx 1 root root 37 Jan 15 17:40 /app/public/audio -> /home/khrustal/dev/2000nl-ui/db/audio

$ docker exec 2000nl-ui-ui-1 ls -la /home/khrustal/dev/2000nl-ui/db/audio
ls: cannot access '/home/khrustal/dev/2000nl-ui/db/audio': No such file or directory

$ docker exec 2000nl-ui-ui-1 ls -la /app/public/audio/nl
ls: cannot access '/app/public/audio/nl': No such file or directory

$ docker exec 2000nl-ui-ui-1 ls -la /app/public/audio/tts
ls: cannot access '/app/public/audio/tts': No such file or directory
```

### 4) Host audio files
```
$ ls -la /srv/2000nl-ui/db/audio
... nl/ tts/ ...
```

## Findings
- `docker-compose.yml` for `/srv/2000nl-ui` has no `volumes` for audio.
- The UI container has a symlink `/app/public/audio -> /home/khrustal/dev/2000nl-ui/db/audio`, which is missing inside the container.
- Audio files do exist on the host at `/srv/2000nl-ui/db/audio` (including `nl/` and `tts/`).

## Implications
- Word audio (`/audio/nl/...`) and TTS audio (`/audio/tts/...`) are not accessible inside the UI container due to the broken symlink and missing volume mounts.
- The container cannot read or write audio files unless a host path is mounted into the container (or the symlink is updated to point at a mounted path).
