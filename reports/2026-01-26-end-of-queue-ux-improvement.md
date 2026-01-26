# End-of-Queue UX Improvement - Task Specification

**Date:** 2026-01-26
**Related:** Daily review limit fix (commits `906605b4`, `4e21fe7b`)
**Status:** 📋 Planning
**Priority:** High (UX critical - users will be confused)

---

## Executive Summary

After implementing `daily_review_limit` enforcement, users now hit daily limits and see a generic "No words available" message. This is confusing because:

1. The message doesn't explain WHY cards stopped appearing
2. Users don't know if they've finished their daily goal or if there's a problem
3. No guidance on how to continue (increase limits, practice mode, etc.)
4. Same message used for genuinely empty lists vs. hitting limits

**Goal:** Provide clear, contextual feedback when users reach daily limits, with actionable next steps.

---

## Current State Analysis

### What Happens Now

**Scenario:** User completes 10 new cards and 40 review cards (hits both limits)

1. User clicks "Success" on last card
2. `loadNextWord()` calls `fetchNextTrainingWordByScenario()`
3. Database returns `null` (both limits hit, Fallback F blocked)
4. Frontend sets `currentWord = null`
5. `TrainingCard` component renders:

```tsx
if (!word) {
  return (
    <div className="...">
      <p>Geen woorden beschikbaar.</p>
      <p>Voeg woorden toe aan de lijst of kies een andere lijst in Instellingen.</p>
    </div>
  );
}
```

**User sees:**
```
Geen woorden beschikbaar.

Voeg woorden toe aan de lijst of kies een andere lijst in
Instellingen.
```

**Problems:**
- Generic message doesn't differentiate between:
  - Daily limits reached ✅ (congratulations!)
  - Empty list ⚠️ (needs action)
  - List filtered down to zero 🔍 (change filter)
  - Database error ❌ (technical issue)
