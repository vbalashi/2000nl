Frontend Engineer

“Implement Training UI & Supabase integration (Next.js + Tailwind)”

1. Context

We have a static HTML prototype of the main training screen showing:

a big card with the current word / definition,

action buttons (“Onthouden / Vergeten / Bevriezen / Niet meer tonen”),

a right sidebar with “Recent Opgezocht” entries,

a footer with stats and a mode toggle.

code

Backend/data engineer will provide:

a Postgres schema on Supabase with:

languages, word_entries, word_lists, word_list_items,

later: user_word_status, user_events,

the NT2 word list imported as data.

Your job is to:

turn the prototype into a working React UI,

connect it to Supabase,

implement the basic training flow,

and introduce a minimal automated test setup.

2. Goal

Deliver a working web app (desktop-first) where:

A logged-in user can:

start training on the Dutch NT2 list,

see words/definitions one by one,

mark them as remembered/forgotten/frozen/hidden,

click words in definitions to see their dictionary entry in the right-hand panel,

All actions are persisted to Supabase in simple tables so we can later plug in spaced repetition logic.

3. Requirements
   3.1. Tech stack

Next.js 14 (App Router).

TypeScript.

TailwindCSS (design is already Tailwind-friendly).

State management: simple React state or Zustand (your call, but keep it clean).

Supabase JS client for DB + Auth.

3.2. Authentication

Use Supabase Auth (email+password or magic link).

For now, a very simple auth flow is enough:

a “Sign in” / “Sign up” screen,

once logged in, redirect to main training view,

user.id must be available in the app to attach events.

3.3. Main training screen

Based on the HTML prototype (

code

):

Layout

Left: training card + buttons.

Right: dictionary / “Recent Opgezocht”.

Footer: stats + mode toggle + hotkey help.

Training card

Fetch words from Supabase (NT2 list) in some simple order (e.g. by rank).

Initially we only support two modes:

mode A: show word → user guesses definition,

mode B: show definition → user guesses word.

Implement the footer toggle to switch modes (UI only; keep both modes in state).

Inside the example sentence and definition, all words that are marked as links in the data should be clickable.

On click:

query Supabase for that word’s full dictionary entry,

show it in the right panel and push it to a “recent” list.

Buttons + hotkeys

Buttons:

Onthouden (Space) → mark success.

Vergeten (N) → mark failure.

Bevriezen (F) → mark frozen until tomorrow.

Niet meer tonen (X) → hide this word.

Hotkeys:

Space, N, F, X for actions above.

? — open a small dialog with hotkey help.

Later (not mandatory in first iteration): Alt+← / Alt+→ for navigation in the dictionary history.

Each button must show its hotkey in the label.

Persistence

For now, we don’t need full spaced repetition; we only need to record events and basic status.

Please create and use (together with us / BE dev) two additional tables in Supabase:

user_word_status (per user, per word, per mode)

fields (simplified for now):

user_id, word_id, mode, seen_count, success_count, last_seen_at, last_result, hidden, frozen_until.

On every button press:

increment seen_count,

update success_count and last_result,

set hidden / frozen_until if relevant.

user_events

fields (simplified): user_id, word_id, mode, event_type, created_at.

For each review and word click, insert a row:

review_success, review_fail, freeze, hide, definition_click.

Next word selection

Very simple for now:

fetch next word from NT2 list where:

not hidden,

not frozen,

in ascending rank, or random among a small batch.

Keep this logic simple but cleanly separated so we can later plug in a spaced-repetition scheduler without rewriting the UI.

3.4. Dictionary sidebar (“Recent Opgezocht”)

For each clicked word:

fetch its headword + one-line definition from Supabase,

show it as a card in the sidebar (last N = e.g. 10 items),

clicking a card should re-open that entry in the main right panel.

Use Supabase for all reads; do not rely on local JSON.

3.5. Footer stats

Show:

“Vandaag: X” — number of words the user has reviewed today (at least once).

“Totaal: Y / 2000” — number of NT2 words the user has ever reviewed successfully at least once.

Implement as lightweight Supabase queries (we can optimize later if needed).

3.6. Tests

We want a basic but real test setup:

Component tests with React Testing Library:

Training card renders word & definition.

Hotkeys trigger the same handlers as button clicks.

Integration/e2e (Cypress or Playwright, your choice):

Mock Supabase or use a test project.

Flow:

Login with test user.

See first word.

Press Space → word changes.

Click a word in the definition → sidebar shows dictionary entry.

Provide npm scripts:

npm test

npm run test:e2e (if separate)

Include a README section explaining how to:

configure Supabase keys (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY),

run the dev server (npm run dev),

run tests.
