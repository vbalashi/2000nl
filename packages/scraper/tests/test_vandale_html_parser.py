from pathlib import Path
import sys


SCRAPER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRAPER_ROOT))

from vandale_html_parser import parse_vandale_entry_fixed  # noqa: E402


def test_preserves_synonym_as_a_meaning_relation() -> None:
    html = """
    <span id="a391" class="f1y">
      <span class="f3 f3v">
        <span class="f2g"><span class="f2f">de</span></span>
        <span class="f2h"><span class="f1e">a</span><span class="f2e">f·grond</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f3i">een heel steile en diepe plek in de bergen</span>
          <span class="f1l"> = </span>
          <span class="f1j">het ravijn</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "afgrond")

    assert entry["meanings"] == [
        {
            "definition": "een heel steile en diepe plek in de bergen",
            "context": "",
            "examples": [],
            "idioms": [],
            "synonyms": ["het ravijn"],
        }
    ]


def test_preserves_antonym_as_a_meaning_relation() -> None:
    html = """
    <span id="a392" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">arm</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f3i">een arme persoon bezit weinig</span>
          <span class="f1l"> (</span>
          <span class="f1v">tegenstelling: </span>
          <span class="f1j">rijk</span>
          <span class="f1l">)</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "arm<sup>2</sup> <i>(bn)</i>")

    assert entry["meanings"] == [
        {
            "definition": "een arme persoon bezit weinig",
            "context": "",
            "examples": [],
            "idioms": [],
            "antonyms": ["rijk"],
        }
    ]


def test_keeps_idiom_examples_on_the_idiom() -> None:
    html = """
    <span id="a6107" class="f1y">
      <span class="f3 f3v">
        <span class="f2g"><span class="f2f">de</span></span>
        <span class="f2h"><span class="f2e">knots</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="fu f0c">
            <span class="f1f">
              <span class="f3i">een knots van een …</span>
              <span class="f3n">een heel grote …</span>
              <span class="f2s">
                <span class="f1k">mijn broer heeft een knots van een huis</span>
              </span>
            </span>
          </span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "knots")

    assert entry["meanings"] == [
        {
            "definition": "",
            "context": "",
            "examples": [],
            "idioms": [
                {
                    "expression": "een knots van een …",
                    "explanation": "een heel grote …",
                    "examples": ["mijn broer heeft een knots van een huis"],
                }
            ],
        }
    ]


def test_preserves_usage_label_outside_the_definition() -> None:
    html = """
    <span id="a6108" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">aan·vaar·den</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f1k">(</span>
          <span class="f1k">formeel</span>
          <span class="f1k">) </span>
          <span class="f3i">ontvangen; aannemen</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "aanvaarden")

    assert entry["meanings"] == [
        {
            "definition": "ontvangen; aannemen",
            "context": "",
            "examples": [],
            "idioms": [],
            "usage_labels": ["formeel"],
        }
    ]


def test_preserves_sense_specific_noun_forms() -> None:
    html = """
    <span id="a3815" class="f1y">
      <span class="f3 f3v">
        <span class="f2g"><span class="f2f">het</span></span>
        <span class="f2h"><span class="f2e">gat</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f1k">(</span>
          <span class="f1v">meervoud: </span>
          <span class="f1k">gatten</span>
          <span class="f1k">; </span>
          <span class="f1v">verkleinwoord: </span>
          <span class="f1k">gatje</span>
          <span class="f1k">) </span>
          <span class="f1k">(</span>
          <span class="f1k">informeel</span>
          <span class="f1k">) </span>
          <span class="f3i">de billen</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "gat")

    assert entry["meanings"] == [
        {
            "definition": "de billen",
            "context": "",
            "examples": [],
            "idioms": [],
            "grammar": {
                "plural": ["gatten"],
                "diminutive": ["gatje"],
            },
            "usage_labels": ["informeel"],
        }
    ]


def test_preserves_sense_specific_verb_form() -> None:
    html = """
    <span id="a3816" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">in·slaan</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f1k">(</span>
          <span class="f1k">heeft ingeslagen</span>
          <span class="f1k">) </span>
          <span class="f3i">breken door erop te slaan</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "inslaan")

    assert entry["meanings"] == [
        {
            "definition": "breken door erop te slaan",
            "context": "",
            "examples": [],
            "idioms": [],
            "grammar": {"verb_forms": ["heeft ingeslagen"]},
        }
    ]


