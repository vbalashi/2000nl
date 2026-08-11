from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import random
from typing import Any


@dataclass(frozen=True)
class BlindReviewResult:
    original_item_count: int
    total_item_count: int
    review_sha256: str
    mapping_sha256: str


def _write_private(path: Path, content: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    os.chmod(path, 0o600)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _reference_article(case: dict[str, Any], protected_case: dict[str, Any]) -> dict[str, Any]:
    senses = []
    for raw in protected_case.get("references") or []:
        senses.append(
            {
                "definition": raw.get("definition") or "",
                "usageNote": raw.get("context") or None,
                "usagePattern": None,
                "examples": raw.get("examples") or [],
                "collocations": [],
                "synonyms": raw.get("synonyms") or [],
                "idioms": raw.get("idioms") or [],
            }
        )
    return {
        "headword": case["generationInput"]["headword"],
        "partOfSpeech": case["generationInput"]["partOfSpeech"],
        "senses": senses,
    }


def _candidate_article(candidate: dict[str, Any]) -> dict[str, Any]:
    content = candidate.get("content")
    if not isinstance(content, dict):
        raise ValueError("Blind candidate content must be an object")
    return {
        "headword": content.get("headword") or "",
        "partOfSpeech": content.get("partOfSpeech") or "",
        "senses": content.get("senses") or [],
    }


def _encoded_payload(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return base64.b64encode(raw.encode("utf-8")).decode("ascii")


def _canonical_hash(value: Any) -> str:
    raw = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _shuffle_interleaved(
    entries: list[tuple[dict[str, Any], dict[str, Any]]],
    *,
    rng: random.Random,
    minimum_spacing: int,
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Shuffle originals and repeats while keeping duplicate presentations apart."""
    if minimum_spacing <= 0:
        shuffled = list(entries)
        rng.shuffle(shuffled)
        return shuffled
    for _ in range(10_000):
        shuffled = list(entries)
        rng.shuffle(shuffled)
        positions = {
            mapping["itemId"]: index
            for index, (_, mapping) in enumerate(shuffled)
        }
        if all(
            mapping.get("repeatedFrom") is None
            or abs(positions[mapping["itemId"]] - positions[mapping["repeatedFrom"]])
            >= minimum_spacing
            for _, mapping in shuffled
        ):
            return shuffled
    raise ValueError("Unable to interleave blind repeats with the requested spacing")


def _html(payload_b64: str, storage_key: str) -> str:
    return f"""<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Woordenboek blindtest</title>
  <style>
    :root {{ color-scheme: light; --ink:#17211b; --muted:#647068; --paper:#f5f2e9; --card:#fffef9; --line:#d9d6ca; --accent:#176b54; --soft:#e5f1ec; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font:16px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--paper); }}
    header {{ position:sticky; top:0; z-index:10; display:flex; align-items:center; gap:18px; padding:14px max(20px,calc((100vw - 1320px)/2)); background:rgba(245,242,233,.96); border-bottom:1px solid var(--line); backdrop-filter:blur(10px); }}
    header h1 {{ margin:0; font-size:18px; }}
    .progress {{ flex:1; height:8px; overflow:hidden; border-radius:99px; background:#dedbd1; }}
    .progress span {{ display:block; height:100%; width:0; background:var(--accent); transition:width .2s; }}
    .count {{ min-width:90px; text-align:right; color:var(--muted); font-variant-numeric:tabular-nums; }}
    main {{ max-width:1320px; margin:0 auto; padding:28px 20px 60px; }}
    .wordline {{ display:flex; align-items:baseline; gap:12px; margin-bottom:18px; }}
    .wordline h2 {{ margin:0; font:700 34px/1.1 ui-serif,Georgia,serif; }}
    .pos {{ color:var(--muted); }}
    .columns {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }}
    .card {{ min-width:0; padding:22px; border:1px solid var(--line); border-radius:18px; background:var(--card); box-shadow:0 8px 28px rgba(31,42,35,.06); }}
    .card h3 {{ display:flex; align-items:center; gap:10px; margin:0 0 18px; font-size:14px; letter-spacing:.12em; text-transform:uppercase; }}
    .badge {{ display:grid; place-items:center; width:30px; height:30px; border-radius:50%; background:var(--soft); color:var(--accent); font-size:16px; }}
    .sense {{ padding:14px 0; border-top:1px solid var(--line); }}
    .sense:first-of-type {{ border-top:0; padding-top:0; }}
    .definition {{ font:600 19px/1.4 ui-serif,Georgia,serif; }}
    .meta {{ margin-top:8px; color:#405047; }}
    ul {{ margin:8px 0 0; padding-left:22px; }}
    .empty {{ color:var(--muted); font-style:italic; }}
    .review {{ margin-top:22px; padding:22px; border:1px solid var(--line); border-radius:18px; background:#fff; }}
    fieldset {{ margin:0 0 18px; padding:0; border:0; }}
    legend {{ margin-bottom:10px; font-weight:700; }}
    .choices {{ display:flex; flex-wrap:wrap; gap:8px; }}
    label.choice {{ cursor:pointer; }}
    .choice input {{ position:absolute; opacity:0; pointer-events:none; }}
    .choice span {{ display:block; padding:9px 13px; border:1px solid var(--line); border-radius:99px; background:#fff; }}
    .choice input:checked + span {{ color:#fff; border-color:var(--accent); background:var(--accent); }}
    .ratings {{ display:grid; grid-template-columns:1fr 100px 100px; gap:8px 12px; align-items:center; margin-bottom:18px; }}
    .ratings strong {{ text-align:center; }}
    select, textarea {{ width:100%; padding:9px 10px; border:1px solid var(--line); border-radius:9px; background:#fff; font:inherit; }}
    .flags {{ display:grid; grid-template-columns:1fr 1fr; gap:7px 18px; }}
    .flags label {{ display:flex; gap:8px; align-items:flex-start; }}
    textarea {{ min-height:76px; resize:vertical; }}
    .nav {{ display:flex; gap:10px; justify-content:space-between; margin-top:18px; }}
    button {{ cursor:pointer; padding:10px 15px; border:1px solid var(--line); border-radius:10px; background:#fff; color:var(--ink); font:600 14px/1 inherit; }}
    button.primary {{ color:#fff; border-color:var(--accent); background:var(--accent); }}
    button:disabled {{ cursor:not-allowed; opacity:.45; }}
    .exports {{ display:flex; gap:8px; margin-left:auto; }}
    @media (max-width:800px) {{ .columns {{ grid-template-columns:1fr; }} .ratings {{ grid-template-columns:1fr 82px 82px; }} .flags {{ grid-template-columns:1fr; }} header {{ gap:10px; }} header h1 {{ display:none; }} }}
  </style>
</head>
<body>
  <header>
    <h1>Woordenboek blindtest</h1>
    <div class="progress"><span id="progressBar"></span></div>
    <div class="count" id="progressCount"></div>
    <div class="exports"><button id="exportJson">Export JSON</button><button id="exportCsv">Export CSV</button></div>
  </header>
  <main>
    <div class="wordline"><h2 id="headword"></h2><span class="pos" id="partOfSpeech"></span></div>
    <div class="columns"><section class="card"><h3><span class="badge">A</span> Versie A</h3><div id="sideA"></div></section><section class="card"><h3><span class="badge">B</span> Versie B</h3><div id="sideB"></div></section></div>
    <section class="review">
      <fieldset><legend>Welke versie helpt je het meest?</legend><div class="choices" id="overallChoices"></div></fieldset>
      <div class="ratings"><span></span><strong>A</strong><strong>B</strong><label>Duidelijkheid definitie</label><select data-rate="clarityA"></select><select data-rate="clarityB"></select><label>Natuurlijk Nederlands</label><select data-rate="naturalA"></select><select data-rate="naturalB"></select><label>Bruikbaarheid voorbeelden</label><select data-rate="examplesA"></select><select data-rate="examplesB"></select></div>
      <fieldset><legend>Problemen die je ziet</legend><div class="flags" id="flags"></div></fieldset>
      <div class="ratings"><label>Zekerheid over je keuze</label><select id="confidence"></select><span></span></div>
      <label>Opmerking (optioneel)<textarea id="comment"></textarea></label>
      <div class="nav"><button id="previous">← Vorige</button><button class="primary" id="next">Volgende →</button></div>
    </section>
  </main>
  <script>
    const encoded = "{payload_b64}";
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))));
    const storageKey = "{storage_key}";
    const answers = JSON.parse(localStorage.getItem(storageKey) || "{{}}");
    let current = 0;
    const overallOptions = [["a","A is beter"],["b","B is beter"],["tie","Beide zijn goed / gelijk"],["bad","Beide zijn slecht"]];
    const flagOptions = [["wrong_meaning","Verkeerde betekenis"],["awkward","Onnatuurlijk Nederlands"],["too_difficult","Te moeilijke woorden"],["grammar","Grammatica of woordvorm fout"],["idiom","Twijfelachtige uitdrukking"],["copied","Voelt te veel gekopieerd"]];
    function el(tag, cls, text) {{ const node=document.createElement(tag); if(cls) node.className=cls; if(text!=null) node.textContent=text; return node; }}
    function renderList(parent, title, values) {{ if(!Array.isArray(values)||!values.length) return; const box=el("div","meta"); box.append(el("strong",null,title)); const ul=el("ul"); values.forEach(value => {{ const text=typeof value==="string"?value:(value.expression||value.term||JSON.stringify(value)); ul.append(el("li",null,text)); }}); box.append(ul); parent.append(box); }}
    function renderArticle(target, article) {{ target.replaceChildren(); const senses=article.senses||[]; if(!senses.length) {{ target.append(el("p","empty","Geen inhoud")); return; }} senses.forEach((sense,index) => {{ const section=el("section","sense"); section.append(el("div","definition",`${{index+1}}. ${{sense.definition||"—"}}`)); if(sense.usageNote) section.append(el("div","meta",sense.usageNote)); if(sense.usagePattern) section.append(el("div","meta",`Patroon: ${{sense.usagePattern}}`)); renderList(section,"Voorbeelden",sense.examples); renderList(section,"Combinaties",sense.collocations); renderList(section,"Synoniemen",sense.synonyms); renderList(section,"Uitdrukkingen",sense.idioms); target.append(section); }}); }}
    function ratingSelect(select) {{ select.replaceChildren(el("option",null,"—")); select.firstChild.value=""; for(let i=1;i<=5;i++) {{ const option=el("option",null,String(i)); option.value=String(i); select.append(option); }} }}
    document.querySelectorAll("[data-rate]").forEach(ratingSelect); ratingSelect(document.getElementById("confidence"));
    overallOptions.forEach(([value,label]) => {{ const wrap=el("label","choice"); const input=el("input"); input.type="radio"; input.name="overall"; input.value=value; wrap.append(input,el("span",null,label)); document.getElementById("overallChoices").append(wrap); }});
    flagOptions.forEach(([value,label]) => {{ const wrap=el("label"); const input=el("input"); input.type="checkbox"; input.value=value; wrap.append(input,el("span",null,label)); document.getElementById("flags").append(wrap); }});
    function readForm() {{ const overall=document.querySelector('input[name="overall"]:checked'); const rates={{}}; document.querySelectorAll("[data-rate]").forEach(node => rates[node.dataset.rate]=node.value||null); return {{overall:overall?overall.value:null,ratings:rates,flags:[...document.querySelectorAll('#flags input:checked')].map(n=>n.value),confidence:document.getElementById("confidence").value||null,comment:document.getElementById("comment").value.trim()||null,updatedAt:new Date().toISOString()}}; }}
    function save() {{ answers[data.items[current].itemId]=readForm(); localStorage.setItem(storageKey,JSON.stringify(answers)); updateProgress(); }}
    function loadForm() {{ const answer=answers[data.items[current].itemId]||{{}}; document.querySelectorAll('input[name="overall"]').forEach(n=>n.checked=n.value===answer.overall); document.querySelectorAll("[data-rate]").forEach(n=>n.value=(answer.ratings||{{}})[n.dataset.rate]||""); document.querySelectorAll('#flags input').forEach(n=>n.checked=(answer.flags||[]).includes(n.value)); document.getElementById("confidence").value=answer.confidence||""; document.getElementById("comment").value=answer.comment||""; }}
    function updateProgress() {{ const done=Object.values(answers).filter(a=>a.overall).length; document.getElementById("progressBar").style.width=`${{100*done/data.items.length}}%`; document.getElementById("progressCount").textContent=`${{current+1}} / ${{data.items.length}}`; }}
    function render() {{ const item=data.items[current]; document.getElementById("headword").textContent=item.headword; document.getElementById("partOfSpeech").textContent=item.partOfSpeech; renderArticle(document.getElementById("sideA"),item.sideA); renderArticle(document.getElementById("sideB"),item.sideB); loadForm(); updateProgress(); document.getElementById("previous").disabled=current===0; document.getElementById("next").textContent=current===data.items.length-1?"Opslaan":"Volgende →"; window.scrollTo({{top:0,behavior:"smooth"}}); }}
    function download(name,type,text) {{ const a=el("a"); a.href=URL.createObjectURL(new Blob([text],{{type}})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }}
    function exportRows() {{ save(); return data.items.map(item=>({{itemId:item.itemId,headword:item.headword,partOfSpeech:item.partOfSpeech,...(answers[item.itemId]||{{}})}})); }}
    document.getElementById("previous").onclick=()=>{{save(); if(current>0){{current--;render();}}}}; document.getElementById("next").onclick=()=>{{save(); if(current<data.items.length-1){{current++;render();}}}};
    document.querySelector(".review").addEventListener("change",save); document.getElementById("comment").addEventListener("input",()=>{{clearTimeout(window.saveTimer);window.saveTimer=setTimeout(save,250);}});
    document.getElementById("exportJson").onclick=()=>download("blind-review.json","application/json",JSON.stringify({{schema:"lexicography-blind-responses-v1",exportedAt:new Date().toISOString(),bundleMetadata:data.metadata,items:exportRows()}},null,2));
    document.getElementById("exportCsv").onclick=()=>{{ const rows=exportRows(); const columns=["itemId","headword","partOfSpeech","overall","clarityA","clarityB","naturalA","naturalB","examplesA","examplesB","flags","confidence","comment"]; const quote=v=>'"'+String(v??"").replaceAll('"','""')+'"'; const lines=[columns.map(quote).join(","),...rows.map(r=>columns.map(c=>quote(c in (r.ratings||{{}})?r.ratings[c]:c==="flags"?(r.flags||[]).join("|"):r[c])).join(","))]; download("blind-review.csv","text/csv",lines.join("\\n")); }};
    render();
  </script>
</body>
</html>
"""


def render_blind_review(
    *,
    sample: dict[str, Any],
    protected: dict[str, Any],
    candidate_dir: Path | list[Path],
    output_html: Path,
    mapping_path: Path,
    split: str,
    seed: str,
    repeat_count: int = 8,
) -> BlindReviewResult:
    if sample.get("schema") != "lexicography-sample-v1":
        raise ValueError("Sample must use lexicography-sample-v1")
    if protected.get("schema") != "lexicography-protected-references-v1":
        raise ValueError("Protected bundle uses an unsupported schema")
    protected_by_id = {
        case.get("caseId"): case for case in protected.get("cases") or []
    }
    selected = [
        case
        for case in sample.get("cases") or []
        if split == "all" or case.get("split") == split
    ]
    if not selected:
        raise ValueError(f"Sample has no cases in split {split}")
    if not 0 <= repeat_count <= len(selected):
        raise ValueError("repeat_count must fit within the selected cases")

    rng = random.Random(seed)
    candidate_dirs = (
        [candidate_dir] if isinstance(candidate_dir, Path) else list(candidate_dir)
    )
    if not candidate_dirs:
        raise ValueError("At least one candidate directory is required")
    entries: list[tuple[dict[str, Any], dict[str, Any]]] = []
    originals = []
    candidates_for_hash = []
    for index, case in enumerate(selected, start=1):
        case_id = case["caseId"]
        protected_case = protected_by_id.get(case_id)
        if not isinstance(protected_case, dict):
            raise ValueError(f"Missing protected case {case_id}")
        matches = [
            root / f"{case_id}.json"
            for root in candidate_dirs
            if (root / f"{case_id}.json").is_file()
        ]
        if len(matches) != 1:
            raise ValueError(
                f"Expected exactly one candidate {case_id} across review runs"
            )
        candidate_path = matches[0]
        candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
        baseline = _reference_article(case, protected_case)
        generated = _candidate_article(candidate)
        baseline_on_a = bool(rng.getrandbits(1))
        item_id = f"blind-{index:03d}"
        article_a, article_b = (
            (baseline, generated) if baseline_on_a else (generated, baseline)
        )
        origin_a, origin_b = (
            ("benchmark", "generated")
            if baseline_on_a
            else ("generated", "benchmark")
        )
        review_item = {
            "itemId": item_id,
            "headword": case["generationInput"]["headword"],
            "partOfSpeech": case["generationInput"]["partOfSpeech"],
            "sideA": article_a,
            "sideB": article_b,
        }
        mapping_item = {
                "itemId": item_id,
                "caseId": case_id,
                "sideA": origin_a,
                "sideB": origin_b,
                "repeatedFrom": None,
            }
        entries.append((review_item, mapping_item))
        originals.append((review_item, mapping_item))
        candidates_for_hash.append(candidate)

    repeated_indexes = rng.sample(range(len(originals)), repeat_count)
    for repeat_number, original_index in enumerate(repeated_indexes, start=1):
        original, original_mapping = originals[original_index]
        item_id = f"repeat-{repeat_number:03d}"
        entries.append(
            ({
                "itemId": item_id,
                "headword": original["headword"],
                "partOfSpeech": original["partOfSpeech"],
                "sideA": original["sideB"],
                "sideB": original["sideA"],
            }, {
                "itemId": item_id,
                "caseId": original_mapping["caseId"],
                "sideA": original_mapping["sideB"],
                "sideB": original_mapping["sideA"],
                "repeatedFrom": original_mapping["itemId"],
            })
        )

    minimum_spacing = 3 if len(originals) >= 6 else (1 if len(originals) > 1 else 0)
    entries = _shuffle_interleaved(entries, rng=rng, minimum_spacing=minimum_spacing)
    items = [item for item, _ in entries]
    mapping_items = [mapping for _, mapping in entries]

    seed_hash = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    sample_hash = _canonical_hash(sample)
    protected_hash = _canonical_hash(protected)
    candidate_bundle_hash = _canonical_hash(candidates_for_hash)
    finalist_ids = sorted(
        {
            str(candidate.get("promptId") or "")
            for candidate in candidates_for_hash
            if candidate.get("promptId")
        }
    )
    review_bundle_id = "blind_" + _canonical_hash(
        {
            "benchmarkId": sample.get("benchmarkId"),
            "split": split,
            "selectionHash": sample.get("selectionHash"),
            "sampleHash": sample_hash,
            "protectedHash": protected_hash,
            "candidateBundleHash": candidate_bundle_hash,
            "seedHash": seed_hash,
        }
    )[:20]

    payload = {
        "schema": "lexicography-blind-review-v1",
        "benchmarkId": sample.get("benchmarkId"),
        "split": split,
        "items": items,
    }
    mapping = {
        "schema": "lexicography-blind-mapping-v1",
        "benchmarkId": sample.get("benchmarkId"),
        "split": split,
        "reviewBundleId": review_bundle_id,
        "selectionHash": sample.get("selectionHash"),
        "sampleHash": sample_hash,
        "protectedHash": protected_hash,
        "candidateBundleHash": candidate_bundle_hash,
        "finalistPromptIds": finalist_ids,
        "seedHash": seed_hash,
        "minimumRepeatSpacing": minimum_spacing,
        "items": mapping_items,
    }
    mapping_text = json.dumps(mapping, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    mapping_sha = _write_private(mapping_path, mapping_text)
    payload["metadata"] = {
        "reviewBundleId": review_bundle_id,
        "benchmarkId": sample.get("benchmarkId"),
        "selectionHash": sample.get("selectionHash"),
        "split": split,
        "mappingHash": mapping_sha,
        "sampleHash": sample_hash,
        "protectedHash": protected_hash,
        "candidateBundleHash": candidate_bundle_hash,
        "finalistPromptIds": finalist_ids,
        "seedHash": seed_hash,
    }
    storage_key = "lexicography-blind-" + hashlib.sha256(
        (str(sample.get("benchmarkId")) + split + seed).encode("utf-8")
    ).hexdigest()[:16]
    html = _html(_encoded_payload(payload), storage_key)
    review_sha = _write_private(output_html, html)
    return BlindReviewResult(
        original_item_count=len(originals),
        total_item_count=len(items),
        review_sha256=review_sha,
        mapping_sha256=mapping_sha,
    )
