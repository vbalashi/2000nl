#!/usr/bin/env python3
"""Generate small, source-managed dictionaries for local multilingual QA.

The payload deliberately follows the current VanDale-shaped entry contract:
metadata, morphology, definitions, examples, idioms, and source identity are
all present in the JSON artifacts.  The content is synthetic and must not be
presented as an export from the named reference dictionaries.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
ARTIFACT_FORMAT_VERSION = "dictionary-fixture-v1"
IDENTITY_SCHEME_VERSION = "local-complete-fixture-v1"


def _meaning(
    definition: str,
    context: str,
    example: str,
    idiom: tuple[str, str, str],
    *,
    synonyms: list[str],
    antonyms: list[str],
    related_terms: list[str],
    usage_labels: list[str],
    grammar: dict[str, str],
    note: str,
) -> dict[str, Any]:
    return {
        "definition": definition,
        "context": context,
        "examples": [example],
        "idioms": [
            {
                "expression": idiom[0],
                "explanation": idiom[1],
                "examples": [idiom[2]],
            }
        ],
        "synonyms": synonyms,
        "antonyms": antonyms,
        "related_terms": related_terms,
        "usage_labels": usage_labels,
        "grammar": grammar,
        "note": note,
        "cross_references": [],
    }


def _entry(
    *,
    language: str,
    dictionary_slug: str,
    dictionary_name: str,
    index: int,
    filename: str,
    headword: str,
    pos: str,
    definition: str,
    context: str,
    example: str,
    idiom: tuple[str, str, str],
    gender: str = "",
    plural: str = "",
    diminutive: str = "",
    verb_forms: str = "",
    conjugation: dict[str, Any] | None = None,
    comparative: str = "",
    superlative: str = "",
    derivations: str = "",
    pronunciation: str | None = None,
    synonyms: list[str] | None = None,
    antonyms: list[str] | None = None,
    related_terms: list[str] | None = None,
    usage_labels: list[str] | None = None,
    grammar: dict[str, str] | None = None,
    note: str = "Synthetic local fixture entry for multilingual QA.",
) -> dict[str, Any]:
    pronunciation = pronunciation or headword
    source_key = f"{IDENTITY_SCHEME_VERSION}:{dictionary_slug}:{index}"
    source_pos = {"ww": "verb", "zn": "noun", "bn": "adjective", "bw": "adverb"}.get(
        pos,
        pos,
    )
    payload: dict[str, Any] = {
        "headword": headword,
        "pronunciation": pronunciation,
        "pronunciation_with_stress": pronunciation,
        "gender": gender,
        "part_of_speech": pos,
        "plural": plural,
        "diminutive": diminutive,
        "verb_forms": verb_forms,
        "conjugation_table": conjugation,
        "inflected_form": "",
        "comparative": comparative,
        "superlative": superlative,
        "derivations": derivations,
        "alternate_headwords": [],
        "cross_reference": None,
        "is_nt2_2000": False,
        "meanings": [
            _meaning(
                definition,
                context,
                example,
                idiom,
                synonyms=synonyms or [],
                antonyms=antonyms or [],
                related_terms=related_terms or [],
                usage_labels=usage_labels or ["fixture"],
                grammar=grammar or {"part_of_speech": source_pos},
                note=note,
            )
        ],
        "audio_links": {},
        "images": [],
        "reference_tables": [],
        "_metadata": {
            "search_term": headword,
            "headword_raw": headword,
            "index": index,
            "dictionaryId": dictionary_slug,
            "dictionary_name": dictionary_name,
            "fixture": True,
        },
        "meaning_id": 1,
        "_source": {
            "identity_scheme_version": IDENTITY_SCHEME_VERSION,
            "identity_evidence": {
                "kind": "deterministic-local-complete-fixture",
                "dictionary_id": dictionary_slug,
                "provider_article_id": f"{dictionary_slug}:{index}",
            },
            "provider_article_id": f"{dictionary_slug}:{index}",
            "normalized_pos_status": "known",
            "pos_evidence": {
                "normalized_pos_status": "known",
                "source": "local-fixture",
                "raw_value": pos,
            },
            "source_group_key": source_key,
            "source_entry_key": source_key,
            "source_index": index,
            "sense_ordinal": 1,
        },
    }
    return {"filename": filename, "payload": payload}


def _verb_forms(
    present: dict[str, str],
    past: dict[str, str],
    auxiliary: str,
    participle: str,
) -> dict[str, Any]:
    return {"present": present, "past": past, "perfect": {"auxiliary": auxiliary, "participle": participle}}


def _dictionaries() -> list[dict[str, Any]]:
    return [
        {
            "language": "nl",
            "language_name": "Nederlands",
            "slug": "nl-wiktionary-test",
            "name": "Wiktionary-like NL Test (synthetic)",
            "list_slug": "nl-wiktionary-test-all",
            "list_name": "Wiktionary-like NL Test",
            "base_index": 97000,
            "entries": [
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97000, filename="huis_zn_1.json", headword="huis", pos="zn", gender="het", plural="huizen", diminutive="huisje", definition="Gebouw of woning waarin mensen wonen.", context="een gebouw", example="Ons huis staat aan het water.", idiom=("zich thuis voelen", "zich ergens comfortabel en welkom voelen", "In deze buurt voel ik mij meteen thuis."), synonyms=["woning"], related_terms=["kamer", "dak"], grammar={"article": "het"}),
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97001, filename="lopen_ww_1.json", headword="lopen", pos="ww", verb_forms="liep, heeft gelopen", conjugation=_verb_forms({"ik": "loop", "jij": "loopt", "hij_zij_het": "loopt", "wij": "lopen", "jullie": "lopen", "zij": "lopen"}, {"ik": "liep", "jij": "liep", "hij_zij_het": "liep", "wij": "liepen", "jullie": "liepen", "zij": "liepen"}, "heeft", "gelopen"), definition="Zich stap voor stap voortbewegen.", context="een persoon beweegt", example="Wij lopen elke ochtend naar school.", idiom=("de kantjes ervan aflopen", "zo weinig mogelijk moeite doen", "Hij loopt er de kantjes van af."), synonyms=["wandelen"], antonyms=["stilstaan"], related_terms=["wandeling"], grammar={"auxiliary": "hebben"}),
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97002, filename="vriend_zn_1.json", headword="vriend", pos="zn", gender="de", plural="vrienden", diminutive="vriendje", definition="Persoon met wie iemand een hechte band heeft.", context="een persoon", example="Mijn vriend woont in dezelfde straat.", idiom=("dikke vrienden zijn", "een goede relatie hebben", "De twee buren zijn dikke vrienden."), synonyms=["maat"], related_terms=["vriendschap"], grammar={"article": "de"}),
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97003, filename="leren_ww_1.json", headword="leren", pos="ww", verb_forms="leerde, heeft geleerd", conjugation=_verb_forms({"ik": "leer", "jij": "leert", "hij_zij_het": "leert", "wij": "leren", "jullie": "leren", "zij": "leren"}, {"ik": "leerde", "jij": "leerde", "hij_zij_het": "leerde", "wij": "leerden", "jullie": "leerden", "zij": "leerden"}, "heeft", "geleerd"), definition="Kennis of een vaardigheid verwerven.", context="studie en oefening", example="Ik leer iedere dag nieuwe woorden.", idiom=("met vallen en opstaan leren", "leren door fouten en ervaring", "Je leert het met vallen en opstaan."), synonyms=["studeren"], related_terms=["les", "kennis"], grammar={"auxiliary": "hebben"}),
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97004, filename="snel_bn_1.json", headword="snel", pos="bn", comparative="sneller", superlative="snelst", definition="Die in korte tijd beweegt of gebeurt.", context="tempo of snelheid", example="De snelle trein stopt maar één keer.", idiom=("zo snel als het licht", "bijzonder snel", "Hij rende zo snel als het licht."), synonyms=["vlug"], antonyms=["langzaam"], related_terms=["snelheid"], grammar={"attributive": "snelle"}),
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97005, filename="rustig_bn_1.json", headword="rustig", pos="bn", comparative="rustiger", superlative="rustigst", definition="Kalm en zonder veel beweging of lawaai.", context="een plaats of persoon", example="Het is vandaag rustig in de bibliotheek.", idiom=("op zijn gemak", "zonder haast of spanning", "Neem op je gemak een stoel."), synonyms=["kalm"], antonyms=["druk"], related_terms=["rust"], grammar={"attributive": "rustige"}),
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97006, filename="vaak_bw_1.json", headword="vaak", pos="bw", definition="Op veel momenten of bij veel gelegenheden.", context="frequentie", example="Zij fietst vaak naar haar werk.", idiom=("met de regelmaat van de klok", "heel regelmatig", "Hij komt met de regelmaat van de klok langs."), synonyms=["dikwijls"], antonyms=["zelden"], related_terms=["frequentie"], grammar={"degree": "neutral"}),
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97007, filename="buiten_bw_1.json", headword="buiten", pos="bw", definition="Niet binnen; aan de andere kant van een gebouw.", context="plaats", example="De kinderen spelen buiten.", idiom=("buiten de boot vallen", "niet mee kunnen doen", "Zonder kaart viel hij buiten de boot."), synonyms=["uit"], antonyms=["binnen"], related_terms=["buitenkant"], grammar={"degree": "neutral"}),
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97008, filename="sleutel_zn_1.json", headword="sleutel", pos="zn", gender="de", plural="sleutels", definition="Voorwerp waarmee een slot wordt geopend.", context="een klein voorwerp", example="De sleutel ligt naast de deur.", idiom=("de sleutel tot iets zijn", "iets mogelijk maken", "Oefening is de sleutel tot succes."), synonyms=["sluiter"], related_terms=["slot", "deur"], grammar={"article": "de"}),
                _entry(language="nl", dictionary_slug="nl-wiktionary-test", dictionary_name="Wiktionary-like NL Test (synthetic)", index=97009, filename="bank_zn_1.json", headword="bank", pos="zn", gender="de", plural="banken", definition="Lang zitmeubel voor meerdere personen.", context="meubel", example="De kat slaapt op de bank.", idiom=("op de bank zitten", "niet meedoen of niet spelen", "De speler zit vandaag op de bank."), synonyms=["sofa"], related_terms=["stoel", "kamer"], grammar={"article": "de"}),
            ],
        },
        {
            "language": "en",
            "language_name": "English",
            "slug": "en-cambridge-test",
            "name": "Cambridge-like EN Test (synthetic)",
            "list_slug": "en-cambridge-test-all",
            "list_name": "Cambridge-like EN Test",
            "base_index": 98000,
            "entries": [
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98000, filename="house_zn_1.json", headword="house", pos="zn", plural="houses", definition="A building where people live.", context="a place to live", example="The house has a blue door.", idiom=("bring the house down", "make an audience laugh or applaud", "The comedian brought the house down."), synonyms=["home"], related_terms=["room", "roof"], grammar={"article": "a"}),
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98001, filename="run_ww_1.json", headword="run", pos="ww", verb_forms="ran, has run", conjugation=_verb_forms({"i": "run", "you": "run", "he_she_it": "runs", "we": "run", "they": "run"}, {"i": "ran", "you": "ran", "he_she_it": "ran", "we": "ran", "they": "ran"}, "has", "run"), definition="To move quickly on foot.", context="a person moves", example="They run beside the river every morning.", idiom=("run out of time", "have no time left", "We ran out of time before the test ended."), synonyms=["jog"], antonyms=["stop"], related_terms=["runner"], grammar={"auxiliary": "have"}),
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98002, filename="bridge_zn_1.json", headword="bridge", pos="zn", plural="bridges", definition="A structure that allows people or vehicles to cross an obstacle.", context="a structure", example="The bridge crosses the narrow river.", idiom=("cross that bridge when we come to it", "deal with a problem when it happens", "We will cross that bridge when we come to it."), synonyms=["crossing"], related_terms=["river", "road"], grammar={"article": "a"}),
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98003, filename="light_bn_1.json", headword="light", pos="bn", comparative="lighter", superlative="lightest", definition="Not heavy; weighing little.", context="weight", example="This bag is light enough to carry.", idiom=("light as a feather", "very light", "The scarf was light as a feather."), synonyms=["lightweight"], antonyms=["heavy"], related_terms=["weight"], grammar={"attributive": "a light bag"}),
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98004, filename="home_bw_1.json", headword="home", pos="bw", definition="To or at the place where someone lives.", context="direction or place", example="After work she went home.", idiom=("make yourself at home", "behave comfortably as if in your own home", "Please make yourself at home."), synonyms=["houseward"], related_terms=["house", "family"], grammar={"degree": "neutral"}),
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98005, filename="bank_zn_1.json", headword="bank", pos="zn", plural="banks", definition="A financial institution that keeps and lends money.", context="finance", example="The bank closes at five.", idiom=("break the bank", "cost more money than one can afford", "The repair did not break the bank."), synonyms=["lender"], related_terms=["money", "account"], grammar={"article": "a"}),
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98006, filename="door_zn_1.json", headword="door", pos="zn", plural="doors", definition="A movable panel that closes an entrance.", context="part of a building", example="Please close the door quietly.", idiom=("show someone the door", "ask someone to leave", "The guard showed the visitor the door."), synonyms=["entrance"], related_terms=["room", "key"], grammar={"article": "a"}),
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98007, filename="roof_zn_1.json", headword="roof", pos="zn", plural="roofs", definition="The upper covering of a building.", context="part of a house", example="Rain tapped on the roof.", idiom=("raise the roof", "make a very loud noise", "The crowd raised the roof after the goal."), synonyms=["covering"], related_terms=["house", "ceiling"], grammar={"article": "a"}),
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98008, filename="room_zn_1.json", headword="room", pos="zn", plural="rooms", definition="A separate space inside a building.", context="part of a building", example="The room has two large windows.", idiom=("make room", "create enough space", "Please make room for one more chair."), synonyms=["space"], related_terms=["house", "window"], grammar={"article": "a"}),
                _entry(language="en", dictionary_slug="en-cambridge-test", dictionary_name="Cambridge-like EN Test (synthetic)", index=98009, filename="water_zn_1.json", headword="water", pos="zn", plural="", definition="A clear liquid that people and animals drink.", context="a basic substance", example="The glass is full of water.", idiom=(" test the waters", "try something cautiously", "She tested the waters before changing jobs."), synonyms=["liquid"], related_terms=["river", "drink"], grammar={"article": "some"}),
            ],
        },
        {
            "language": "fr",
            "language_name": "Français",
            "slug": "fr-larousse-test",
            "name": "Larousse-like FR Test (synthetic)",
            "list_slug": "fr-larousse-test-all",
            "list_name": "Larousse-like FR Test",
            "base_index": 99000,
            "entries": [
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99000, filename="maison_zn_1.json", headword="maison", pos="zn", gender="la", plural="maisons", definition="Bâtiment ou logement dans lequel on habite.", context="un lieu d habitation", example="Notre maison donne sur le jardin.", idiom=("être maître chez soi", "pouvoir décider librement chez soi", "Ici, elle est maître chez elle."), synonyms=["logement"], related_terms=["pièce", "toit"], grammar={"article": "la"}),
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99001, filename="courir_ww_1.json", headword="courir", pos="ww", verb_forms="courut, a couru", conjugation=_verb_forms({"je": "cours", "tu": "cours", "il_elle": "court", "nous": "courons", "vous": "courez", "ils_elles": "courent"}, {"je": "courus", "tu": "courus", "il_elle": "courut", "nous": "courûmes", "vous": "courûtes", "ils_elles": "coururent"}, "a", "couru"), definition="Se déplacer rapidement avec les jambes.", context="un déplacement", example="Nous aimons courir le matin.", idiom=("courir après le temps", "avoir toujours trop peu de temps", "Elle court après le temps cette semaine."), synonyms=["galoper"], antonyms=["marcher"], related_terms=["course"], grammar={"auxiliary": "avoir"}),
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99002, filename="rapide_bn_1.json", headword="rapide", pos="bn", gender="", comparative="plus rapide", superlative="le plus rapide", definition="Qui se déplace ou agit avec vitesse.", context="la vitesse", example="Le train est très rapide.", idiom=("à toute vitesse", "très vite", "Il est parti à toute vitesse."), synonyms=["vite"], antonyms=["lent"], related_terms=["vitesse"], grammar={"attributive": "une réponse rapide"}),
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99003, filename="souvent_bw_1.json", headword="souvent", pos="bw", definition="À de nombreuses reprises.", context="la fréquence", example="Il vient souvent nous voir.", idiom=("de temps en temps", "parfois, mais pas toujours", "Nous mangeons ensemble de temps en temps."), synonyms=["fréquemment"], antonyms=["rarement"], related_terms=["fréquence"], grammar={"degree": "neutral"}),
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99004, filename="banque_zn_1.json", headword="banque", pos="zn", gender="la", plural="banques", definition="Établissement qui conserve et gère de l argent.", context="la finance", example="La banque ouvre à neuf heures.", idiom=("faire sauter la banque", "gagner une très grande somme", "Le joueur a fait sauter la banque."), synonyms=["établissement financier"], related_terms=["compte", "argent"], grammar={"article": "la"}),
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99005, filename="porte_ww_1.json", headword="porte", pos="ww", verb_forms="porta, a porté", conjugation=_verb_forms({"je": "porte", "tu": "portes", "il_elle": "porte", "nous": "portons", "vous": "portez", "ils_elles": "portent"}, {"je": "portai", "tu": "portas", "il_elle": "porta", "nous": "portâmes", "vous": "portâtes", "ils_elles": "portèrent"}, "a", "porté"), definition="Transporter quelque chose sur soi ou avec soi.", context="une action", example="Elle porte un sac bleu.", idiom=("porter ses fruits", "produire le résultat attendu", "Le travail finit par porter ses fruits."), synonyms=["transporter"], related_terms=["sac", "vêtement"], grammar={"auxiliary": "avoir"}),
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99006, filename="livre_zn_1.json", headword="livre", pos="zn", gender="le", plural="livres", definition="Ensemble de pages réunies et reliées pour être lu.", context="un objet à lire", example="Ce livre raconte une histoire vraie.", idiom=("à livre ouvert", "avec une grande franchise", "Il parle à livre ouvert de son expérience."), synonyms=["ouvrage"], related_terms=["page", "lecture"], grammar={"article": "le"}),
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99007, filename="chambre_zn_1.json", headword="chambre", pos="zn", gender="la", plural="chambres", definition="Pièce destinée notamment au sommeil.", context="une pièce d habitation", example="La chambre donne sur la cour.", idiom=("chambre d écho", "lieu où les mêmes idées se répètent", "Le groupe est devenu une chambre d écho."), synonyms=["pièce"], related_terms=["lit", "maison"], grammar={"article": "la"}),
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99008, filename="toit_zn_1.json", headword="toit", pos="zn", gender="le", plural="toits", definition="Partie supérieure qui couvre un bâtiment.", context="une partie d un bâtiment", example="La pluie frappe le toit.", idiom=("avoir un toit sur la tête", "avoir un logement", "Après le voyage, ils ont enfin un toit sur la tête."), synonyms=["couverture"], related_terms=["maison", "pluie"], grammar={"article": "le"}),
                _entry(language="fr", dictionary_slug="fr-larousse-test", dictionary_name="Larousse-like FR Test (synthetic)", index=99009, filename="eau_zn_1.json", headword="eau", pos="zn", gender="l", plural="eaux", definition="Liquide transparent essentiel à la vie.", context="une substance", example="Il boit un verre d eau.", idiom=("mettre de l eau dans son vin", "modérer ses exigences", "Après la discussion, elle a mis de l eau dans son vin."), synonyms=["liquide"], related_terms=["boisson", "rivière"], grammar={"article": "l"}),
            ],
        },
        {
            "language": "de",
            "language_name": "Deutsch",
            "slug": "de-duden-test",
            "name": "Duden-like DE Test (synthetic)",
            "list_slug": "de-duden-test-all",
            "list_name": "Duden-like DE Test",
            "base_index": 100000,
            "entries": [
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100000, filename="haus_zn_1.json", headword="Haus", pos="zn", gender="das", plural="Häuser", definition="Gebäude, in dem Menschen wohnen.", context="ein Gebäude", example="Unser Haus steht am Fluss.", idiom=("etwas unter Dach und Fach bringen", "etwas erfolgreich abschließen", "Wir wollen den Vertrag unter Dach und Fach bringen."), synonyms=["Gebäude"], related_terms=["Zimmer", "Dach"], grammar={"article": "das"}),
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100001, filename="laufen_ww_1.json", headword="laufen", pos="ww", verb_forms="lief, ist gelaufen", conjugation=_verb_forms({"ich": "laufe", "du": "läufst", "er_sie_es": "läuft", "wir": "laufen", "ihr": "lauft", "sie": "laufen"}, {"ich": "lief", "du": "liefst", "er_sie_es": "lief", "wir": "liefen", "ihr": "lieft", "sie": "liefen"}, "ist", "gelaufen"), definition="Sich schnell zu Fuß fortbewegen.", context="eine Bewegung", example="Die Kinder laufen zum Park.", idiom=("jemandem davonlaufen", "sich einer Person entziehen", "Die Gelegenheit ist ihm davongelaufen."), synonyms=["rennen"], antonyms=["stehen"], related_terms=["Lauf"], grammar={"auxiliary": "sein"}),
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100002, filename="lernen_ww_1.json", headword="lernen", pos="ww", verb_forms="lernte, hat gelernt", conjugation=_verb_forms({"ich": "lerne", "du": "lernst", "er_sie_es": "lernt", "wir": "lernen", "ihr": "lernt", "sie": "lernen"}, {"ich": "lernte", "du": "lerntest", "er_sie_es": "lernte", "wir": "lernten", "ihr": "lerntet", "sie": "lernten"}, "hat", "gelernt"), definition="Wissen oder eine Fähigkeit durch Übung erwerben.", context="Schule und Übung", example="Sie lernt jeden Abend neue Wörter.", idiom=("aus Fehlern lernen", "durch Fehler besser werden", "Wir können aus Fehlern lernen."), synonyms=["studieren"], related_terms=["Schule", "Wissen"], grammar={"auxiliary": "haben"}),
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100003, filename="freundlich_bn_1.json", headword="freundlich", pos="bn", comparative="freundlicher", superlative="am freundlichsten", definition="Wohlwollend und angenehm im Umgang mit anderen.", context="eine Person oder Haltung", example="Die Verkäuferin war sehr freundlich.", idiom=("ein freundliches Gesicht machen", "freundlich wirken", "Er macht trotz der Arbeit ein freundliches Gesicht."), synonyms=["nett"], antonyms=["unfreundlich"], related_terms=["Freund"], grammar={"attributive": "ein freundlicher Mensch"}),
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100004, filename="hell_bn_1.json", headword="hell", pos="bn", comparative="heller", superlative="am hellsten", definition="Viel Licht aufweisend oder abgebend.", context="ein Raum oder eine Farbe", example="Das Zimmer ist hell und warm.", idiom=("hellwach sein", "voll aufmerksam sein", "Nach dem Kaffee war er hellwach."), synonyms=["licht"], antonyms=["dunkel"], related_terms=["Licht"], grammar={"attributive": "ein heller Raum"}),
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100005, filename="oft_bw_1.json", headword="oft", pos="bw", definition="Viele Male oder bei vielen Gelegenheiten.", context="Häufigkeit", example="Er fährt oft mit dem Fahrrad.", idiom=("alle naselang", "sehr häufig", "Sie ruft alle naselang an."), synonyms=["häufig"], antonyms=["selten"], related_terms=["Häufigkeit"], grammar={"degree": "neutral"}),
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100006, filename="draußen_bw_1.json", headword="draußen", pos="bw", definition="Außerhalb eines Gebäudes oder eines abgegrenzten Raumes.", context="ein Ort", example="Die Kinder spielen draußen.", idiom=("draußen vor der Tür stehen", "nicht beteiligt sein", "Ohne Einladung stand er draußen vor der Tür."), synonyms=["außen"], antonyms=["drinnen"], related_terms=["Außenbereich"], grammar={"degree": "neutral"}),
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100007, filename="Tür_zn_1.json", headword="Tür", pos="zn", gender="die", plural="Türen", definition="Beweglicher Teil, der einen Eingang verschließt.", context="ein Gebäudeteil", example="Bitte schließe die Tür leise.", idiom=("jemandem die Tür öffnen", "jemandem eine Möglichkeit geben", "Das Praktikum hat ihr die Tür geöffnet."), synonyms=["Eingang"], related_terms=["Schlüssel", "Zimmer"], grammar={"article": "die"}),
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100008, filename="Freund_zn_1.json", headword="Freund", pos="zn", gender="der", plural="Freunde", definition="Person, zu der man eine enge Beziehung hat.", context="eine Person", example="Mein Freund wohnt in der Nähe.", idiom=("unter Freunden", "in vertrauter Gesellschaft", "Unter Freunden kann man offen sprechen."), synonyms=["Kamerad"], related_terms=["Freundschaft"], grammar={"article": "der"}),
                _entry(language="de", dictionary_slug="de-duden-test", dictionary_name="Duden-like DE Test (synthetic)", index=100009, filename="Wasser_zn_1.json", headword="Wasser", pos="zn", gender="das", plural="", definition="Klare Flüssigkeit, die Menschen und Tiere trinken.", context="ein Stoff", example="Das Glas ist mit Wasser gefüllt.", idiom=("nah am Wasser gebaut sein", "leicht zu rühren sein", "Sie ist nah am Wasser gebaut."), synonyms=["Trinkwasser"], related_terms=["Fluss", "Getränk"], grammar={"article": "das"}),
            ],
        },
    ]


def _write_dictionary(spec: dict[str, Any], *, check_only: bool = False) -> tuple[int, Path]:
    data_dir = ROOT / "packages" / "ingestion" / spec["language"] / spec["slug"] / "data" / "words_content"
    if check_only:
        from importer.source_manifest import load_source_manifest

        manifest = load_source_manifest(data_dir)
        if len(manifest.artifacts) != len(spec["entries"]):
            raise ValueError(
                f"{data_dir} has {len(manifest.artifacts)} artifacts; "
                f"expected {len(spec['entries'])}"
            )
        return len(manifest.artifacts), data_dir

    data_dir.mkdir(parents=True, exist_ok=True)
    manifest_records: list[dict[str, str]] = []

    for item in spec["entries"]:
        path = data_dir / item["filename"]
        path.write_text(
            json.dumps([item["payload"]], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        manifest_records.append(
            {
                "artifact_path": path.name,
                "content_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "identity_scheme_version": IDENTITY_SCHEME_VERSION,
                "source_entry_key": item["payload"]["_source"]["source_entry_key"],
                "source_group_key": item["payload"]["_source"]["source_group_key"],
            }
        )

    manifest_records.sort(key=lambda record: record["artifact_path"])
    manifest_path = data_dir / "_manifest.jsonl"
    manifest_path.write_text(
        "".join(
            json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
            for record in manifest_records
        ),
        encoding="utf-8",
    )
    summary = {
        "artifact_count": len(manifest_records),
        "artifact_format_version": ARTIFACT_FORMAT_VERSION,
        "identity_scheme_version": IDENTITY_SCHEME_VERSION,
        "input_sha256": hashlib.sha256(
            json.dumps(spec["entries"], ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest(),
        "manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "source_record_count": len(manifest_records),
    }
    (data_dir / "_manifest.summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return len(manifest_records), data_dir


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate generated artifacts without rewriting them.")
    args = parser.parse_args()

    for spec in _dictionaries():
        count, data_dir = _write_dictionary(spec, check_only=args.check)
        print(f"{'checked' if args.check else 'generated'} {count} entries in {data_dir}")


if __name__ == "__main__":
    main()
