# Training prompt centering and hint stability

Accepted by owner on 2026-10-08, issue #633.

The main prompt text block (word, phrase, or multiline explanation) is the anchor at the card centre. Instructions sit above it; their height must not participate in centering the prompt. Showing a hint fades it in without moving the prompt. Shared front components own this behavior, including idioms. Long text must remain readable without overlap or horizontal overflow. Normal Training control boundaries use the existing quiet border role; keyboard focus remains distinct.

Existing Exclude copy and one-item menu agreement remains applicable. Idiom recovery is under investigation: transport supports restore, but UI discoverability has not been established. No new idiom Known or recovery controls are accepted in this change. No later user-facing restore path was found; follow-up #634 tracks it.

Implementation pending validation.
