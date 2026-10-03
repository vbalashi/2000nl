# Owner joint transition pass — 2026-10-03

Production release at start: 0.18.1134 (a27239f549ee196f08fdc55ba77c0887ad2af376).

## Reload loaders (owner observation, not yet captured)
Reload alternates between several 2000NL/loading-training screens, with different text positions and temporary palette differing from final appearance. Duration varies from brief flashes to seconds. Desired: stable geometry and text during bootstrap; final palette early if available, otherwise restrained neutral presentation. Need reload sequence capture before attributing cause.

## Saved Translation Play (owner trigger, current browser state confirmed)
Owner initially saw Idiooms as main training and three saved rows. Clicked saved Translation Play: no training card opened. Main panel became Translation, but subtitle Words · Reverse, counters 0 done / 0 remaining, Continue training disabled. Idiooms appeared below; four saved rows now visible.

Read-only Chrome Nikolai inspection confirms main Translation / Words · Reverse / disabled Continue, and saved Translation / Translation · Example translation → word · 5 exercises, plus Riss training, VanDale 2k words, Idiooms. No reload, start click, grade, preference change or production write performed by agent. Initial three-row state and click network trace not independently captured. Apparent row-count increase is not evidence of a newly created saved recipe.

Open questions: main-panel selection vs saved-list projection; recipe exercise mapping vs rendered subtitle; session start request outcome vs resume counts. No root cause or fix claimed. Prioritize reproducing this exact selected-recipe/start path before changing behavior.

## Controlled live reproduction
Owner explicitly authorized reload and saved Translation Play. Existing Chrome Nikolai tab reused.
1. Reload shows Preparing training; final overview restores Main training Idiooms / Idioms · Direct, 5 per session and three saved rows.
2. One Start Translation click sends update_active_training_scope then start_training_session. All observed responses HTTP200.
3. Start uses definition-to-word, card_filter review, session size5, presentationMode word-in-context. Response: runStatus active, requestedTotal5, plannedTotal0, plannedNew0, plannedReview0, plannedPractice0. get_next_training_session_card returns[]. No grade submitted.
4. Overview becomes Current training Translation / Words · Reverse / 0 done / 0 remaining / disabled Continue; four saved rows including Idiooms. No evidence of duplicated persisted recipe.
5. Reload again shows Preparing training and restores Main training Idiooms with three saved rows. Thus owner symptom reproduced twice across reloads and once through controlled Play.

Discriminated findings: click is delivered and request succeeds; empty planning is server-returned, not missing click. Recipe requests reviews only; whether zero eligible reviews is correct remains unverified. UI empty-session handling and contextual presentation label are inconsistent. Persisted main training versus transient current run restoration must be distinguished before deciding whether Play should change the main-training preference. No root-cause fix or grading/settings mutation performed.
