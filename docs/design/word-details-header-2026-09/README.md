# Word Details header contract

Owner: [#271](https://github.com/vbalashi/2000nl/issues/271), within #84.
This is the implementation contract for the header only. It does not decide
idiom typography (#272), the surrounding app frame (#264), morphology (#70),
or the rest of Word Details.

## Visual source and override

- Pen `30.50.02` supplies the Word Details action order: Translate, Audio,
  then More in the parent Library surface.
- Pen component `10.32.01` supplies the reusable card, 40 px actions, 20 px
  icons, 16 px radius and existing header padding.
- The 7 September product decision and #271 supersede one detail in that
  component: within an already-open Details view, Translate and Audio share the
  upper row; Audio is not attached to the headword and recursive More is absent.
- The 12 px row-to-headword interval is the reviewed implementation value for
  this slice. It was not present as a Pen measurement before #271.

## Annotated structure

```text
mobile < 640 px: 16 px inset                    ≥ 640 px: 28 px inset

┌──────────────── shared header row ──────────────────────────────┐
│ ● part of speech   2K          12 px min   [Translate] 8 [Audio] │ 40 px min
└──────────────────────────────────────────────────────────────────┘
                              ↕ 12 px
  article  headword — one baseline; no Audio/More inside this row
                              ↕ 20 px
  first meaning / scroll region
```

Localized metadata may wrap at 320 px. The complete row then grows vertically;
the fixed 12 px interval starts below it, so actions never cover the word.

## Values

| Part | Contract |
| --- | --- |
| Header padding | 16 top / 16 horizontal / 20 bottom below 640 px; 28 horizontal from 640 px |
| Metadata/action row | minimum height 40 px; minimum gap 12 px; metadata may wrap |
| Action order | Translate, Audio; no More inside Details |
| Action target | 40 × 40 px; radius 16 px; icon 20 × 20 px |
| Action gap | 8 px |
| Row → headword | 12 px after the actual row bottom |
| Regular headword | Normal 44 px; Large 46 px; Largest 48 px |
| Long headword < 640 px | Normal 32 px; Large 34 px; Largest 36 px |
| Long headword ≥ 640 px | Normal 40 px; Large 42 px; Largest 44 px |

## Required state matrix

| Width | Short | Long | Normal | Largest | Light | Dark | Library | Training More |
| ---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 320 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 390 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 1440 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

The browser check keeps reading size and theme independent instead of treating
Normal as light and Largest as dark. It asserts one shared action row, exact
button order and geometry, a headword below the row, no horizontal overflow,
and the #268 rule that Training More does not inherit Library footer actions.

## Representative renders

- [320 · short · Normal · light](assets/320-short-normal-light.png)
- [390 · long · Largest · dark](assets/390-long-largest-dark.png)
- [1440 · long · Largest · light](assets/1440-long-largest-light.png)
