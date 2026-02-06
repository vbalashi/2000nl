# URL Testing Parameters

**Developer tool for direct card access and layout control.**

**Security:** Only works when `devMode=true` flag is in URL OR `NEXT_PUBLIC_DEV_MODE` environment variable is set. Production users cannot access this feature.

---

## Usage

### Load Specific Word

```
http://localhost:3000/?wordId=fiets&devMode=true
```

The `wordId` parameter accepts:
- **Word ID** (numeric): Database word entry ID
- **Headword** (text): Dutch word like "fiets", "auto", etc.

### Force Card Direction

```
http://localhost:3000/?wordId=123&layout=w2d&devMode=true
```

Layout options:
- `w2d` → **Word-to-Definition** (Dutch word shown, recall meaning)
- `d2w` → **Definition-to-Word** (meaning shown, recall Dutch word)

### Combined Example

```
http://localhost:3000/?wordId=auto&layout=d2w&devMode=true
```

Shows the word "auto" in definition-to-word mode.

---

## Implementation

### Hook: `useCardParams()`

```typescript
import { useCardParams } from '@/lib/cardParams'

function MyComponent() {
  const { wordId, layout, devMode } = useCardParams()

  if (devMode) {
    console.log('Dev mode active:', { wordId, layout })
  }
}
```

### Helper: `parseCardParams(searchParams)`

```typescript
import { parseCardParams } from '@/lib/cardParams'

const params = parseCardParams(searchParams)
// { wordId: '123', layout: 'w2d', devMode: true }
```

### Word Loading

The URL word loading is wired through `forcedNextWordIdRef` in `TrainingScreen.tsx`:

1. `useCardParams()` extracts `wordId` from URL
2. If dev mode enabled, sets `forcedNextWordIdRef.current = wordId`
3. `fetchTrainingWordByLookup()` resolves word by ID or headword
4. Next card load bypasses normal queue and loads forced word

---

## Testing Synergy

URL parameters are especially useful for testing first-time card behavior:

```
http://localhost:3000/?wordId=nieuwe-woord&devMode=true&firstEncounter=true
```

This loads a specific word, allowing you to:
- Verify first-time button interface appears
- Test "Start learning" and "I know it already" buttons
- Check W→D direction forcing
- Take screenshots for documentation

Note: `firstEncounter=true` only takes effect when `devMode=true` is enabled.

---

## Dev Console Output

When dev mode is active, the console logs:

```
[TrainingScreen] Dev mode card params active
[TrainingScreen] Loaded word: <word> (isFirstEncounter: true/false)
```

---

## Security Notes

- Production users see normal training flow (no URL params)
- `devMode=true` flag required in URL OR `NEXT_PUBLIC_DEV_MODE` set in environment
- Useful for remote testing without rebuilding
- Does NOT bypass authentication or access control

---

## Files

- `apps/ui/lib/cardParams.ts` - Hook and parser implementation
- `apps/ui/tests/cardParams.test.ts` - Unit tests
- `apps/ui/components/training/TrainingScreen.tsx` - Integration point
- `apps/ui/lib/trainingService.ts` - `fetchTrainingWordByLookup()` function

---

## Troubleshooting

**Params not working?**
- Check URL includes `devMode=true` flag
- Check browser console for dev mode message
- Verify `useSearchParams()` not returning null (JSDOM issue in tests)

**Word not loading?**
- Check word exists in database
- Try numeric ID instead of headword
- Check console for errors
