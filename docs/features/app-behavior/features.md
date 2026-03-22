# App Behavior: Features

## Auth And Account Flows

### Google OAuth Authentication
**Added:** 2026-01-29
**User Story:** US-067.2

Google OAuth is the primary authentication method. Supabase is configured for Google client credentials and redirect URIs for web and PWA contexts, including iOS Safari standalone where token persistence is reliable.

### Supabase Site URL and Redirect Configuration
**Added:** 2026-01-29
**User Story:** US-067.1

Supabase auth settings point to `https://2000.dilum.io` as the site URL, with redirect URLs configured for auth callbacks. Email auth links are generated against the production domain instead of localhost.

### Email OTP Authentication (No Passwords)
**Added:** 2026-01-29
**User Story:** US-067.3

Password auth is disabled in Supabase. The app validates OTP codes against the configured length to avoid 6-digit versus 8-digit mismatches.

### Branded Email Templates (Supabase)
**Added:** 2026-01-29
**User Story:** US-067.4

Supabase auth emails use 2000nl-branded templates with product styling and accessible call-to-action formatting across Gmail, Outlook, and iOS Mail.

### PWA OAuth Verification + Manual OTP Fallback
**Added:** 2026-02-06
**User Story:** US-072.1

Google OAuth is verified in PWA standalone mode. When email-link auth opens in the wrong browser context, the auth page offers manual OTP entry.

## Translation And Audio

### Translation Abstraction Layer (Multi-Provider)
**Added:** 2026-01-29
**User Story:** US-050.1

Translations route through `ITranslator` with configurable provider selection and fallback support.

### OpenAI Translation Connector
**Added:** 2026-01-29
**User Story:** US-050.2

OpenAI translation uses `gpt-5.2` by default, includes part-of-speech context, retries on failure, and can fall back to DeepL.

### OpenAI as Default Translation Provider (GPT-5.2 + POS)
**Added:** 2026-02-08
**User Story:** US-024.1

OpenAI is the default translation provider, with DeepL available only as an automatic code-level fallback.

### Translation Note Field (Common vs Context Meaning)
**Added:** 2026-02-08
**User Story:** US-024.2

Translations can include an optional `note` field explaining common meaning versus contextual meaning.

### Translation Provider Attribution + Force Retranslate
**Added:** 2026-02-10
**User Story:** US-024.4

The UI surfaces which provider produced the cached translation, and long-press can force re-translation.

### Bulk Re-translation Cleanup
**Added:** 2026-02-08
**User Story:** US-024.3

A maintenance script can bulk re-translate existing saved translations with retries, batching, and reporting.

### Audio Provider Abstraction + Google Cloud TTS (Premium)
**Added:** 2026-02-08
**User Story:** US-053.1

Audio generation routes through `IAudioProvider`, with configurable premium providers and compatibility with the current playback pipeline.

### Azure Speech TTS Connector (Premium)
**Added:** 2026-02-08
**User Story:** US-053.2

Azure Speech TTS plugs into the same provider abstraction and uses Dutch neural voices with MP3 output.

### User Setting for Audio Quality (Free vs Premium)
**Added:** 2026-02-08
**User Story:** US-053.3

Users can choose free versus premium audio in Settings, and the selected provider affects routing and cache keys.

### Gemini Translation Connector
**Added:** 2026-01-29
**User Story:** US-050.3

Gemini implements `ITranslator` and can be selected through configuration.

### Sentence TTS Audio Playback (TTS)
**Added:** 2026-02-06
**User Story:** US-062.1

Sentence TTS audio is cached in a writable directory and served back through `GET /api/tts?key=<cacheKey>`, avoiding writes to `public/`.

### TTS Cache Subfolder Organization
**Added:** 2026-02-08
**User Story:** US-054.1

TTS cache files are stored in 2-character prefix subfolders to avoid large flat directories and improve filesystem performance.

## Training UX And Interaction

### Left-Edge Swipe Navigation (Recent Opgezocht)
**Added:** 2026-01-29
**User Story:** US-071.1

A left-edge swipe closes the Recent opgezocht list instead of triggering browser back navigation.

### Audio Mode Definition Playback
**Added:** 2026-01-29
**User Story:** US-055.1

When audio mode is enabled, tapping a definition or example sentence plays the full sentence via TTS.

### Line Spacing Consistency (Examples)
**Added:** 2026-01-29
**User Story:** US-063.1

Example sentence spacing is aligned across card types using shared line-height rules.

### Translation Overlay Font Size Increases
**Added:** 2026-02-06
**User Story:** US-082.1

Translation overlay typography is larger and more readable on both mobile and desktop.

### Translation Overlay Not Dismissed by Unrelated Keypresses
**Added:** 2026-02-06
**User Story:** US-087.1

