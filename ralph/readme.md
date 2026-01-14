# Ralph Agent - Autonomous Coding Agent for 2000nl

## Running Ralph

### Quick notes

To Run Ralph

  1. Terminal 1: Start dev server

    cd /home/khrustal/dev/2000nl-ui/apps/ui && npm run dev
  2. Terminal 2: Run Ralph

  ```
  cd /home/khrustal/dev/2000nl-ui/ralph
  ./ralph.sh
  ```
  3. Terminal 3 (optional): Monitor

    ./monitor.sh

### Prerequisites
1. Ensure you have a `prd.json` with user stories (each with `"passes": false`)
2. Start the dev server in a separate terminal:
   ```bash
   cd apps/ui && npm run dev
   ```

### Start Ralph
```bash
cd /home/khrustal/dev/2000nl-ui/ralph
./ralph.sh [max_iterations]  # default: 10 iterations
```

Ralph will:
- Automatically start the dev-browser server for UI testing
- Pick up incomplete stories from `prd.json`
- Run type checks and tests before committing
- Update `progress.txt` with learnings

### Monitor Progress (separate terminal)
```bash
cd /home/khrustal/dev/2000nl-ui/ralph
./monitor.sh
```

Or manually check:
```bash
# Story status
cat ralph/prd.json | jq '.userStories[] | {id, passes}'

# Recent progress
tail -50 ralph/progress.txt

# Recent commits
git log --oneline -10
```

---

## Known Issues & Workarounds

### pnpm not in PATH
The instructions reference `pnpm type-check && pnpm test` but pnpm may not be in PATH on this system.

**Workaround:** Use npx instead:
```bash
cd apps/ui && npx tsc --noEmit  # type checking
npx vitest run                   # tests
```

### No `type-check` script in package.json
The `apps/ui/package.json` doesn't have a `type-check` script. Available scripts are:
- `dev`, `build`, `start`, `lint`, `test`, `test:watch`, `test:e2e`

**Workaround:** Run TypeScript directly:
```bash
cd apps/ui && npx tsc --noEmit
```

## PRD Schema Issues

### Missing `passes` field
The PRD template should include a `passes` field on each user story. When creating a new PRD, ensure each story has:
```json
{
  "id": "US-001",
  "title": "...",
  "passes": false
}
```

### Missing `branchName` field
The instructions reference checking `branchName` from PRD, but it's optional. If not present, work on `main` branch or create a feature branch manually.

**Recommended PRD structure:**
```json
{
  "name": "Sprint Name",
  "branchName": "ralph/sprint-name",  // Optional but recommended
  "userStories": [
    {
      "id": "US-001",
      "passes": false,  // Required for tracking
      ...
    }
  ]
}
```

## Browser Testing

### Dev Browser (Primary - Auto-started by ralph.sh)
The ralph.sh script automatically starts the dev-browser server. It:
- Launches Chromium with persistent page state
- Runs on port 9222
- Cleans up when Ralph exits

Ralph uses bash heredocs to run browser scripts:
```bash
cd /home/khrustal/dev/github/dev-browser/skills/dev-browser && npx tsx <<'EOF'
import { connect, waitForPageLoad } from "@/client.js";
const client = await connect();
const page = await client.page("2000nl");
await page.goto("http://localhost:3000");
await waitForPageLoad(page);
await page.screenshot({ path: "tmp/screenshot.png" });
await client.disconnect();
EOF
```

Screenshots saved to: `/home/khrustal/dev/github/dev-browser/skills/dev-browser/tmp/`

**Fallback:** If dev-browser is unavailable, note in progress.txt that browser verification was skipped.

## Codebase Notes

### Project Structure
- This is a monorepo with apps in `apps/` directory
- Main UI app is at `apps/ui/`
- Run commands from `apps/ui/` directory for type checking and tests
- Node modules are at project root level

### TypeScript Config
The `apps/ui/tsconfig.tsbuildinfo` file changes frequently - it's safe to leave unstaged as it's a build artifact.

## Monitoring Progress

```bash
# Story status
cat ralph/prd.json | jq '.userStories[] | {id, passes}'

# Learnings
cat ralph/progress.txt

# Recent commits
git log --oneline -10
```

## When NOT to Use Ralph

- Exploratory work (unclear requirements)
- Major refactors without clear criteria
- Security-critical code
- Anything needing human review before merge
