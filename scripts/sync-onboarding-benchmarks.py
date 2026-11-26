"""Build the recommendation snapshot from published benchmark data (requires pyarrow).

Run from AIPP-helper. Pass --aipp to regenerate the desktop offline catalog too.
Scores come from the overall text, agent and factuality Arena boards.
"""
import argparse
import io
import json
import re
import subprocess
import tempfile
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

import pyarrow.parquet as parquet

ARENA = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
MODELS = "https://models.dev/catalog.json"
ROOT = Path(__file__).resolve().parents[1]
EFFORT = re.compile(r"\s*\((none|minimal|low|medium|high|xhigh|max)\)$", re.I)


def download(url, headers=None):
    request = Request(url, headers={"User-Agent": "AIPP/benchmark-catalog", **(headers or {})})
    with urlopen(request, timeout=60) as response:
        return response.read()


def normalized(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


class Scores:
    def __init__(self, models):
        self.aliases, self.by_model = {}, {}
        for canonical, entry in models.items():
            for name in (canonical.split("/", 1)[-1], entry.get("name", "")):
                if name:
                    alias = normalized(name)
                    self.aliases.setdefault(alias, set()).add(canonical)
                    # Arena may spell the MMDD suffix using the full release date.
                    released = (entry.get("release_date") or "").replace("-", "")
                    if len(released) == 8:
                        base = alias[:-4] if alias.endswith("-" + released[4:]) else alias + "-"
                        self.aliases.setdefault(base + released, set()).add(canonical)

    def resolve(self, name, creator=""):
        effort = EFFORT.search(name)
        base = name[:effort.start()] if effort else name
        matches = self.aliases.get(normalized(base), set())
        if len(matches) > 1 and creator:
            matches = {m for m in matches if normalized(m.split("/")[0]) == normalized(creator)}
        return (next(iter(matches)) if len(matches) == 1 else None,
                effort.group(1).lower() if effort else None)

    def add(self, name, creator, group, test, score, **options):
        model, effort = self.resolve(name, creator)
        if not model:
            # Unmatched leaderboard entries still belong to the reference population.
            base = EFFORT.sub("", name)
            model = "arena-reference:" + normalized(creator) + "/" + normalized(base)
        if isinstance(score, (int, float)):
            row = dict(group=group, test=test, score=score, **options)
            if effort:
                row["effort"] = effort
            self.by_model.setdefault(model, {})[(test, effort)] = row
            return not model.startswith("arena-reference:")


def arena(scores):
    for board, group in [("text", "chat"), ("agent", "agent"), ("text_factuality", "factual")]:
        tree = json.loads(download(f"https://huggingface.co/api/datasets/lmarena-ai/leaderboard-dataset/tree/main/{board}"))
        files = [f["path"] for f in tree if f["path"].startswith(board + "/latest-")]
        if not files:
            raise ValueError(f"Arena {board} latest split is missing")
        matched = 0
        for path in files:
            rows = parquet.read_table(io.BytesIO(download(f"{ARENA}/resolve/main/{path}"))).to_pylist()
            for row in rows:
                if row["category"].lower() != "overall":
                    continue
                score = row.get("rating", row.get("score"))
                low = row.get("rating_lower", row.get("score_ci_lower"))
                high = row.get("rating_upper", row.get("score_ci_upper"))
                if low is None or high is None:
                    continue
                matched += bool(scores.add(row["model_name"], row["organization"], group,
                    f"arena:{board}:{row['leaderboard_publish_date']}", score, low=low, high=high))
        if not matched:
            raise ValueError(f"Arena {board} has no matched overall rows")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aipp", type=Path)
    args = parser.parse_args()
    raw = download(MODELS)
    scores = Scores(json.loads(raw)["models"])
    arena(scores)
    payload = dict(benchmarks={k: list(v.values()) for k, v in sorted(scores.by_model.items())},
                   defaults={}, sources={"Arena (CC BY 4.0)": ARENA,
                   "models.dev": MODELS, "retrieved": date.today().isoformat()})
    target = ROOT / "src/worker/data/onboarding-benchmarks.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    if args.aipp:
        with tempfile.NamedTemporaryFile(delete=False) as temp:
            temp.write(raw)
        try:
            subprocess.run(["node", "scripts/build-recommendation-catalog.mjs", temp.name,
                str(args.aipp.resolve() / "src-tauri/src/onboarding/recommendation-catalog.json")], cwd=ROOT, check=True)
        finally:
            Path(temp.name).unlink()
    print(f"Collected Arena evaluations for {len(scores.by_model)} model identities.")


if __name__ == "__main__":
    main()
