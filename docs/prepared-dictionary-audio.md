# Prepared dictionary audio

The V2 client keeps using its existing entry-audio request and MP3 response.
A server-only optional `PREPARED_DICTIONARY_AUDIO_ROOT` selects a read-only
bundle containing `manifest.json` and immutable MP3 assets. No database change
is required. No provider credentials belong in this bundle.

Manifest shape (synthetic example):

```json
{"schema":"prepared-dictionary-audio-v1","dictionarySlug":"example-dictionary","bindings":{"native-entry-key":{"textSha256":"sha256-of-trimmed-text","assetPath":"assets/immutable-id.mp3","sha256":"sha256-of-file"}}}
```

Bindings use the authorized entry's `raw._source.source_entry_key` and exact
trimmed text hash. The dictionary slug must match the installed dictionary.
Never use a headword-only cross-dictionary lookup. Missing/stale/corrupt assets
for the configured dictionary fail closed, without provider generation. Other
dictionaries and example-node audio retain the existing path. Authorization
is read before resolution and checked again before private no-store delivery.

Publish a complete validated bundle, pin its manifest hash, and switch the
read-only root atomically during an authorized release. To change a voice,
point its logical binding to another immutable asset and publish a new manifest.
The client and content/progress IDs do not change. Existing in-flight reads may
complete against the old bundle, so retain it through the request grace period.
Native source metadata must survive import; otherwise add a trusted server
projection before enabling this feature. Client audioId is a presentation/cache
identity; it is not a file path and is not accepted as arbitrary server input.
