import {fresh as priorFresh} from "./regressionCases";
/** Synthetic source relations, frozen before model calls. */
export const cases = [
 ["heat-temp","heet","bn","met een zeer hoge temperatuur","","","degree",["warm"],["koud"]],
 ["heat-spicy","heet","bn","met een sterke smaak van peper","","","sense",["pikant"],["mild"]],
 ["light-weight","licht","bn","met weinig gewicht","","","sense",["lichtgewicht"],["zwaar"]],
 ["light-bright","licht","bn","met veel licht; niet donker","","","sense",["helder"],["donker"]],
 ["bank-seat","bank","zn","een lang meubel waarop mensen zitten","","","sense",["zitbank","sofa"],[]],
 ["bank-money","bank","zn","een instelling die geld bewaart en uitleent","","","sense",["geldinstelling"],[]],
 ["poor","arm","bn","met weinig geld","","","degree",["behoeftig"],["rijk"]],
 ["old-age","oud","bn","met een hoge leeftijd","","","sense",["bejaard"],["jong"]],
 ["old-object","oud","bn","al lang gebruikt en niet meer nieuw","","","sense",["versleten"],["nieuw"]],
 ["free-liberty","vrij","bn","niet gevangen of onder dwang","","","sense",["onafhankelijk"],["gevangen"]],
 ["free-available","vrij","bn","beschikbaar; niet in gebruik","","","sense",["beschikbaar"],["bezet"]],
 ["give","geven","ww","iets aan iemand overhandigen","","","direction",["schenken"],["ontvangen"]],
 ["borrow","lenen","ww","iets van iemand tijdelijk krijgen en later teruggeven","","","direction",["in bruikleen nemen"],["uitlenen"]],
 ["smart","slim","bn","snel begrijpen en goed nadenken","","","sense",["verstandig"],["dom"]],
 ["capable","knap","bn","goed in het uitvoeren van een taak","","","sense",["bekwaam"],["onbekwaam"]],
 ["cat","kat","zn","een huisdier","de kat uit de boom kijken","eerst afwachten hoe een situatie zich ontwikkelt","regression",["de poes"],[]],
] as const;
export const heldOut=priorFresh;
export const fresh=priorFresh;