Only the `T` hotkey and on-screen toggle control the translation overlay; unrelated keys no longer dismiss it.

### Preload Next Card for Speed
**Added:** 2026-02-06
**User Story:** US-075.1

The next card and related assets are prefetched while the current card is visible so advancing feels instant.

### Swipe Gesture Visual Feedback (Training Cards)
**Added:** 2026-02-06
**User Story:** US-068.1

The card tints and the matching action button highlights as the swipe progresses.

### Swipe Gestures for First-Encounter Choice
**Added:** 2026-02-06
**User Story:** US-069.1

First-encounter cards support swipe right for "Start learning" and swipe left for "I already know".

### Hide Past Perfect Participle in Definitions
**Added:** 2026-02-06
**User Story:** US-026.1

Verb hints like `(heeft vertrokken)` are rendered as `(heeft ...)` so the card keeps the grammatical cue without revealing the answer.

### Mobile Card Height Hybrid Approach
**Added:** 2026-02-06
**User Story:** US-065.1

On mobile, the training card uses a min/max height strategy with internal scrolling for overflow.

### Training Card Layout Fixes for Edge-Case Words
**Added:** 2026-02-06
**User Story:** US-084.1

Spacing is more robust for awkward words like "toe", "dezelfde", and "de rekening".

### Missing Translation Fix (omgekeerd)
**Added:** 2026-02-06
**User Story:** US-083.1

The word "omgekeerd" now has a translation in the database, and follow-up checks identify similar missing translations.

### Client-Side Review Turn ID (Idempotency)
**Added:** 2026-02-09
**User Story:** US-093.2

The client generates a `turnId` for each presented card and reuses it for retries.

### Backend Review Idempotency Guard (turnId)
**Added:** 2026-02-09
**User Story:** US-093.3

`handle_review` accepts `p_turn_id` and no-ops if the turn has already been logged.

### Backend Review Temporal Guard (legacy clients)
**Added:** 2026-02-09
**User Story:** US-093.4

Legacy clients without `turnId` are protected by a short same-user/same-word/same-mode temporal guard.

### Regression Tests (Double-Submit Prevention)
**Added:** 2026-02-09
**User Story:** US-093.5

The UI test suite covers rapid input, retry semantics, and `turnId` forwarding.

### PWA Icon and iOS Splash Screens
**Added:** 2026-02-06
**User Stories:** US-085.1, US-085.2

The manifest now includes installable icons and iOS startup images for common devices.

### PWA Install Support (Icon + Fullscreen)
**Added:** 2026-01-23
**User Story:** US-032

The app can be installed to the home screen and launched in standalone fullscreen mode.

### Desktop Card Width Expansion (Readability)
**Added:** 2026-01-23
**User Story:** US-045

The main training card column expands to `max-w-3xl` on desktop for better readability.

### Color Accessibility Improvements (WCAG AA)
**Added:** 2026-01-23
**User Story:** US-052

Color pairings were adjusted to meet WCAG AA contrast requirements.

### Cross-Reference-Only Word Filtering
**Added:** 2026-01-14
**User Story:** US-020

Entries that only point to another entry are filtered out before entering the learning queue.

### Mobile Swipe Gestures for Training Cards
**Added:** 2026-01-14
**User Story:** US-031

Mobile supports swipe gestures for main review actions with two-row action button layout.

### First-Time Learning UX
**Added:** 2026-01-14
**User Stories:** US-030.1 through US-030.5

First-encounter cards always use W→D, show a two-button interface, and route to fail or hide outcomes.

### Unknown Word Tap Feedback
**Added:** 2026-01-13
**User Story:** US-001

Unknown taps produce visible sidebar feedback instead of failing silently.

### Translation Overlay Fix (Mobile)
**Added:** 2026-01-13
**User Story:** US-002

Inline translations use one-line truncation and stable positioning on mobile.

### Badge Tooltips
**Added:** 2026-01-13 and 2026-01-14
**User Stories:** US-003, US-004

Definition and mode badges use consistent tooltip styling across the app.

## Recent Changes Summary

### 2026-01-14: Learning UX & Testing Tools Sprint
- 9 user stories
- First-time card learning with 2-button interface
- URL testing parameters for direct card access
- SRS history debugging script
- Forced W→D direction for first encounters

### 2026-01-13: UI Polish Sprint
- 4 user stories
- Unknown word tap feedback with sidebar messages
- Translation overlay overlap fix on mobile
- Badge tooltips on main card and sidebar
- Consistent `Tooltip` component usage

## Non-Goals And Deferred Features

- Template switcher UI
- Keyboard navigation for cards
- Known words management UI
- Further FSRS parameter changes

## Related Docs

- [premium-features.md](../premium-features.md)
- [developer-tools.md](./developer-tools.md)
- [technical-model.md](./technical-model.md)
