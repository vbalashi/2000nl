// Authored English translations for the goed design demo; no provider calls.
import type {LibrarySenseContent} from "@/components/training/library-v2/librarySenseCardModel";
const translations:Record<string,string>={
  "de dingen; de voorwerpen": "things; objects",
  "de goederen worden vervoerd per schip": "The goods are transported by ship.",
  "dat wat goed is": "that which is good",
  "zij heeft veel goed gedaan voor de stad": "She has done a lot of good for the city.",
  "iets komt ten goede aan iemand of iets": "something benefits someone or something",
  "iets is bestemd voor iemand of iets; iets is gunstig voor iemand of iets": "Something is intended for someone or something; it has a beneficial effect on them.",
  "het geld dat we met deze actie verdienen, komt ten goede aan de slachtoffers van de brand": "The money we raise through this campaign will benefit the victims of the fire.",
  "de stof; de kleren": "fabric; clothes",
  "het vuile goed kun je in de machine doen": "You can put the dirty laundry in the washing machine.",
  "heel; erg": "very; extremely",
  "het kind is goed verkouden": "The child has a bad cold.",
  "iets wat goed is, heeft een hoge kwaliteit": "Something that is good is of high quality.",
  "Ruud is een goede leraar": "Ruud is a good teacher.",
  "heb je een goede vakantie gehad?": "Did you have a good holiday?",
  "iets valt in goede aarde": "something is well received",
  "iets wordt gewaardeerd": "Something is appreciated.",
  "het voorstel om wat vroeger naar huis te gaan, viel bij iedereen in goede aarde": "The suggestion to go home a little earlier was welcomed by everyone.",
  "alles goed?": "How are you?",
  "dit zeg je als je wilt weten hoe het met iemand gaat": "You say this when you want to know how someone is doing.",
  "iets wat goed is, is juist of klopt": "Something that is good is correct or right.",
  "ze gaf het goede antwoord": "She gave the correct answer.",
  "alles goed en wel, maar …": "all well and good, but …",
  "dat kan wel zo zijn, maar …": "That may be so, but …",
  "zo goed als …": "almost …",
  "vrijwel helemaal": "almost completely",
  "die schoenen zijn nog zo goed als nieuw": "Those shoes are still as good as new.",
  "zo goed en zo kwaad als het gaat": "as best one can",
  "zo goed als in de situatie mogelijk is": "As well as the situation allows.",
  "iets wat goed is, is geschikt voor het doel": "Something that is good is suitable for its purpose.",
  "het is goed om veel fruit te eten": "It is good to eat plenty of fruit.",
  "dit lijkt me een goed moment om iets te eten": "This seems like a good time to have something to eat."
};
export function withDemoTranslation(node:LibrarySenseContent):LibrarySenseContent {
  return {...node,translation:translations[node.text]??node.translation,children:node.children.map(withDemoTranslation)};
}
export const demoEntryTranslations=[
  [["goods","possessions"],["good"],["laundry","clothes"]],
  [["very","quite"]],
  [["good"],["right","correct"],["suitable","good"]],
];

export const demoWordTranslations:Record<string,string>={alleen:"alone",belangrijk:"important",begrijpen:"understand",beslissen:"decide",eindelijk:"finally",gemeente:"municipality",herinneren:"remember",misschien:"perhaps",verantwoordelijkheid:"responsibility",waarschijnlijk:"probable"};
