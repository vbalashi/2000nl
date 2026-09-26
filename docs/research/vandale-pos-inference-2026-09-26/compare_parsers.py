"""Compare parser revisions over saved provider responses without rewriting artifacts."""
import argparse, json, hashlib, subprocess, sys, time
from pathlib import Path
from collections import Counter

def load(name, source):
    module = type(sys)(name)
    exec(compile(source, name, "exec"), module.__dict__)
    return module.parse_vandale_entry_fixed

args_parser = argparse.ArgumentParser(description=__doc__)
args_parser.add_argument("--source", type=Path, required=True)
args_parser.add_argument("--baseline", default="1bb8e3ca1fb763f15ea342546539f666ac4e7059")
args_parser.add_argument("--output", type=Path, required=True)
args = args_parser.parse_args()
baseline = subprocess.check_output(["git", "show", f"{args.baseline}:packages/scraper/vandale_html_parser.py"], text=True)
current = Path("packages/scraper/vandale_html_parser.py").read_text()
old, new = load("baseline", baseline), load("candidate", current)
source = args.source
records = json.loads(source.read_bytes())
changes = []
fields = Counter()
started = time.monotonic()
for index, record in enumerate(records):
    before = old(record["content"], record["headword"])
    after = new(record["content"], record["headword"])
    changed = [key for key in set(before) | set(after) if before.get(key) != after.get(key)]
    if changed:
        fields.update(changed)
        changes.append({"source_index": record["index"], "source_headword": record["headword"], "nt2": after["is_nt2_2000"], "meaning_count": len(after["meanings"]), "changes": {key: {"before": before.get(key), "after": after.get(key)} for key in sorted(changed)}})
    if index % 2000 == 0:
        print(f"Compared {index}/{len(records)} source articles", flush=True)
result = {"baseline_commit": subprocess.check_output(["git", "rev-parse", args.baseline], text=True).strip(), "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "candidate_parser_sha256": hashlib.sha256(current.encode()).hexdigest(), "articles_compared": len(records), "changed_articles": len(changes), "changed_fields": dict(fields), "changes": changes, "duration_seconds": round(time.monotonic()-started, 2)}
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n")
print(json.dumps(result, ensure_ascii=False, indent=2))
