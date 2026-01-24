# Ralph Agent Instructions

You are an autonomous coding agent working on 2000nl-ui, a Dutch word learning application.

## Your Task

1. Read the PRD at `ralph/prd.json`
2. Read the progress log at `ralph/progress.txt` (check Codebase Patterns section first)
3. **CRITICAL: Verify branch safety before starting**
   - Check if you're on the correct branch from PRD `branchName` (if not specified, work on `main`)
   - **Before starting work, verify all previous Ralph branches are merged:**
     ```bash
     cd /home/khrustal/dev/2000nl-ui
     # Check for unmerged ralph/* branches (excluding current branch)
     CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
     UNMERGED=$(git branch --no-merged main | grep 'ralph/' | grep -v "$CURRENT_BRANCH" || true)
     if [ -n "$UNMERGED" ]; then
       echo "ERROR: Found unmerged Ralph branches that must be merged first:"
       echo "$UNMERGED"
       echo "These branches contain work that will be lost if you proceed."
       echo "Please merge these branches to main before starting new work."
       exit 1
     fi
     ```
   - If unmerged branches found, **STOP IMMEDIATELY** and report to user:
     - List the unmerged branches
     - Explain the risk (work will be lost/overwritten)
     - Instruct user to merge branches first, then restart Ralph
   - Only proceed if all previous ralph/* branches are merged or current branch is the only unmerged one
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks: `cd apps/ui && npx tsc --noEmit && npx vitest run`
7. Update CLAUDE.md if you discover reusable patterns (see below)
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story
10. Append your progress to `ralph/progress.txt`

## PRD Requirements

Each user story in `prd.json` MUST have a `passes` field (boolean). If missing, add `"passes": false` to each story before starting.

Example story structure:
```json
{
  "id": "US-001",
  "title": "Story title",
  "passes": false,
  ...
}
```

## Progress Report Format

APPEND to progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the word card component is in X")
---
```

The learnings section is critical - it helps future iterations avoid repeating mistakes and understand the codebase better.

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of progress.txt (create it if it doesn't exist). This section should consolidate the most important learnings:

```
## Codebase Patterns
- Example: Use Supabase client from `lib/supabase.ts` for database access
- Example: Components use Tailwind CSS with shadcn/ui
- Example: API routes are in `app/api/`
```

Only add patterns that are **general and reusable**, not story-specific details.

## Update CLAUDE.md Files

Before committing, check if any edited files have learnings worth preserving in CLAUDE.md:

1. **Identify directories with edited files** - Look at which directories you modified
2. **Check for existing CLAUDE.md** - Look for CLAUDE.md in those directories or project root
3. **Add valuable learnings** - If you discovered something future developers/agents should know:
   - API patterns or conventions specific to that module
   - Gotchas or non-obvious requirements
   - Dependencies between files
   - Testing approaches for that area

**Do NOT add:**
- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

## Quality Requirements

- ALL commits must pass type checks and tests
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

### Fixing Related Files is OK

If typecheck or tests require changes to other files (e.g., updating imports, fixing types in related components), **make those changes**. This is NOT scope creep - it's maintaining a working codebase.

### Common Gotchas

**Idempotent migrations** - When writing SQL migrations:
```sql
ADD COLUMN IF NOT EXISTS email TEXT;
```

**Interactive prompts** - For commands that might prompt for input:
```bash
echo -e "\n\n\n" | npm run db:generate
```

**Schema changes** - After editing database schema or types, check:
- Server actions
- UI components
- API routes
- Related type definitions

## Browser Testing with Dev Browser

For any story that changes UI, verify it works in the browser using dev-browser.

### Setup (once per Ralph session)
The ralph.sh script starts the dev-browser server automatically. If running manually:
```bash
/home/khrustal/dev/github/dev-browser/skills/dev-browser/server.sh &
# Wait for "Ready" message before running scripts
```

### Writing Browser Scripts
Run scripts from the dev-browser directory using heredocs:
```bash
cd /home/khrustal/dev/github/dev-browser/skills/dev-browser && npx tsx <<'EOF'
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("2000nl");  // Named page persists between scripts
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto("http://localhost:3000");
await waitForPageLoad(page);
await page.screenshot({ path: "tmp/screenshot.png" });
console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
EOF
```

### Key Commands
- **Screenshot**: `await page.screenshot({ path: "tmp/screenshot.png" });`
- **Full page**: `await page.screenshot({ path: "tmp/full.png", fullPage: true });`
- **Mobile viewport**: `await page.setViewportSize({ width: 375, height: 667 });`
- **Click element**: `await page.click('button[data-testid="submit"]');`
- **Fill input**: `await page.fill('input[name="email"]', 'test@example.com');`
- **Wait for element**: `await page.waitForSelector('.results');`
- **Get AI snapshot** (discover elements): `const snapshot = await client.getAISnapshot("2000nl");`
- **Click by snapshot ref**: `const el = await client.selectSnapshotRef("2000nl", "e5"); await el.click();`

### Workflow
1. Ensure dev server is running: `cd apps/ui && npm run dev`
2. Dev-browser server should already be running (started by ralph.sh)
3. Write small, focused scripts - one action per script when exploring
4. Pages persist between scripts - reuse the same page name ("2000nl")
5. Take screenshots to verify changes

### Reading Screenshots
Screenshots are saved to `/home/khrustal/dev/github/dev-browser/skills/dev-browser/tmp/`.
Use the Read tool to view them (Claude can see images directly).

**Fallback:** If dev-browser is unavailable, note in progress.txt that browser verification was skipped. The story can still be marked complete if type checks and tests pass.

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting
- See `ralph/readme.md` for known issues and workarounds
