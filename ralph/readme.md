# Ralph Agent - Known Issues & Workarounds

## Environment Setup Issues

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

### Chrome DevTools MCP may not be available
The acceptance criteria mention "Verify in browser using Chrome DevTools MCP" but this MCP tool may not be configured.

**Workaround:**
- Skip browser verification if MCP not available
- Manual testing can be done separately
- Document that browser verification was skipped in progress.txt

## Codebase Notes

### Project Structure
- This is a monorepo with apps in `apps/` directory
- Main UI app is at `apps/ui/`
- Run commands from `apps/ui/` directory for type checking and tests
- Node modules are at project root level

### TypeScript Config
The `apps/ui/tsconfig.tsbuildinfo` file changes frequently - it's safe to leave unstaged as it's a build artifact.
