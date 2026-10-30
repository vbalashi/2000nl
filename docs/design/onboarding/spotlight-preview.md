# Action-led spotlight onboarding — current direction

2026-10-30 · #9 · visual sample for owner review; full flow not implemented.

Owner clarified that onboarding must dim the surrounding real interface,
highlight the control to use, and explain the concept in a nearby popover.
The learner clicks the real control; the next step follows the resulting screen
or acknowledged save. A separate training simulation with inline help is not the
desired format. The earlier standalone HTML concept is superseded.

## First actions: language choices

The owner explicitly requested these among the first actions, **before the ready
training walkthrough**:

1. Open Settings → Languages and highlight **Interface language**. Draft: “На
   каком языке показывать приложение и подсказки? Выберите язык интерфейса”.
   Show the saved/detected current choice and allow confirming it unchanged.
   Subsequent guidance must immediately use the chosen interface language.
2. Highlight **Translation language**. Draft: “На какой язык переводить значения
   и примеры? Язык перевода может отличаться от языка интерфейса”. Allow the
   existing Off choice; explain rather than force the use of translations.
   Advance after the actual preference save succeeds; retain choice and retry
   on error. Do not promise optional provider availability.
3. Point out **Additional translation language** briefly: “Если понадобится,
   здесь можно добавить второй язык перевода. Это можно сделать позже”. Do not
   require choosing a second language or expanding its picker now.

This uses existing auto-saving language controls. Do not invent a Save button
where the actual screen auto-saves. A small proposed confirmation to continue
can accept the current values without generating redundant writes. The tour must
not change the learning language when changing the interface language. Return to
the ready primary training after this language segment.

The language segment is now a requirement for the full scenario, but is **not
included in the two-step visual sample**. These labels/copy and exact grouping
still need owner review; no new mandatory language wizard has been accepted.

## Visual sample

Local preview: `http://localhost:3100/dev/onboarding-preview`.
It is available only in development with `ONBOARDING_PREVIEW_9=true`; production
returns not found. It has no account identity, credentials or database connection.

Actual shared application components: AppFrame, TrainingOverview and
TrainingSenseCardStage. Saved training metadata/counts and card content are
synthetic demonstration fixtures; this does not validate #8's real seeding.
The preview uses installed React Joyride 3.2.0, without adding dependencies.

1. **Ready training:** highlight the real Start button. “Начнём с готовой
   тренировки. В Dilum NL уже выбран материал словаря Dilum Nederlands.
   Настройки можно изменить позже. Нажмите «Начать тренировку»”. Clicking Start
   switches the rendered application components to the card.
2. **Card front:** highlight the real Show answer button. “Вспомните значение.
   Сначала подумайте, что значит слово. Затем откройте ответ — там будут значение
   и пример”. Clicking it invokes the real card's reveal handler; guidance ends
   at the answer. Learn does not write progress in this sample.

There is no simulated Next button. Close dismisses guidance; replay returns to
the first sample screen. The Settings gear replays this sample as a temporary
demonstration shortcut; it does not pretend to be the final Help/Settings UI.
Other navigation/editor actions explain the sample's scope rather than opening
unimplemented screens. Only the two highlighted interactions are under review.

![First step, desktop](evidence/12-spotlight-start-desktop.jpg)

![Second step, desktop](evidence/13-spotlight-card-desktop.jpg)

![First step, mobile](evidence/14-spotlight-start-mobile.jpg)

![Second step, mobile](evidence/15-spotlight-card-mobile.jpg)

## Library choice

Recommended for this app: **React Joyride**. Its React integration is already
installed; it supports a spotlight, custom popover, clickable target and controlled
steps. The old tour's broken wiring/targets do not demonstrate a library defect.
This sample proves click-through across the first two rendered screens.

- [Joyride interaction options](https://react-joyride.com/docs/props/options)
  and [events](https://react-joyride.com/docs/events).
- [Driver.js](https://driverjs.com/) is a reasonable framework-independent
  alternative with highlights, popovers and interaction hooks.
- [Shepherd](https://www.shepherdjs.dev/) is another alternative with keyboard
  navigation, focus management and framework integrations.

None decides what a dictionary means, selects the user's language, acknowledges
a save, or provides account persistence automatically. Those are application
responsibilities. Full focus management, mobile/zoom and missing-target recovery
must be tested before treating any library as accepted for rollout.

## Full route still to design

Languages → ready primary saved training (#8) → card/reveal → meaning/example/
Learn → Library → choose a meaning → collection membership/create/name → choose
collection as material of a separate training → save/name → return/start.
The owner is still reading/reviewing this route. Decide whether collection and
training creation are an optional continuation; do not call the route approved.

Legacy cleanup should remove obsolete wiring/targets/copy but **retain Joyride
if this library decision is accepted**. Preserve the live language behavior and
stored legacy flags. The earlier audit's dependency-removal recommendation was
conditional on discarding the library; the new visual sample supersedes that part.

## Checks for this sample

UI typecheck and lint of the two preview components passed. Browser checks at
1280×900 and 390×844: actual Start click advances, Show answer click/Enter reveals
the actual card answer, close removes the overlay, and replay returns to the
start. Both mobile popovers and highlighted controls fit; the card's word remains
visible above the second popover. Focus trapping is disabled in this action-led
sample so the actual controls are keyboard reachable; the final tour still needs
a dedicated focus/announcement design. No account persistence or new-user trigger
is implemented. The preview server is left running for the owner's review.