def test_preserves_supplemental_note_outside_the_definition() -> None:
    html = """
    <span id="a201174" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">06-nummer</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f3i">het nummer van een mobiele telefoon</span>
          <span class="f3e">
            <span class="f1l">Alle mobiele nummers in Nederland beginnen met 06.</span>
          </span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "06-nummer")

    assert entry["meanings"] == [
        {
            "definition": "het nummer van een mobiele telefoon",
            "context": "",
            "examples": [],
            "idioms": [],
            "note": "Alle mobiele nummers in Nederland beginnen met 06.",
        }
    ]


def test_preserves_linked_sense_without_leaking_its_number() -> None:
    html = """
    <span id="a201138" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">voor·rij·kos·ten</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f3i">de </span>
          <span class="f1x">1</span>
          <a href="http://goto?q=_pnt6244_pntkosten" class="f3k">
            <span class="f3y">kosten</span>
          </a>
          <span class="f3i"> die je moet betalen als iemand naar je huis rijdt</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "voorrijkosten")

    assert entry["meanings"] == [
        {
            "definition": "de kosten die je moet betalen als iemand naar je huis rijdt",
            "context": "",
            "examples": [],
            "idioms": [],
            "cross_references": [{"headword": "kosten", "meaning_id": 1}],
        }
    ]


def test_removes_link_display_sense_suffix_from_definition() -> None:
    html = """
    <span id="a829" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">bal</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f3i">een dansfeest; zie ook </span>
          <span class="f1x">1</span>
          <a href="http://goto?q=bal" class="f3k"><span class="f3y">bal</span></a>
          <span class="f1l"> (</span>
          <span class="f3x">1</span>
          <span class="f1l">)</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "bal<sup>2</sup> <i>(zn)</i>")

    assert entry["meanings"] == [
        {
            "definition": "een dansfeest; zie ook bal",
            "context": "",
            "examples": [],
            "idioms": [],
            "cross_references": [{"headword": "bal", "meaning_id": 1}],
        }
    ]


def test_structures_relations_and_notes_in_definition_without_f3i() -> None:
    html = """
    <span id="a200117" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">lhbt'er</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f1k">afkorting van: </span>
          <span class="f1k">lesbiennes, homo's, biseksuelen en transgenders</span>
          <span class="f1l">; </span>
          <span class="f1l">= </span>
          <span class="f1j">de holebi</span>
          <span class="f3e">
            <span class="f1l">Deze afkorting kan meer letters hebben.</span>
          </span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "lhbt'er")

    assert entry["meanings"] == [
        {
            "definition": (
                "afkorting van: lesbiennes, homo's, biseksuelen en transgenders"
            ),
            "context": "",
            "examples": [],
            "idioms": [],
            "synonyms": ["de holebi"],
            "note": "Deze afkorting kan meer letters hebben.",
        }
    ]


def test_structures_cross_reference_when_definition_is_only_a_link() -> None:
    html = """
    <span id="a7870" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">of·wel</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <a href="http://goto?q=of" class="f3k"><span class="f3y">of</span></a>
          <span class="f1l"> (</span>
          <span class="f3x">1</span>
          <span class="f1l">)</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "ofwel <i>(vw)</i>")

    assert entry["meanings"] == [
        {
            "definition": "of",
            "context": "",
            "examples": [],
            "idioms": [],
            "cross_references": [{"headword": "of", "meaning_id": 1}],
        }
    ]


def test_moves_inline_syntactic_context_out_of_definition() -> None:
    html = """
    <span id="a7676" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">ner·gens</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f3i">(in combinatie met een voorzetsel:) niets</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "nergens <i>(bw)</i>")

    assert entry["meanings"] == [
        {
            "definition": "niets",
            "context": "in combinatie met een voorzetsel",
            "examples": [],
            "idioms": [],
        }
    ]


def test_moves_fallback_usage_label_out_of_definition() -> None:
    html = """
    <span id="a201267" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">t.h.</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f1k">(</span>
          <span class="f1k">in België</span>
          <span class="f1k">) </span>
          <span class="f1k">afkorting van: </span>
          <span class="f1k">ten honderd</span>
        </span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "t.h. <i>(afk)</i>")

    assert entry["meanings"] == [
        {
            "definition": "afkorting van: ten honderd",
            "context": "",
            "examples": [],
            "idioms": [],
            "usage_labels": ["in België"],
        }
    ]


def test_normalizes_bn_abbreviation_from_the_source_headword() -> None:
    html = """
    <span id="a7467" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">moei·lijk</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">niet gemakkelijk</span></span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(
        html,
        "moeilijk<sup>1</sup> <i>(bn)</i>",
    )

    assert entry["part_of_speech"] == "bn"
    assert entry["part_of_speech_evidence"] == {
        "normalized_pos_status": "known",
        "source": "headword_html",
        "raw_value": "bn",
    }


