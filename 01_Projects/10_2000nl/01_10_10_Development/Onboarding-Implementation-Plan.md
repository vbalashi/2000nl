# Onboarding Implementation Plan (Sprint 10)

## Executive summary
Deze onboarding kan in 7-8 story points worden geïmplementeerd met een lichtgewicht tour library en een paar gerichte UI-targets. De flow is kort (6 stappen), mobielvriendelijk en laat de kernlus zien: kaart → onthullen → beoordelen → voortgang terugzien → instellingen/zoeken.

## UX flow (max 6 stappen)
**Doel:** nieuwe gebruikers binnen 60–90 seconden zelfstandig laten oefenen.

1. **Welkom** (center modal)
   - Legt in 1 zin de waarde uit + wat je hier gaat doen.
2. **Kaart & onthullen** (target: kaart)
   - Klik/tap op de kaart of druk `Spatie` om het antwoord te onthullen.
3. **Beoordelen** (target: actieknoppen / swipe)
   - Kies Moeilijk/Goed/Makkelijk of swipe links/rechts.
4. **Audio & vertaling** (target: kaart-toolbar)
   - Audio aan/uit en vertaling toggles (na onthullen).
5. **Recent/Details** (target: sidebar toggle of sidebar)
   - Bekijk recente woorden en details, pin de sidebar op desktop.
6. **Zoeken & instellingen** (target: zoekknop en instellingen)
   - Zoek een woord of pas thema/taal/woordlijst aan.

## Step copy (volledige tekst)
**Stap 1 – Welkom**
- Titel: “Welkom bij 2000NL”
- Tekst: “Hier oefen je de 2000 belangrijkste Nederlandse woorden. In 60 seconden leer je de basis.”
- Buttons: “Start” / “Overslaan”

**Stap 2 – Kaart & onthullen**
- Titel: “Onthul het antwoord”
- Tekst: “Klik of tik op de kaart (of druk Spatie) om het antwoord te zien.”
- Button: “Volgende”

**Stap 3 – Beoordelen**
- Titel: “Kies je beoordeling”
- Tekst: “Moeilijk = vaker terug, Goed = normaal, Makkelijk = later. Je kunt ook swipen.”
- Button: “Volgende”

**Stap 4 – Audio & vertaling**
- Titel: “Luister en vertaal”
- Tekst: “Zet audio aan om uitspraak te horen. Vertaling verschijnt na onthullen.”
- Button: “Volgende”

**Stap 5 – Recent & details**
- Titel: “Bekijk je historie”
- Tekst: “Open Recent om je laatste woorden te zien. Open Details voor extra info.”
- Button: “Volgende”

**Stap 6 – Zoeken & instellingen**
- Titel: “Pas alles aan”
- Tekst: “Zoek een woord of open Instellingen om thema, taal en woordlijst te wijzigen.”
- Button: “Klaar”

## Onboarding library evaluation
**React Joyride**
- Pros: React-first API, declaratieve steps, eenvoudige integratie.
- Cons: Afhankelijk van react-floater; minder flexibel dan custom.

**Shepherd.js**
- Pros: Zeer flexibel, nette overlays en scroll-to ondersteuning.
- Cons: Vanilla-first, React wrapper benodigd.

**Intro.js**
- Pros: Lichtgewicht, eenvoudige data-attribute flow.
- Cons: AGPL/commerciële licentie nodig voor commerciële apps.

**Custom modal flow**
- Pros: Volledige controle, minimaal gewicht.
- Cons: Meer werk (focus traps, scroll, positioning, edge cases).

## Geselecteerde library
**React Joyride**
- Reden: React-friendly, snel te implementeren, voldoende features voor 6 stappen. Geen licentierisico (MIT).

## Technical approach
1. **Tour targets toevoegen**
   - Voeg `data-onboarding` of `data-tour` attributes toe aan:
     - Kaartcontainer
     - Actieknoppen
     - Audio/vertaling toolbar
     - Sidebar toggle of sidebar
     - Zoekknop
     - Instellingenknop
2. **Onboarding state**
   - `localStorage` key: `onboarding_completed`.
   - Start tour bij eerste login wanneer key ontbreekt.
   - Voeg “Reset tutorial” knop in **Instellingen** tab.
3. **Rendering**
   - Render Joyride in `TrainingScreen` (client component).
   - Stappenarray met target selectors en copy.
4. **Mobile vs desktop**
   - Desktop: highlight sidebar + hotkeys only if zichtbaar.
   - Mobile: highlight sidebar toggle i.p.v. pinned sidebar.
   - Hide steps whose targets are missing (`Joyride` supports `disableOverlayClose` + `spotlightClicks`).

## Implementation plan (Sprint 10)
**Phase 1 – Prep (1 point)**
- Add data attributes for tour targets in `TrainingScreen` and `TrainingCard`.

**Phase 2 – Onboarding flow (3 points)**
- Joyride setup + step definitions + run logic.
- LocalStorage integration.

**Phase 3 – Settings integration (1 point)**
- Add “Reset tutorial” entry in Settings modal.

**Phase 4 – Polish & QA (2-3 points)**
- Mobile check, missing-target handling, copy tweaks.

## Story points estimate
**Total: 7–8 points**

## Risks & blockers
- Tour overlays must not block core card clicks or swipe gestures.
- Targets hidden by responsive layout need step skipping logic.
- Translation/audio step should only show after reveal; may need “wait for reveal” guard.

## Sprint 10 ready-to-implement checklist
- [ ] Library added to `apps/ui` dependencies
- [ ] Onboarding steps and copy approved
- [ ] Targets annotated in UI
- [ ] LocalStorage flag logic implemented
- [ ] Reset tutorial action in Settings
- [ ] Mobile/desktop coverage verified
