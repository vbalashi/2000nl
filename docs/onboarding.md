# Onboarding System

## Overview

The 2000nl onboarding system provides a guided tour for new users using [react-joyride](https://docs.react-joyride.com/). It supports multiple languages and persists completion status to the database.

## Key Features

- **Multi-language support**: English, Russian, Dutch
- **Auto-detection**: Language automatically detected from system locale or user translation settings
- **No auto-start**: Onboarding only runs when manually triggered by user
- **Database persistence**: Completion status and language preference stored in DB (syncs across devices)
- **Manual restart**: Users can restart onboarding anytime from settings

## Architecture

### Storage

Onboarding preferences are stored in the `user_settings.preferences` JSONB field:

```json
{
  "onboardingCompleted": true,
  "onboardingLanguage": "nl"
}
```

**Why JSONB?**
- No schema migrations needed for new preferences
- Flexible storage for feature flags
- Backward compatible with existing settings

### Language Detection Priority

1. **Saved preference** (from DB `preferences.onboardingLanguage`)
2. **Translation language** (user's selected translation target language)
3. **System language** (browser `navigator.language`)
4. **Fallback**: English

### Onboarding Flow

```
User logs in
    ↓
Load preferences from DB
    ↓
Auto-detect language (if not set)
    ↓
Save detected language to DB
    ↓
Wait for manual trigger
    ↓
User clicks "Start Onboarding" in settings
    ↓
Tour runs
    ↓
User completes/skips tour
    ↓
Mark onboardingCompleted: true in DB
```

## Implementation Details

### Database Schema

**Migration**: `007_user_preferences_jsonb.sql`

```sql
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS user_settings_preferences_idx
    ON public.user_settings USING gin(preferences);
```

### API Functions

**Fetch preferences**:
```typescript
import { fetchUserPreferences } from '@/lib/trainingService';

const prefs = await fetchUserPreferences(userId);
console.log(prefs.preferences.onboardingCompleted); // true/false
console.log(prefs.preferences.onboardingLanguage); // "en" | "ru" | "nl"
```

**Update preferences**:
```typescript
import { updateUserPreferences } from '@/lib/trainingService';

await updateUserPreferences({
  userId: user.id,
  preferences: {
    ...prefs.preferences,
    onboardingCompleted: true,
    onboardingLanguage: "nl",
  },
});
```

### Language Auto-Detection

**Function**: `detectOnboardingLanguage()` in `apps/ui/lib/onboardingI18n.ts`

```typescript
import { detectOnboardingLanguage } from '@/lib/onboardingI18n';

const language = detectOnboardingLanguage(translationLang);
// Returns: "en" | "ru" | "nl"
```

### Manual Onboarding Trigger

To add a "Start Onboarding" button in settings:

```typescript
// In SettingsModal or similar
<button onClick={() => startOnboarding()}>
  Start Onboarding Tour
</button>
```

The `startOnboarding()` callback is available in `TrainingScreen.tsx`.

## Translation Files

Onboarding translations are stored in:
- `apps/ui/locales/en.json`
- `apps/ui/locales/ru.json`
- `apps/ui/locales/nl.json`

**Structure**:
```json
{
  "onboarding": {
    "steps": [
      {
        "title": "Welcome!",
        "content": "This is the training card..."
      },
      // ... more steps
    ],
    "buttons": {
      "back": "Back",
      "close": "Close",
      "last": "Finish",
      "next": "Next",
      "skip": "Skip"
    }
  }
}
```

## Tour Steps

The onboarding tour highlights these UI elements (defined in `TrainingScreen.tsx`):

1. **Welcome** - Center overlay intro
2. **Training Card** - `[data-tour='training-card']`
3. **Rating Buttons** - `[data-tour='rating-buttons']`
4. **Card Toolbar** - `[data-tour='card-toolbar']`
5. **Sidebar Toggle** - `[data-tour='sidebar-toggle']`
6. **Search Button** - `[data-tour='search-button']`

To add new steps, update:
1. `STEP_TARGETS` array in `TrainingScreen.tsx`
2. Translation files with new step content

## Removing localStorage (Legacy)

The old implementation used localStorage:
- `onboarding_completed` → now in DB
- `onboarding_language` → now in DB

**Migration**: Existing localStorage keys are ignored. DB is source of truth.

## Adding New Preferences

To add a new preference without DB migration:

```typescript
// Update type definition
export type UserPreferences = {
  // ... existing fields
  preferences: {
    onboardingCompleted?: boolean;
    onboardingLanguage?: "en" | "ru" | "nl";
    yourNewFeature?: boolean; // ← Add here
    [key: string]: any;
  };
};

// Use it
await updateUserPreferences({
  userId: user.id,
  preferences: {
    ...prefs.preferences,
    yourNewFeature: true,
  },
});
```

## Testing

**Check if onboarding completed**:
```sql
SELECT preferences->>'onboardingCompleted'
FROM user_settings
WHERE user_id = 'uuid-here';
```

**Reset onboarding for user**:
```sql
UPDATE user_settings
SET preferences = preferences - 'onboardingCompleted'
WHERE user_id = 'uuid-here';
```

**Force specific language**:
```sql
UPDATE user_settings
SET preferences = jsonb_set(
  preferences,
  '{onboardingLanguage}',
  '"ru"'
)
WHERE user_id = 'uuid-here';
```

## Best Practices

1. ✅ **Never auto-start onboarding** on login (respect user attention)
2. ✅ **Auto-detect language** from user context (system/translation settings)
3. ✅ **Persist to DB** for cross-device sync
4. ✅ **Allow manual restart** from settings UI
5. ✅ **Use JSONB for feature flags** to avoid schema migrations
6. ❌ **Don't show language selection popup** (auto-detect instead)

## Future Improvements

- [ ] Add "Show onboarding" button to Settings UI
- [ ] Track onboarding step completion analytics
- [ ] Add onboarding for mobile vs desktop separately
- [ ] Support dismissing individual steps
- [ ] Add onboarding for specific features (word lists, scenarios, etc.)
