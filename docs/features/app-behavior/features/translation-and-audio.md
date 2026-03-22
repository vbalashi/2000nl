# App Behavior Features: Translation And Audio

### Translation Abstraction Layer (Multi-Provider)
**Added:** 2026-01-29
**User Story:** US-050.1

Translation routes through `ITranslator` with configurable providers and fallback.

### OpenAI Translation Connector
**Added:** 2026-01-29
**User Story:** US-050.2

OpenAI translation includes POS context, retries, and fallback behavior.

### OpenAI as Default Translation Provider (GPT-5.2 + POS)
**Added:** 2026-02-08
**User Story:** US-024.1

OpenAI is the default translation provider with DeepL fallback.

### Translation Note Field (Common vs Context Meaning)
**Added:** 2026-02-08
**User Story:** US-024.2

Translations can include a brief contextual `note`.

### Translation Provider Attribution + Force Retranslate
**Added:** 2026-02-10
**User Story:** US-024.4

The UI surfaces the actual provider used and supports force re-translation.

### Bulk Re-translation Cleanup
**Added:** 2026-02-08
**User Story:** US-024.3

A maintenance script re-translates stored rows using the current pipeline.

### Audio Provider Abstraction + Google Cloud TTS (Premium)
**Added:** 2026-02-08
**User Story:** US-053.1

Audio routing mirrors the translation provider pattern.

### Azure Speech TTS Connector (Premium)
**Added:** 2026-02-08
**User Story:** US-053.2

Azure TTS plugs into the premium audio path.

### User Setting for Audio Quality (Free vs Premium)
**Added:** 2026-02-08
**User Story:** US-053.3

Users choose free or premium audio in Settings.

### Gemini Translation Connector
**Added:** 2026-01-29
**User Story:** US-050.3

Gemini is supported as an alternate translation provider.

### Sentence TTS Audio Playback (TTS)
**Added:** 2026-02-06
**User Story:** US-062.1

Sentence TTS uses API-backed cache storage instead of writing to `public/`.

### TTS Cache Subfolder Organization
**Added:** 2026-02-08
**User Story:** US-054.1

Cache files are stored in prefix subdirectories for better filesystem behavior.

### Translation Overlay Font Size Increases
**Added:** 2026-02-06
**User Story:** US-082.1

Overlay typography is larger and easier to scan.

### Translation Overlay Not Dismissed by Unrelated Keypresses
**Added:** 2026-02-06
**User Story:** US-087.1

Only the translation controls toggle the overlay.

### Missing Translation Fix (omgekeerd)
**Added:** 2026-02-06
**User Story:** US-083.1

The missing translation was corrected and similar cases were queried.

### Translation Overlay Fix (Mobile)
**Added:** 2026-01-13
**User Story:** US-002

Inline translation overlays now truncate reliably on mobile.

See also: [docs/features/premium-features.md](../../premium-features.md)
