export type Case = readonly [id:string,headword:string,pos:string,definition:string,idiom:string,explanation:string,category:string];
export const cases:Case[]=[
 ["cat","kat","zn","een huisdier","de kat uit de boom kijken","eerst afwachten hoe een situatie zich ontwikkelt","ambiguous-image"],
 ["cow","koe","zn","een volwassen vrouwelijk rund","over koetjes en kalfjes praten","vriendelijk praten over onbelangrijke dingen","useful-image"],
 ["monkey","aap","zn","een dier dat vaak goed kan klimmen","de aap komt uit de mouw","de verborgen bedoeling wordt duidelijk","direction"],
 ["butter","boter","zn","een vet product dat van melk wordt gemaakt","boter op het hoofd hebben","zelf ook schuldig zijn aan wat men een ander verwijt","location"],
 ["door","deur","zn","een beweegbaar deel waarmee een ingang wordt afgesloten","met de deur in huis vallen","zonder inleiding meteen zeggen waarvoor men komt","participants"],
 ["hare","haas","zn","een dier met lange oren en lange achterpoten","het hazenpad kiezen","snel wegvluchten","useful-image"],
 ["cheese","kaas","zn","voedsel dat uit melk wordt gemaakt","iemand de kaas van het brood eten","iemand zijn voordeel of kans afnemen","ownership"],
 ["nose","neus","zn","het deel van het gezicht waarmee men ruikt","met zijn neus in de boter vallen","onverwacht in een gunstige situatie terechtkomen","location"],
 ["lamp","lamp","zn","een voorwerp dat licht geeft","tegen de lamp lopen","betrapt worden terwijl men iets verkeerds doet","natural-restriction"],
 ["boat","boot","zn","een vaartuig","buiten de boot vallen","niet mogen meedoen of niet in aanmerking komen","outside-not-out"],
 ["rose","roos","zn","een bloem met vaak een sterke geur","op rozen zitten","in een heel gunstige positie verkeren","action"],
 ["leg","been","zn","een lichaamsdeel waarop men staat en loopt","met het verkeerde been uit bed stappen","vanaf het begin van de dag slechtgehumeurd zijn","body-and-direction"],
 ["horse","paard","zn","een groot dier waarop men kan rijden","het paard achter de wagen spannen","de dingen in de verkeerde volgorde doen","shared-image"],
 ["ice","ijs","zn","bevroren water","het ijs breken","de eerste spanning tussen mensen wegnemen","shared-image"],
 ["thanks","bedanken","ww","zeggen dat men dankbaar is","van harte bedankt","iemand oprecht bedanken","social-formula"],
 ["luck","succes","zn","een gunstig resultaat","veel succes","iemand een goede afloop wensen","social-formula"],
 ["welcome","welkom","bn","graag ontvangen","van harte welkom","iemand hartelijk begroeten bij aankomst","social-formula"],
 ["coffee","koffie","zn","een warme drank van gemalen koffiebonen","een kopje koffie drinken","een kleine hoeveelheid koffie drinken","transparent"],
 ["anger","boos","bn","geërgerd omdat iets niet eerlijk is","","","primary-regression"],
 ["poor","arm","bn","met weinig geld","","","primary-regression"],
];
// Frozen before the first model call; use only baseline and the selected candidate.
export const heldOut:Case[]=[
 ["flowers","bloem","zn","het gekleurde deel van een plant","de bloemetjes buiten zetten","uitbundig feestvieren","useful-image"],
 ["hair","haar","zn","een dun draadje dat op de huid groeit","met de handen in het haar zitten","niet weten hoe men een probleem moet oplossen","participants"],
 ["molehill","mug","zn","een klein insect dat kan steken","van een mug een olifant maken","een klein probleem veel groter voorstellen dan het is","transformation"],
 ["quay","wal","zn","de vaste oever naast het water","tussen wal en schip vallen","nergens bij horen en daardoor geen hulp krijgen","location"],
 ["wire","draad","zn","een lang dun stuk materiaal","de draad kwijtraken","niet meer weten hoe een verhaal of gedachte verdergaat","action"],
 ["spoon","lepel","zn","een voorwerp waarmee men vloeibaar eten naar de mond brengt","iets met de paplepel ingegoten krijgen","iets al vanaf de vroege jeugd leren","passive-participants"],
 ["stone","steen","zn","een hard stuk natuurlijk materiaal","twee vliegen in één klap slaan","met één handeling twee doelen bereiken","shared-target-dependent"],
 ["rain","regen","zn","water dat in druppels uit de lucht valt","van de regen in de drup komen","van een moeilijke situatie in een nog slechtere terechtkomen","direction"],
 ["oil","olie","zn","een vettige vloeistof","olie op het vuur gooien","een conflict nog erger maken","shared-image"],
 ["birthday","verjaardag","zn","de jaarlijkse herdenking van iemands geboortedag","van harte gefeliciteerd","iemand oprecht gelukwensen","social-formula"],
 ["water","water","zn","een heldere vloeistof","een glas water drinken","water uit een glas drinken","transparent"],
 ["heavy","zwaar","bn","met veel gewicht","","","primary-regression"],
];
export const fresh=heldOut;
export const rubric={
 serious:"Wrong image objects, participants, ownership, action/direction, invented source action, lost natural-meaning restriction, wrong primary sense; failed/incomplete output is separately a delivery failure.",
 minor:"Unhelpful duplicate literal, unnatural grammatical rendering, avoidable loss of a useful clear image, unnecessary or wrong-intensity alternative.",
 literalCoverage:"Clearly useful image: cow, monkey, butter, door, hare, cheese, nose, lamp, boat, rose; held-out flowers, hair, molehill, quay, wire, spoon, rain. Do not select a candidate merely for returning null everywhere.",
 optional:"cat and leg may be omitted if source grammar cannot be rendered confidently; preserve out-of/from-tree rather than observer in tree or cat simply on tree. Shared-target images judged against natural translation, not a fixed literal quota.",
 omission:"No literal for social formulas or transparent source phrases. Established natural idioms with an effectively shared image normally need no duplicate line.",
 natural:"Natural meaning must stand alone and preserve explanation participants, conditions, degree and direction; headword primary/alternatives remain exact-sense.",
 method:"agent review, nonblind; descriptive comparison only, no human approval or statistical superiority claim",
 gate:"Select development candidate by fewer serious errors with no increase in natural/primary errors, then minor errors and retained helpful-image coverage. Confirm on frozen held-out against baseline before any production change. Tie or unresolved tradeoff retains v8/high.",
};
