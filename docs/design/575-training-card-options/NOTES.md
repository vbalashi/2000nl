# THROWAWAY Training layout exploration

Question: fixed selected recipe hero no taller than halfviewport (preferthird),100 independent scrolling saved recipes,3 availabilitymetrics, Load preservinglistposition, no visible scrollbar, themed gradientchevron, animated pendingcounts, noSaved case.

A retains spacious stackedhierarchy; B desktop putsactionbeside title/metrics, mobilecompactstack; C compresses desktopmetrics intoinlineband, mobileminimalstack. All use existing app theme. Screenshots captured in fullapplication with authenticated deterministic fixture; numbers illustrative, no livecountsclaim. Height390×844 A244px/B229px/C198px. Desktop1280×900 A269px/B194px/C140px. Hero position/size unchanged afterscrollto34 andLoad; independent listscroll verified. Reducedmotion wave disabled.

Open comparison.html or prototype.html. Standalone interactiveexport uses matching layoutCSS but systemArial/Georgia instead of bundledappfonts; appcaptures are typographyreference. Click Load34: listscroll preserved, counters wave for1.1s, titleupdates, no backend/persistence.100mock saved, emptytoggle, darkpreviewtoggle, A/B/C URLvariant switch. Footer switcher is prototypecontrols, not productiondesign.

Runtime demo source retained under source/; temporary mount in AccountTrainingOverview was removed aftercaptures, no prototype ships in production. Open with: `open docs/design/575-training-card-options/comparison.html`. Or serve thisfolder on a freepreviewport. Delete losing variants/source afterdecision; incorporate chosen design properly into productioncomponents.

Owner selected A. B and C remain historical comparison artifacts. NoSaved state retains heroand shows shortcreateprompt, no blank fake rows.

## Owner iteration: A selected, animations and editing explored

Added prototypecontrols for3loadingstyles: shimmer/softpulse/movingline, allfadein230ms andreducedmotion. Pendingduration350/1100/1800ms.3editoractionlayouts: headeroverflow Saveas/Delete; splitUpdate+copydropdown; secondarySaveas besideUpdate withDeleteiconheader.3selectionicons, directeditingfromSavedlist. Update name keepssameid/100rows; explicitSaveas generatesnewid/101rows. Browserverified3animations/3layouts, rename/copy andLoad33scrollpreservation. This remainsinmemorymock; no backendwrites.

Owner selected softpulse+fade; set as default, with splitUpdate default. Added four relatedpanelicons: original, separatorless/thinner/muted, open top, separatorless withoutbuttonborder. Allretain36px hitarea andfullopacityfocus/hover. Compare in prototypecontrols inline, clickswaps listiconwithoutlosingscroll.

More icon exploration: edit restored3horizontal lines+2verticalticks (previous mock accidentallyonly2lines). Selection choices now10:4panelvariations plusfolder/cards/enter/eye/lift/listselect. Inlinegrid5×2, dropdownsemanticlabels, controls scroll onsmallviewport. Browserverifiedall6newSVGchoices. No productionchanges.

Owner refinement: all edit/selection glyphs16px (from18px), no buttonbackground/border includinghover/selected, mutedthemeforeground82%opacity.36pxhitareas preserved, hover fullopacity andkeyboardfocusoutline. Samples use samequietglyphstyle.


## Approved implementation scope (2026-10-03)

Implement variant A only; preserve unrelated visual surfaces.

- Fixed selected recipe above independently scrolling Saved Trainings. Hero roughly one third, at most half a normal viewport. No scrollbar; themed gradient/chevron. All saved recipes stay listed. Selecting retains scroll position.
- Row Load/select icon1: panel with internal line. Direct Edit remains.16px muted glyphs, no background,36px hit area. Edit: three lines/two ticks.
- Hero: due today, total introduced reviews, currently eligible new cards. Authoritative eligibility applies; session limit and new/review choice do not truncate category counts. Started sessions show completed/remaining instead. Session limit appears in metadata.
- One read-only combined request for the selected recipe. Soft breathing placeholders,230ms reveal, reduced-motion support, stale-response rejection and scoped cache; no polling or100-recipe fanout.
- Different Load abandons old queue but retains accepted grades; same Load retains resume. Selection persists. Start remains a separate hero action.
- Full-screen Session Builder stays. Inline name; Update preservesid and opens no naming dialog. Explicit Save as new under arrow beside Update asks a new name. Trash left of Update, preserving deletion confirmation. Remove duplicate Adjust text action.
- Zero due: Repeat early if eligible introduced cards exist, existing FSRS grading; otherwise offer editing rather than empty launch. No expanding status paragraph.
- Theme existing failure presentation; prior production load failure root cause remains open until failed-request evidence establishes it.

Verify family eligibility, rapid selection, cache owner/day/revision isolation, rename/copy identity, resume replacement,100saved/no saved, mobile/desktop, keyboard and reduced motion. Earlier simplified-query benchmarks establish feasibility only; measure the final endpoint separately.
