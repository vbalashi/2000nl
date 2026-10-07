import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vandale_html_parser import parse_vandale_entry_fixed


def article(headword_html: str, grammar: str = "", gender: str = "") -> str:
    return f'''<span id="a1" class="f1y">
      <span class="f3 f3v">
        <span class="f2g"><span class="f2f">{gender}</span></span>
        <span class="f2h">{headword_html}{grammar}</span>
      </span>
      <span class="f3 f3u"><span class="f1m">
        <span class="f3i">een definitie</span>
      </span></span>
    </span>'''


@pytest.mark.parametrize(("headword", "pronunciation", "gender"), [
    ("islam", "is·l<span class='f1e'>a</span>m", "de"),
    ("bewustzijn", "be·w<span class='f1e'>u</span>st·zijn", "het"),
    ("bijzijn", "b<span class='f1e'>ij</span>·zijn", "het"),
    ("welzijn", "w<span class='f1e'>e</span>l·zijn", "het"),
])
def test_noun_pronunciation_is_not_conjugation(headword, pronunciation, gender):
    entry = parse_vandale_entry_fixed(article(
        f'<span class="f2e">{pronunciation}</span>', gender=gender,
    ), headword)
    assert entry["part_of_speech"] == "zn"
    assert entry["verb_forms"] == ""
    assert entry["part_of_speech_evidence"]["source"] == "gender_heuristic"


@pytest.mark.parametrize("grammar", [
    '<span class="f1k">(</span><span class="f1v">afleiding: </span>'
    '<span class="f1k">iets is veranderd</span><span class="f1k">)</span>',
    '<span class="f1k">(</span><span class="f1v">voorbeeld: </span>'
    '<span class="f1k">liep, is gelopen</span><span class="f1k">)</span>',
    '<span class="f1k">(spreek uit: liep, is gelopen)</span>',
    '<span class="f1k">(meervoud: vormen; liep, is gelopen)</span>',
])
def test_labeled_header_notes_do_not_supply_verb_evidence(grammar):
    entry = parse_vandale_entry_fixed(article('vorm', grammar, 'de'), 'vorm')
    assert entry["part_of_speech"] == "zn"
    assert entry["verb_forms"] == ""


@pytest.mark.parametrize("perfect", [
    "heeft geaccepteerd", "hebben geaccepteerd", "is gemarcheerd",
    "zijn gemarcheerd", "heeft of is gemarcheerd", "is of heeft gemarcheerd",
    'heeft <b>geaccepteerd</b>',
    'heeft geaccep<span class="f1e">teerd</span>',
])
def test_real_conjugation_group_still_supplies_verb_evidence(perfect):
    grammar = ('<span class="f1k">(</span><span class="f1k">accepteerde</span>'
               '<span class="f1k">,</span>'
               f'<span class="f1k">{perfect}</span>'
               '<span class="f1k">;</span><span class="f1v">afleiding: </span>'
               '<span class="f1k">de acceptatie</span><span class="f1k">)</span>')
    entry = parse_vandale_entry_fixed(article('ac·cep·te·ren', grammar), 'accepteren')
    assert entry["part_of_speech"] == "ww"
    assert entry["part_of_speech_evidence"]["source"] == "conjugation_heuristic"


def test_meaning_example_does_not_supply_header_conjugation():
    html = article('ding', gender='het').replace(
        'een definitie', 'liep, heeft gelopen',
    )
    assert parse_vandale_entry_fixed(html, 'ding')["part_of_speech"] == "zn"


def test_explicit_pos_and_conjugation_table_remain_authoritative_paths():
    html = article('lopen', '<a class="f3g">werkwoordrijtje</a>')
    inferred = parse_vandale_entry_fixed(html, 'lopen')
    assert inferred["part_of_speech"] == "ww"
    assert inferred["part_of_speech_evidence"]["source"] == "conjugation_table_heuristic"
    explicit = parse_vandale_entry_fixed(html, 'lopen <i>(ww)</i>')
    assert explicit["part_of_speech"] == "ww"
    assert explicit["part_of_speech_evidence"]["normalized_pos_status"] == "known"


def test_one_span_conjugation_and_separate_auxiliary_spans():
    for grammar in [
        '<span class="f1k">(liep, is gelopen)</span>',
        '<span class="f1k">(</span><span class="f1k">liep,</span>'
        '<span class="f1k">is</span><span class="f1k">gelopen</span>'
        '<span class="f1k">)</span>',
    ]:
        entry = parse_vandale_entry_fixed(article('lopen', grammar), 'lopen')
        assert entry["part_of_speech"] == "ww"