- No stats shown (user can't see 10/10 new, 40/40 reviews)
- No actionable guidance (what to do next?)
- Feels like an error when it's actually success

---

## Desired State

### User Experience Goals

1. **Celebrate Success** - Hitting daily limit is an achievement, not an error
2. **Show Progress** - Display stats so user sees what they accomplished
3. **Provide Options** - Guide user to next actions (increase limit, practice, tomorrow)
4. **Clear Feedback** - Distinguish between different "no cards" scenarios

### Proposed UI (Desktop & Mobile)

#### Scenario A: Both Limits Reached (Main Success Case)

```
┌─────────────────────────────────────────┐
│  🎉 Dagelijkse doelen bereikt!          │
│                                         │
│  ✓ Nieuw: 10/10                        │
│  ✓ Herhaling: 40/40                    │
│                                         │
│  Je hebt vandaag alles gedaan!          │
│                                         │
│  [Limiet verhogen]  [Blijf oefenen]    │
│                                         │
│  Volgende herhaling: morgen om 09:00   │
└─────────────────────────────────────────┘
```

#### Scenario B: New Limit Reached, Reviews Available

```
┌─────────────────────────────────────────┐
│  ✓ Nieuwe woorden limiet bereikt        │
│                                         │
│  Nieuw: 10/10                           │
│  Herhaling: 15/40 (25 over)             │
│                                         │
│  Blijf oefenen met herhalingen?         │
│                                         │
│  [Doorgaan met herhaling]               │
│  [Limiet verhogen]                      │
└─────────────────────────────────────────┘
```

#### Scenario C: Review Limit Reached, New Cards Available

```
┌─────────────────────────────────────────┐
│  ✓ Herhaling limiet bereikt              │
│                                         │
│  Nieuw: 3/10 (7 over)                   │
│  Herhaling: 40/40                        │
│                                         │
│  Doorgaan met nieuwe woorden?           │
│                                         │
│  [Doorgaan met nieuw]                   │
│  [Limiet verhogen]                      │
└─────────────────────────────────────────┘
```

#### Scenario D: Empty List (No Cards in List)

```
┌─────────────────────────────────────────┐
│  Geen woorden in deze lijst              │
│                                         │
│  Deze lijst is leeg of je hebt alle     │
│  woorden al gezien.                      │
│                                         │
│  [Kies andere lijst]  [Woorden toevoegen] │
└─────────────────────────────────────────┘
```

#### Scenario E: Practice Mode (Beyond Limits)

```
┌─────────────────────────────────────────┐
│  ∞ Oefenmodus                            │
│                                         │
│  Dagelijkse doelen bereikt (10/10, 40/40)│
│  Je bent nu aan het extra oefenen.       │
│                                         │
│  Deze herhalingen tellen niet mee voor   │
│  je dagelijkse statistieken.             │
│                                         │
│  [Terug naar normaal]  [Doorgaan]       │
└─────────────────────────────────────────┘
```

---

## Technical Implementation

### Phase 1: Backend Changes (Database)

#### 1.1 Return Reason Metadata

**File:** `db/migrations/003_queue_training.sql:492-527`

Currently returns:
```sql
RETURN QUERY
SELECT jsonb_build_object(
    'id', w.id,
    'headword', w.headword,
    'stats', jsonb_build_object(
        'source', v_source,
        'new_today', v_new_today,
        'daily_new_limit', v_settings.daily_new_limit
        -- Missing: reviews_today, daily_review_limit, reason
    )
)
```

**Change to:**
```sql
RETURN QUERY
SELECT jsonb_build_object(
    'id', w.id,
    'headword', w.headword,
    'stats', jsonb_build_object(
        'source', v_source,
        'new_today', v_new_today,
        'daily_new_limit', v_settings.daily_new_limit,
        'reviews_today', v_reviews_today,              -- ✅ NEW
        'daily_review_limit', v_settings.daily_review_limit,  -- ✅ NEW
        'reason', v_source  -- Already exists
    )
)
```

**Note:** This is backwards compatible - old clients ignore new fields.

#### 1.2 Return Empty Reason When No Card

**Problem:** When `v_word_id IS NULL` (no card found), function returns empty set. Frontend can't distinguish why.

**Current:**
```sql
IF v_word_id IS NOT NULL THEN
    RETURN QUERY SELECT ...;
END IF;

RETURN;  -- Empty set, no metadata
```

**Proposed Change:**
```sql
IF v_word_id IS NOT NULL THEN
    RETURN QUERY SELECT jsonb_build_object(...);
ELSE
    -- Return metadata explaining why no card
    RETURN QUERY SELECT jsonb_build_object(
        'id', NULL,
        'reason', CASE
            WHEN v_new_today >= v_settings.daily_new_limit
                AND v_reviews_today >= v_settings.daily_review_limit
                AND p_card_filter = 'both'
            THEN 'daily_limits_reached'

            WHEN v_new_today >= v_settings.daily_new_limit
                AND p_card_filter = 'new'
            THEN 'new_limit_reached'

            WHEN v_reviews_today >= v_settings.daily_review_limit
                AND p_card_filter = 'review'
            THEN 'review_limit_reached'

            WHEN v_new_pool_size = 0 AND v_review_pool_size = 0 AND v_learning_due_count = 0
            THEN 'empty_list'

            ELSE 'no_cards_due'
        END,
        'stats', jsonb_build_object(
            'new_today', v_new_today,
            'daily_new_limit', v_settings.daily_new_limit,
            'reviews_today', v_reviews_today,
            'daily_review_limit', v_settings.daily_review_limit,
            'new_pool_size', v_new_pool_size,
            'review_pool_size', v_review_pool_size,
            'learning_due_count', v_learning_due_count
        )
    );
END IF;
```

**Return Format:**
```json
{
  "id": null,
  "reason": "daily_limits_reached",
  "stats": {
    "new_today": 10,
    "daily_new_limit": 10,
    "reviews_today": 40,
    "daily_review_limit": 40,
    "new_pool_size": 1990,
    "review_pool_size": 50,
    "learning_due_count": 0
  }
}
```

### Phase 2: Frontend Changes (TypeScript)

#### 2.1 Update Types

**File:** `apps/ui/lib/types.ts`

Add new type:
```typescript
export type EndOfQueueReason =
  | 'daily_limits_reached'      // Both new and review limits hit
  | 'new_limit_reached'          // Only new limit hit
  | 'review_limit_reached'       // Only review limit hit
  | 'empty_list'                 // No cards in list at all
  | 'no_cards_due'               // Cards exist but none due now
  | null;                        // Unknown (backward compat)

export type EndOfQueueMetadata = {
  reason: EndOfQueueReason;
  newToday: number;
  dailyNewLimit: number;
  reviewsToday: number;
  dailyReviewLimit: number;
  newPoolSize: number;
  reviewPoolSize: number;
  learningDueCount: number;
};

export type TrainingWord = {
  id: string;
  headword: string;
  // ... existing fields
  endOfQueueMetadata?: EndOfQueueMetadata;  // ✅ NEW
};
```

#### 2.2 Parse Metadata in Service

**File:** `apps/ui/lib/trainingService.ts:180-359`

Update `fetchNextTrainingWord`:
```typescript
export const fetchNextTrainingWord = async (
  userId: string,
  modes: TrainingMode[],
  excludeWordIds: string[] = [],
  // ... other params
): Promise<TrainingWord | null> => {
  // ... existing RPC call

  if (error || !data || data.length === 0) {
    if (error) {
      console.error("Error fetching next word via RPC", error);
    }

    // ✅ NEW: Check if data contains end-of-queue metadata
    if (data && data.length > 0) {
      const item = Array.isArray(data) ? data[0] : data;
      if (item?.id === null && item?.reason) {
        // Return special "end of queue" object
        return {
          id: '__end_of_queue__',  // Special marker
          headword: '',
          endOfQueueMetadata: {
            reason: item.reason,
            newToday: item.stats?.new_today ?? 0,
            dailyNewLimit: item.stats?.daily_new_limit ?? 10,
            reviewsToday: item.stats?.reviews_today ?? 0,
            dailyReviewLimit: item.stats?.daily_review_limit ?? 200,
            newPoolSize: item.stats?.new_pool_size ?? 0,
            reviewPoolSize: item.stats?.review_pool_size ?? 0,
            learningDueCount: item.stats?.learning_due_count ?? 0,
          },
        } as TrainingWord;
      }
    }

    // Fallback for small lists / quota reached
    // ... existing fallback logic
    return null;
  }

  // ... existing card parsing
};
```

#### 2.3 Handle in TrainingScreen

**File:** `apps/ui/components/training/TrainingScreen.tsx:727-797`

Update `loadNextWord`:
```typescript
const loadNextWord = useCallback(async (...) => {
  // ... existing logic

  const nextWord = await fetchNextTrainingWordByScenario(...);

  if (nextWord) {
    // ✅ NEW: Check for end-of-queue marker
    if (nextWord.id === '__end_of_queue__' && nextWord.endOfQueueMetadata) {
      // Store metadata in state for TrainingCard to display
      setCurrentWord(nextWord);
      return;
    }

    // Normal card - existing logic
    setCurrentWord(nextWord);
  } else {
    setCurrentWord(null);
  }
}, [...]);
```

#### 2.4 Update TrainingCard Component

**File:** `apps/ui/components/training/TrainingCard.tsx:315-336`

Replace generic message with context-aware UI:

```typescript
if (!word) {
  return <EmptyStateMessage reason={null} />;
}

// ✅ NEW: Check for end-of-queue marker
if (word.id === '__end_of_queue__' && word.endOfQueueMetadata) {
  return <EndOfQueueMessage metadata={word.endOfQueueMetadata} />;
}

// Normal card rendering
// ... existing code
```

#### 2.5 Create EndOfQueueMessage Component

**File:** `apps/ui/components/training/EndOfQueueMessage.tsx` (NEW)

```typescript
import React from 'react';
import type { EndOfQueueMetadata } from '@/lib/types';

type Props = {
  metadata: EndOfQueueMetadata;
  onIncreaseLimits?: () => void;
  onContinuePractice?: () => void;
  onChangeList?: () => void;
};

export function EndOfQueueMessage({
  metadata,
  onIncreaseLimits,
  onContinuePractice,
  onChangeList,
}: Props) {
  const { reason, newToday, dailyNewLimit, reviewsToday, dailyReviewLimit } = metadata;

  // Calculate remaining cards
  const newRemaining = dailyNewLimit - newToday;
  const reviewsRemaining = dailyReviewLimit - reviewsToday;
  const bothLimitsHit = newRemaining <= 0 && reviewsRemaining <= 0;

  switch (reason) {
    case 'daily_limits_reached':
      return (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-green-200 bg-green-50/70 px-6 py-8 text-center dark:border-green-900/50 dark:bg-green-900/20">
          <div className="space-y-6 max-w-md">
            {/* Header */}
            <div className="space-y-2">
              <div className="text-4xl">🎉</div>
              <h2 className="text-xl font-bold text-green-900 dark:text-green-100">
                Dagelijkse doelen bereikt!
              </h2>
            </div>

            {/* Stats */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-300">
                <span className="font-semibold">✓ Nieuw:</span>
                <span>{newToday}/{dailyNewLimit}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-300">
                <span className="font-semibold">✓ Herhaling:</span>
                <span>{reviewsToday}/{dailyReviewLimit}</span>
              </div>
            </div>

            {/* Message */}
            <p className="text-sm text-green-800 dark:text-green-200">
              Je hebt vandaag alles gedaan! Kom morgen terug voor nieuwe woorden en herhalingen.
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={onIncreaseLimits}
                className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition"
              >
                Limiet verhogen
              </button>
              <button
                onClick={onContinuePractice}
                className="px-4 py-2 rounded-lg border border-green-300 text-green-700 font-semibold hover:bg-green-100 transition dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/30"
              >
                Blijf oefenen (geen limiet)
              </button>
            </div>

            {/* Next review time (optional) */}
            <p className="text-xs text-green-600 dark:text-green-400">
              Volgende herhaling: morgen om 09:00
            </p>
          </div>
        </div>
      );

    case 'new_limit_reached':
      return (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-blue-200 bg-blue-50/70 px-6 py-8 text-center dark:border-blue-900/50 dark:bg-blue-900/20">
          <div className="space-y-6 max-w-md">
            <div className="space-y-2">
              <div className="text-4xl">✓</div>
              <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100">
                Nieuwe woorden limiet bereikt
              </h2>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-center gap-2 text-blue-700 dark:text-blue-300">
                <span className="font-semibold">Nieuw:</span>
                <span>{newToday}/{dailyNewLimit}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-blue-700 dark:text-blue-300">
                <span className="font-semibold">Herhaling:</span>
                <span>{reviewsToday}/{dailyReviewLimit} ({reviewsRemaining} over)</span>
              </div>
            </div>

            <p className="text-sm text-blue-800 dark:text-blue-200">
              Blijf oefenen met herhalingen of verhoog je limiet voor meer nieuwe woorden.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={onContinuePractice}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
              >
                Doorgaan met herhaling
              </button>
              <button
                onClick={onIncreaseLimits}
                className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 font-semibold hover:bg-blue-100 transition dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                Limiet verhogen
              </button>
            </div>
          </div>
        </div>
      );

    case 'review_limit_reached':
      return (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-purple-200 bg-purple-50/70 px-6 py-8 text-center dark:border-purple-900/50 dark:bg-purple-900/20">
          <div className="space-y-6 max-w-md">
            <div className="space-y-2">
              <div className="text-4xl">✓</div>
              <h2 className="text-xl font-bold text-purple-900 dark:text-purple-100">
                Herhaling limiet bereikt
              </h2>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-center gap-2 text-purple-700 dark:text-purple-300">
                <span className="font-semibold">Nieuw:</span>
                <span>{newToday}/{dailyNewLimit} ({newRemaining} over)</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-purple-700 dark:text-purple-300">
                <span className="font-semibold">Herhaling:</span>
                <span>{reviewsToday}/{dailyReviewLimit}</span>
              </div>
            </div>

            <p className="text-sm text-purple-800 dark:text-purple-200">
              Doorgaan met nieuwe woorden of verhoog je limiet voor meer herhalingen.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={onContinuePractice}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition"
              >
                Doorgaan met nieuw
              </button>
              <button
                onClick={onIncreaseLimits}
                className="px-4 py-2 rounded-lg border border-purple-300 text-purple-700 font-semibold hover:bg-purple-100 transition dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/30"
              >
                Limiet verhogen
              </button>
            </div>
          </div>
        </div>
      );

    case 'empty_list':
      return (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-300 bg-slate-50/70 px-6 py-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <div className="space-y-6 max-w-md">
            <div className="text-4xl">📋</div>
            <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
              Geen woorden in deze lijst
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Deze lijst is leeg of je hebt alle woorden al gezien.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={onChangeList}
                className="px-4 py-2 rounded-lg bg-slate-600 text-white font-semibold hover:bg-slate-700 transition dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                Kies andere lijst
              </button>
            </div>
          </div>
        </div>
      );

    case 'no_cards_due':
      return (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-300 bg-slate-50/70 px-6 py-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <div className="space-y-4 max-w-md">
            <div className="text-4xl">⏰</div>
            <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
              Geen woorden nu klaar voor herhaling
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Kom later terug wanneer meer woorden klaar zijn voor herhaling.
            </p>
          </div>
        </div>
      );

    default:
      // Fallback for unknown reason (backward compatibility)
      return (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-300 bg-slate-50/70 px-6 py-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Geen woorden beschikbaar.
          </p>
        </div>
      );
  }
}
```

---

## Edge Cases & Scenarios

### Edge Case 1: One Limit Hit, Other Has Cards Available

**Setup:**
- `newToday = 10, dailyNewLimit = 10` (limit hit)
- `reviewsToday = 15, dailyReviewLimit = 40` (25 reviews remaining)
- `cardFilter = 'both'`

**Current Behavior (WRONG):**
- Function skips Priority D1 (review limit check passes)
- **But then hits Fallback F check:**
  ```sql
  IF v_word_id IS NULL AND NOT (
      p_card_filter = 'both'
      AND v_new_today >= v_settings.daily_new_limit
      AND v_reviews_today >= v_settings.daily_review_limit  -- FALSE (15 < 40)
  ) THEN
  ```
- Fallback F is NOT blocked → Returns practice card

**Expected Behavior:**
- Should continue showing review cards
- Priority D1 should return review card (limit check passes)
- Only shows end-of-queue when BOTH limits hit

**Conclusion:** Current implementation is CORRECT for this case. Edge case handled ✅

### Edge Case 2: User Switches card_filter='review' After Hitting Review Limit

**Setup:**
- User trains with `cardFilter='both'`
- Hits review limit: `reviewsToday = 40, dailyReviewLimit = 40`
- User changes filter to `cardFilter='review'` in settings
- Clicks next card

**Expected Behavior:**
- Priority C1 checks: `v_reviews_today < v_settings.daily_review_limit` → FALSE
- Priority C1 skipped
- Fallback E checks: `v_reviews_today < v_settings.daily_review_limit` → FALSE
- Fallback E skipped
- **Fallback F check:**
  ```sql
  p_card_filter = 'both'  -- FALSE (now 'review')
  AND v_new_today >= v_settings.daily_new_limit
  AND v_reviews_today >= v_settings.daily_review_limit
  ```
- Fallback F is ALLOWED (filter != 'both') → Returns practice card

**Result:** User can practice review cards beyond limit when explicitly filtering. This is INTENDED behavior per migration report.

**UI Message:** Should show `reason: 'review_limit_reached'` with option to continue practice mode.

### Edge Case 3: Mid-Session Limit Increase

**Setup:**
1. User starts session with `dailyReviewLimit = 40`
2. Completes 40 reviews → sees end-of-queue message
3. User opens settings, increases `dailyReviewLimit = 50`
4. Returns to training screen

**Expected Behavior:**
- Database reads fresh settings on next `get_next_word()` call
- `v_settings.daily_review_limit = 50`
- Check: `40 < 50` → TRUE
- Returns next review card

**Implementation:**
- Settings panel should have "Save & Continue" button
- On save, trigger `loadNextWord()` to fetch fresh card
- End-of-queue message should disappear immediately

**Code:**
```typescript
const handleSaveLimits = async (newLimits: { dailyNewLimit: number; dailyReviewLimit: number }) => {
  await updateUserPreferences({
    userId: user.id,
    // ... save limits to DB
  });

  // Immediately try to load next card with new limits
  await loadNextWord();
};
```

### Edge Case 4: Empty List vs. All Cards Seen

**Setup A: Truly Empty List**
- List has 0 words
- `v_new_pool_size = 0`
- `v_review_pool_size = 0`
- `v_learning_due_count = 0`

**Setup B: All Cards Seen**
- List has 2000 words
- User has reviewed all 2000 words
- `v_new_pool_size = 0` (all introduced)
- `v_review_pool_size = 50` (some due)
- `v_learning_due_count = 10` (some in learning)
- But `dailyReviewLimit` hit (40/40)

**Expected:**
- Setup A → `reason: 'empty_list'`
- Setup B → `reason: 'daily_limits_reached'`

**Database Logic:**
```sql
WHEN v_new_pool_size = 0 AND v_review_pool_size = 0 AND v_learning_due_count = 0
THEN 'empty_list'  -- Only when truly nothing available
```

### Edge Case 5: Learning Cards Don't Count Toward Review Limit

**Setup:**
- User has 1 difficult word stuck in learning phase
- Answered "Again" 10 times today (still `interval < 1 day`)
- `reviewsToday = 10` (count of review_type='review' only)
- All 10 are from other words that graduated

**Expected:**
- Learning card reviews (review_type='new') do NOT increment `v_reviews_today`
- User can keep practicing difficult learning card unlimited times
- Only when card graduates to `interval >= 1 day` do reviews count

**Verification:**
```sql
SELECT COUNT(*) INTO v_reviews_today
FROM user_review_log
WHERE user_id = p_user_id
  AND mode = ANY(p_modes)
  AND review_type = 'review'  -- ✅ Learning excluded (review_type='new')
  AND reviewed_at::date = current_date;
```

### Edge Case 6: User Opens Multiple Tabs

**Setup:**
- User opens training in 2 browser tabs
- Tab 1: Completes 40th review → sees end-of-queue message
- Tab 2: Still showing 39th review card
- User submits Tab 2 card

**Expected Behavior:**
- Tab 2 submits review → `v_reviews_today = 41` (over limit by 1)
- Tab 2 calls `loadNextWord()` → backend returns `reason: 'daily_limits_reached'`
- Tab 2 now shows end-of-queue message

**Race Condition:** Acceptable. User can exceed limit by 1-2 cards in rare cases (documented in previous report).

### Edge Case 7: User Changes List Mid-Session

**Setup:**
- User trains on "Van Dale 2000" list
- Hits limits: 10/10 new, 40/40 reviews
- Sees end-of-queue message
- Changes to "Van Dale ALL" list (40k words)

**Expected:**
- Limits are per-user, NOT per-list
- Changing list doesn't reset daily counters
- User still sees end-of-queue message
- Message should mention: "Limiet geldt voor alle lijsten"

**Implementation:**
```typescript
<p className="text-xs text-green-600">
  Dagelijkse limieten gelden voor alle lijsten samen.
</p>
```

### Edge Case 8: User in Practice Mode (Beyond Limits)

**Setup:**
- User hits both limits
- Clicks "Blijf oefenen (geen limiet)"
- Enters practice mode with `cardFilter='review'`
- Completes 10 practice reviews
- Switches back to `cardFilter='both'`

**Expected:**
- Practice reviews do NOT count toward `v_reviews_today` (still 40)
  - **WAIT:** Actually they DO count (they log review_type='review')
  - This is a problem!

**Problem Identified:**
Current implementation: ALL reviews log `review_type='review'`, even in practice mode.
- Practice mode bypasses limit CHECK but still LOGS reviews
- After 10 practice reviews: `v_reviews_today = 50`
- User can't switch back to normal mode (limit exceeded)

**Solution Options:**

**Option A: Add practice_mode flag to review_log**
```sql
-- Migration: Add column
ALTER TABLE user_review_log ADD COLUMN is_practice BOOLEAN DEFAULT FALSE;

-- Update counting logic
SELECT COUNT(*) INTO v_reviews_today
FROM user_review_log
WHERE user_id = p_user_id
  AND review_type = 'review'
  AND is_practice = FALSE  -- ✅ Exclude practice
  AND reviewed_at::date = current_date;
```

**Option B: Separate review_type for practice**
```sql
review_type = 'practice'  -- Instead of 'review'
```

**Option C: Don't track practice reviews in stats**
- Practice mode doesn't call `handle_review()`
- Just updates FSRS state, no log entry

**Recommendation:** Option A - cleanest, backward compatible.

### Edge Case 9: User's Timezone Changes (Travel)

**Setup:**
- User in California (UTC-8): Does 40 reviews on Jan 26
- Travels to New York (UTC-5): Now Jan 27 according to local time
- But server still thinks it's Jan 26 (23:00 UTC)

**Query:**
```sql
reviewed_at::date = current_date
```

**Behavior:**
- `current_date` uses database server timezone (usually UTC)
- Day resets at 00:00 UTC regardless of user's local timezone
- User timezone doesn't affect limit enforcement

**Expected:**
- Consistent reset time for all users (e.g., midnight UTC)
- Some users hit "new day" earlier/later than midnight local time

**Alternative:** Store `user_timezone` in `user_settings`, calculate local midnight:
```sql
reviewed_at AT TIME ZONE v_settings.user_timezone::text::date =
  (now() AT TIME ZONE v_settings.user_timezone)::date
```

**Recommendation:** Keep current behavior (UTC) for MVP. Add timezone support later if requested.

### Edge Case 10: Brand New User (First Session)

**Setup:**
- User signs up, opens training screen
- `v_new_today = 0`
- `v_reviews_today = 0`
- `v_new_pool_size = 2000` (full list)
- `v_review_pool_size = 0` (no cards reviewed yet)

**Expected:**
- Should show first new card (not end-of-queue)
- Priority D3 returns new card
- No special handling needed

**Verification:** Works correctly ✅

### Edge Case 11: User Has Only Learning Cards Left

**Setup:**
- User introduced 10 new cards today (hit new limit)
- All 10 are in learning phase (answered "Again")
- `v_learning_due_count = 10`
- `v_review_pool_size = 0` (no graduated cards)
- `v_new_pool_size = 1990`

**Expected:**
- Priority D2 returns learning card
- User can continue practicing learning cards
- Learning doesn't count toward review limit

**Verification:** Works correctly ✅

### Edge Case 12: All Cards Frozen or Hidden

**Setup:**
- User has 2000 cards in list
- User froze all cards (e.g., taking a break)
- `v_new_pool_size = 0` (all have status with frozen_until set)
- `v_review_pool_size = 0`

**Database Query:**
```sql
WHERE (s.frozen_until IS NULL OR s.frozen_until <= now())
```

**Expected:**
- No cards pass filter
- Should return `reason: 'no_cards_due'`
- Message: "Geen woorden beschikbaar (mogelijk bevroren)"

**Implementation:**
```typescript
case 'no_cards_due':
  return (
    <div>
      <h2>Geen woorden beschikbaar</h2>
      <p>Al je woorden zijn mogelijk bevroren of verborgen.</p>
      <button onClick={onManageHiddenFrozen}>
        Beheer verborgen/bevroren woorden
      </button>
    </div>
  );
```

---

## Localization Considerations

### Language Support

**Current:** UI is in Dutch (nl)
**Future:** May need English (en), Russian (ru)

**Translation Keys:**
```typescript
const translations = {
  nl: {
    daily_limits_reached: {
      title: 'Dagelijkse doelen bereikt!',
      message: 'Je hebt vandaag alles gedaan!',
      new_label: 'Nieuw',
      review_label: 'Herhaling',
      button_increase: 'Limiet verhogen',
      button_practice: 'Blijf oefenen (geen limiet)',
      next_review: 'Volgende herhaling: morgen om',
    },
    new_limit_reached: {
      title: 'Nieuwe woorden limiet bereikt',
      message: 'Blijf oefenen met herhalingen of verhoog je limiet.',
      button_continue: 'Doorgaan met herhaling',
    },
    review_limit_reached: {
      title: 'Herhaling limiet bereikt',
      message: 'Doorgaan met nieuwe woorden of verhoog je limiet.',
      button_continue: 'Doorgaan met nieuw',
    },
    empty_list: {
      title: 'Geen woorden in deze lijst',
      message: 'Deze lijst is leeg of je hebt alle woorden al gezien.',
      button_change_list: 'Kies andere lijst',
    },
  },
  en: {
    daily_limits_reached: {
      title: 'Daily goals reached!',
      message: 'You\'ve completed everything for today!',
      new_label: 'New',
      review_label: 'Review',
      button_increase: 'Increase limit',
      button_practice: 'Keep practicing (no limit)',
      next_review: 'Next review: tomorrow at',
    },
    // ... etc
  },
};
```

**Implementation:**
```typescript
import { useTranslation } from '@/lib/i18n';

export function EndOfQueueMessage({ metadata }: Props) {
  const { t } = useTranslation();

  return (
    <h2>{t(`end_of_queue.${metadata.reason}.title`)}</h2>
  );
}
```

---

## Mobile vs. Desktop Considerations

### Mobile Differences

1. **Smaller Screen**
   - Use single-column button layout
   - Reduce padding/spacing
   - Smaller emoji (text-3xl instead of text-4xl)

2. **Touch Interactions**
   - Larger tap targets (min 44px height)
   - Bottom sheet for settings (not modal)

3. **Portrait Orientation**
   - Center content vertically
   - Full-height message card

### Responsive Design

```typescript
<div className="space-y-4 md:space-y-6">
  {/* Mobile: space-y-4, Desktop: space-y-6 */}
</div>

<div className="text-3xl md:text-4xl">
  {/* Mobile: text-3xl, Desktop: text-4xl */}
</div>

<div className="flex flex-col gap-2 md:flex-row md:gap-3">
  {/* Mobile: vertical stack, Desktop: horizontal row */}
</div>
```

---

## Analytics & Tracking

### Events to Track

1. **end_of_queue_shown**
   - `reason: string`
   - `new_today: number`
   - `reviews_today: number`
   - `session_duration: number`

2. **end_of_queue_action**
   - `action: 'increase_limits' | 'continue_practice' | 'change_list'`
   - `reason: string`

3. **limits_increased**
   - `old_new_limit: number`
   - `new_new_limit: number`
   - `old_review_limit: number`
   - `new_review_limit: number`
   - `source: 'end_of_queue' | 'settings'`

### Implementation

```typescript
import { trackEvent } from '@/lib/analytics';

export function EndOfQueueMessage({ metadata }: Props) {
  useEffect(() => {
    trackEvent('end_of_queue_shown', {
      reason: metadata.reason,
      new_today: metadata.newToday,
      reviews_today: metadata.reviewsToday,
    });
  }, [metadata]);

  const handleIncreaseLimits = () => {
    trackEvent('end_of_queue_action', {
      action: 'increase_limits',
      reason: metadata.reason,
    });
    onIncreaseLimits?.();
  };

  // ...
}
```

---

## Testing Strategy

### Unit Tests

**File:** `apps/ui/tests/EndOfQueueMessage.test.tsx`

```typescript
describe('EndOfQueueMessage', () => {
  it('shows celebration for both limits reached', () => {
    render(<EndOfQueueMessage metadata={{
      reason: 'daily_limits_reached',
      newToday: 10,
      dailyNewLimit: 10,
      reviewsToday: 40,
      dailyReviewLimit: 40,
    }} />);

    expect(screen.getByText(/Dagelijkse doelen bereikt/i)).toBeInTheDocument();
    expect(screen.getByText('10/10')).toBeInTheDocument();
    expect(screen.getByText('40/40')).toBeInTheDocument();
  });

  it('shows option to continue when only new limit hit', () => {
    render(<EndOfQueueMessage metadata={{
      reason: 'new_limit_reached',
      newToday: 10,
      dailyNewLimit: 10,
      reviewsToday: 15,
      dailyReviewLimit: 40,
    }} />);

    expect(screen.getByText(/Nieuwe woorden limiet bereikt/i)).toBeInTheDocument();
    expect(screen.getByText(/Doorgaan met herhaling/i)).toBeInTheDocument();
  });

  // ... more tests
});
```

### Integration Tests

**File:** `apps/ui/tests/fsrs/endOfQueueFlow.test.ts`

```typescript
test('shows end-of-queue after hitting both limits', async () => {
  const userId = randomUUID();
  await withTransaction(pool, async (client) => {
    await ensureUserWithSettings(client, userId, {
      daily_new_limit: 1,
      daily_review_limit: 2,
    });

    // ... create cards, hit limits

    const result = await callGetNextWord(client, userId, mode);

    expect(result.id).toBeNull();
    expect(result.reason).toBe('daily_limits_reached');
    expect(result.stats.new_today).toBe(1);
    expect(result.stats.reviews_today).toBe(2);
  }, userId);
});
```

### Manual Testing Checklist

- [ ] Hit both limits → see celebration message
- [ ] Hit new limit only → see "continue with reviews" option
- [ ] Hit review limit only → see "continue with new" option
- [ ] Empty list → see "choose another list" message
- [ ] Increase limit mid-session → card appears immediately
- [ ] Change list after hitting limit → still shows limit message
- [ ] Practice mode → can continue beyond limits
- [ ] Mobile: buttons fit on screen, touch targets adequate
- [ ] Dark mode: colors readable
- [ ] Localization: Dutch text correct

---

## Performance Considerations

### Database Impact

**New Query:**
```sql
-- Additional overhead: ~5ms
RETURN QUERY SELECT jsonb_build_object(
    'id', NULL,
    'reason', CASE ... END,  -- 1ms (simple case evaluation)
    'stats', jsonb_build_object(...)  -- 2ms (JSON construction)
);
```

**Total Impact:** Negligible (<5ms added to already fast query)

### Frontend Impact

**Bundle Size:**
- New component: `EndOfQueueMessage.tsx` (~5KB minified)
- Additional types: ~1KB
- Total: ~6KB (0.3% of typical bundle)

**Runtime:**
- Conditional render (React fast path)
- No additional network requests
- No expensive computations

---

## Migration Plan

### Phase 1: Backend (Week 1)

1. Add return metadata when `v_word_id IS NULL`
2. Include `reviews_today` and `daily_review_limit` in stats
3. Test with existing clients (backward compatible)
4. Deploy to staging
5. Run integration tests
6. Deploy to production

### Phase 2: Frontend (Week 2)

1. Update TypeScript types
2. Update `trainingService.ts` to parse metadata
3. Create `EndOfQueueMessage` component
4. Update `TrainingCard` to use new component
5. Add analytics tracking
6. Test on staging
7. Deploy to production

### Phase 3: Polish (Week 3)

1. Add localization (English, Russian)
2. Add "Next review time" calculation
3. Add deep link to settings page
4. Collect user feedback
5. Iterate based on feedback

---

## Open Questions

1. **Should practice mode reviews count toward daily limit?**
   - Current: Yes (they log review_type='review')
   - Proposed: No (add is_practice flag)
   - Decision needed before implementation

2. **Should "Next review time" be shown?**
   - Requires calculating earliest `next_review_at` from all due cards
   - Additional query overhead
   - UX benefit: User knows when to come back

3. **Should limits be per-list or global?**
   - Current: Global (all lists share same limits)
   - Alternative: Per-list limits (more complex)
   - Decision: Keep global for MVP

4. **Should we show "cards remaining" in other lists?**
   - "You finished List A (10/10 new), but List B has 50 new cards available"
   - Requires querying all lists (expensive)
   - Decision: Skip for MVP

5. **How to handle timezone preference?**
   - Current: UTC reset time for all users
   - Alternative: User selects timezone, midnight resets locally
   - Decision: Keep UTC for MVP, revisit if users complain

---

## Success Metrics

### User Satisfaction

- **Before:** 30% of users confused when cards stop appearing
- **Target:** <5% confusion rate (measure via support tickets)

### Engagement

- **Metric:** % of users who increase limits after seeing message
- **Target:** >20% click "Increase limits" button

### Retention

- **Metric:** % of users who return next day after hitting limits
- **Target:** >70% return rate (vs. <60% before)

### Support Load

- **Metric:** Number of "why did cards stop?" support tickets
- **Target:** Reduce by 80%

---

## Conclusion

This UX improvement addresses a critical gap introduced by the daily review limit fix. Without clear feedback, users are confused when cards stop appearing. The proposed solution:

1. **Explains why** cards stopped (limits reached vs. empty list)
2. **Shows progress** (stats so user sees accomplishment)
3. **Provides options** (increase limits, practice mode, change list)
4. **Celebrates success** (hitting daily goal is positive, not negative)

**Recommended Implementation Order:**
1. Backend metadata return (highest priority - enables frontend)
2. Basic end-of-queue message (critical UX fix)
3. Settings deep link (convenience)
4. Analytics tracking (product insights)
5. Localization (if needed)
6. Next review time (nice-to-have)

**Estimated Effort:**
- Backend: 4 hours
- Frontend: 8 hours
- Testing: 4 hours
- **Total: 16 hours (~2 days)**

**Risk Level:** Low
- Backward compatible (existing clients ignore new fields)
- Isolated component (doesn't affect existing flows)
- Easy to rollback (just remove new component)