def test_normalizes_tussenwerpsel_part_of_speech() -> None:
    html = """
    <span id="a232" class="f1y">
      <span class="f3 f3v">
        <span class="f2h">
          <span class="f2e">ach</span>
          <span class="f1k">(</span>
          <span class="f1k">tussenwerpsel</span>
          <span class="f1k">)</span>
        </span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">uitroep van teleurstelling</span></span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "ach")

    assert entry["part_of_speech"] == "tsw"


def test_infers_verb_from_source_conjugation_without_explicit_pos() -> None:
    html = """
    <span id="a235" class="f1y">
      <span class="f3 f3v">
        <span class="f2h">
          <span class="f2e">ac·cep·te·ren</span>
          <span class="f1k">(</span>
          <span class="f1k">accepteerde</span>
          <span class="f1k">,</span>
          <span class="f1k">heeft geaccepteerd</span>
          <span class="f1k">)</span>
        </span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">aannemen</span></span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "accepteren")

    assert entry["part_of_speech"] == "ww"
    assert entry["verb_forms"] == "accepteerde, heeft geaccepteerd"
    assert entry["part_of_speech_evidence"] == {
        "normalized_pos_status": "unresolved",
        "source": "conjugation_heuristic",
        "raw_value": "ww",
    }


def test_infers_proper_noun_with_s_and_spaces() -> None:
    html = """
    <span id="a200035" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">Bur·ki·na Fa·so</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">land in Afrika</span></span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "Burkina Faso")

    assert entry["part_of_speech"] == "zn"


def test_infers_prefix_from_clean_source_headword() -> None:
    html = """
    <span id="a9450" class="f1y">
      <span class="f3 f3v">
        <span class="f2h">
          <span class="f2e">pseu·do-</span>
          <span class="f1l">[</span><span class="f1r">psuidoo</span><span class="f1l">]</span>
        </span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">als iets alleen echt lijkt</span></span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "pseudo-")

    assert entry["part_of_speech"] == "vv"


def test_does_not_append_region_label_to_plural() -> None:
    html = """
    <span id="a201174" class="f1y">
      <span class="f3 f3v">
        <span class="f2g"><span class="f2f">het</span></span>
        <span class="f2h">
          <span class="f2e">06-num·mer</span>
          <span class="f1k">(</span>
          <span class="f1v">meervoud: </span>
          <span class="f1k">06-nummers</span>
          <span class="f1k">)</span>
          <span class="f1k">(</span>
          <span class="f1k">in Nederland</span>
          <span class="f1k">)</span>
        </span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">een mobiel telefoonnummer</span></span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "06-nummer")

    assert entry["plural"] == "06-nummers"


def test_preserves_reference_table() -> None:
    html = """
    <span id="a200025" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">Ber·mu·da</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">land in Amerika</span></span>
      </span>
      <span class="pockond_blok">
        <table class="f4c">
          <tr><td colspan="2"><span class="f4i">Bermuda</span></td></tr>
          <tr><td>inwoner</td><td>Bermudaan</td></tr>
          <tr><td>bijvoeglijk naamwoord</td><td>Bermudaans</td></tr>
          <tr><td>hoofdstad</td><td>Hamilton</td></tr>
        </table>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(html, "Bermuda")

    assert entry["reference_tables"] == [
        {
            "title": "Bermuda",
            "rows": [
                {"label": "inwoner", "value": "Bermudaan"},
                {"label": "bijvoeglijk naamwoord", "value": "Bermudaans"},
                {"label": "hoofdstad", "value": "Hamilton"},
            ],
        }
    ]


def test_preserves_provider_article_identity_evidence() -> None:
    html = """
    <span id="a113" class="f1y">
      <span class="f3 f3v">
        <span class="f2h">
          <span class="f1p">1</span>
          <span class="f2e">aan·pas·sen</span>
        </span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">geschikt maken</span></span>
      </span>
    </span>
    """

    entry = parse_vandale_entry_fixed(
        html,
        "aanpassen<sup>1</sup> <i>(ww)</i>",
    )

    assert entry["source_identity"] == {
        "provider_article_id": "a113",
        "homograph_number": 1,
    }
