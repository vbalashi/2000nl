# Deploy 2000nl on `nuc` (LAN) + CI/CD (GitHub → nuc)

This note explains **what** we deployed, **how** it’s wired, and **why** we made these choices.

## What we built

- **Repo published to GitHub**: `vbalashi/2000nl`
- **App runs on home server `nuc`** using:
  - Docker Compose stack: **Next.js UI** + **Caddy reverse proxy**
  - Served on LAN at:
    - `http://nuc/` (Caddy on port 80)
    - `http://<nuc-ip>/` (same)
- **CI/CD**:
  - `git push` to `main` → GitHub Actions job runs on **self-hosted runner** on `nuc`
  - Runner pulls latest code into `/srv/2000nl-ui` and rebuilds/restarts containers

## Why these choices

- **Docker Compose (not Kubernetes)**:
  - Low maintenance for a single box + a couple services
  - Easy to inspect (`docker compose ps/logs`) and recover
- **Caddy**:
  - Simplest reverse proxy configuration
  - Stable entrypoint (`:80`) so clients don’t need to know the internal UI port
- **Self-hosted GitHub runner** (instead of polling/watchtower):
  - Works behind NAT without opening ports
  - Keeps secrets on `nuc` (GitHub doesn’t need them)
  - Simple “push → deploy” flow

## Security / repo hygiene

### Sensitive dictionary data removed from Git tracking

We discovered that **17,983** word definition files were tracked in git under:

- `packages/ingestion/nl/vandale-nt2/data/words_content/`
- `packages/ingestion/nl/vandale-nt2/data/word_list.json`

We removed them from tracking and added ignore rules so they **never get pushed**.

### Environment variables

- **Do not commit `.env` files**.
- We committed a template: `.env.example`
- Runtime values live only on `nuc` at:
  - `/srv/2000nl-ui/.env`

Important note: `NEXT_PUBLIC_*` variables are **public** by design in Next.js (inlined into client bundle).
Secrets (DB URLs, service role keys, API keys) must not be exposed via `NEXT_PUBLIC_*`.

## How deployment works on `nuc`

### Code location

- `/srv/2000nl-ui` is the deployed working tree.

### Stack

Defined in:

- `docker-compose.yml` (repo root)
- `Caddyfile` (repo root)
- `apps/ui/Dockerfile` (builds the Next.js UI)

At runtime:

- `caddy` listens on **0.0.0.0:80**
- `ui` listens on **:3000 inside Docker**
- Caddy proxies → `ui:3000`

### Why the UI Dockerfile uses `output: "standalone"`

Next.js `output: 'standalone'` produces a minimal production server bundle, which:

- reduces the runtime image surface
- avoids shipping full dev dependencies
- makes Docker deploys faster/cleaner

## How CI/CD works (GitHub → nuc)

### Workflow

Workflow file:

- `.github/workflows/deploy-nuc.yml`

The job runs on the self-hosted runner and executes:

- `git fetch && git reset --hard origin/main`
- `docker compose up -d --build`

### The “docker group” gotcha + why `sg docker` exists

We hit a real-world issue:

- The runner process was **not in the `docker` group** (even though user `khrustal` is).
- Result: `docker` commands failed inside the workflow (no access to `/var/run/docker.sock`).

Fix:

- Run docker commands via:
  - `sg docker -c 'docker …'`

This forces the `docker` group *for that command*, regardless of how the runner service session was started.

## Day-to-day operations

### On `nuc`

```bash
cd /srv/2000nl-ui
docker compose ps
docker compose logs -f --tail=200
```

Restart stack:

```bash
cd /srv/2000nl-ui
docker compose up -d
```

Force rebuild:

```bash
cd /srv/2000nl-ui
docker compose up -d --build
```

### Deploy a change

On laptop:

```bash
git push origin main
```

Then check runner logs on `nuc`:

```bash
journalctl --user -u github-runner.service -n 200 --no-pager
```

## Troubleshooting

### App not reachable from LAN

- Check stack health:
  - `docker compose ps`
  - `docker compose logs --tail=200`
- Confirm Caddy is listening:
  - `ss -lntp | grep ':80'` (or `sudo ss -lntp | grep ':80'`)
- Confirm you can curl locally:
  - `curl -v http://localhost/`

### CI deploy fails

- Check runner status:
  - `systemctl --user status github-runner.service --no-pager`
  - `journalctl --user -u github-runner.service -n 300 --no-pager`
- If errors mention Docker socket permissions:
  - verify `sg docker` is used in the workflow steps

### Domain / local DNS (`2000nl.nuc`)

We deferred DNS configuration. Options:

- **Single host entry** in FritzBox DNS: `2000nl.nuc` → `<nuc-ip>`
- **Per-device hosts file** (quick but manual)
- **LAN DNS** (AdGuard Home / dnsmasq / CoreDNS) if you want many names or wildcard

