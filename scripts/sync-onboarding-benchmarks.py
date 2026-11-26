"""Build the recommendation snapshot from published benchmark data (requires pyarrow).

Run from AIPP-helper. Pass --aipp to regenerate the desktop offline catalog too.
AA_API_KEY enables the paginated official API; otherwise read the public AA table.
--aa-release can be repeated to include all published efforts for a model release.
"""
import argparse
import io
import json
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

import pyarrow.parquet as parquet

AA = "https://artificialanalysis.ai"
ARENA = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
MODELS = "https://models.dev/catalog.json"
ROOT = Path(__file__).resolve().parents[1]
EFFORT = re.compile(r"[\s(-]+(none|minimal|low|medium|high|xhigh|max)\)?$", re.I)


def download(url, headers=None):
    request = Request(url, headers={"User-Agent": "AIPP/benchmark-catalog", **(headers or {})})
    with urlopen(request, timeout=60) as response:
        return response.read()


class Tables(HTMLParser):
    """Only read visible rows and columns; do not depend on AA's UI component state."""
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell = [], [], None
        self.model_links = {}

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
            self.slug = None
        if tag in ("td", "th"):
            self.cell = []
        if tag == "a" and self.cell is not None:
            link = re.fullmatch(r"/models/([a-z0-9-]+)", dict(attrs).get("href", ""))
            if link:
                self.slug = link[1]

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append(" ".join(" ".join(self.cell).split()))
            self.cell = None
        if tag == "tr" and self.row:
            self.rows.append(self.row)
            if self.slug:
                self.model_links[self.row[0]] = self.slug


def normalized(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


class Scores:
    def __init__(self, models):
        self.aliases, self.by_model, self.defaults = {}, {}, {}
        for canonical, entry in models.items():
            for name in (canonical.split("/", 1)[-1], entry.get("name", "")):
                if name:
                    self.aliases.setdefault(normalized(name), set()).add(canonical)

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
        if model and isinstance(score, (int, float)):
            row = dict(group=group, test=test, score=score, **options)
            if effort:
                row["effort"] = effort
            self.by_model.setdefault(model, {})[(test, effort)] = row
            return model


def aa_public(page, scores, detail=False):
    version = re.search(r"Intelligence Index v(\d+(?:\.\d+)+)", page)
    if not version:
        raise ValueError("AA page has no index version")
    table = Tables()
    table.feed(page)
    default = next((r[1].lower() for r in table.rows if r[0] == "Default effort"), None)
    heading = "Intelligence" if detail else "Artificial Analysis Intelligence Index"
    start = next(i for i, row in enumerate(table.rows) if heading in row and row[0].startswith("Model"))
    column = table.rows[start].index(heading)
    matched = 0
    releases = set()
    for row in table.rows[start + 1:]:
        if len(row) <= column:
            continue
        name = row[0]
        if not detail:
            name = re.sub(r"\s*,\s*Default Fallback$", "", name, flags=re.I)
        model, effort = scores.resolve(name)
        if not detail and model and effort and table.model_links.get(row[0]):
            releases.add(table.model_links[row[0]])
        if detail and default and model:
            scores.defaults[model] = default
        if re.fullmatch(r"\d+(?:\.\d+)?", row[column]):
            model = scores.add(name, "", "reasoning", "aa:intelligence:" + version[1],
                               float(row[column]), tolerance=2)
            matched += bool(model)
    if not detail and not matched:
        raise ValueError("AA leaderboard contained no recognized model scores")
    return releases


def aa_api(key, scores):
    page = 1
    while True:
        data = json.loads(download(f"{AA}/api/v2/language/models/free?page={page}", {"x-api-key": key}))
        version = str(data["intelligence_index_version"])
        for row in data["data"]:
            # The API omits patch numbers. Do not count the same current index
            # twice when a public release table gives the full version.
            model, effort = scores.resolve(row["name"], row["model_creator"]["name"])
            test = "aa:intelligence:" + version
            if any(key.startswith(test + ".") and level == effort
                   for key, level in scores.by_model.get(model, {})):
                continue
            scores.add(row["name"], row["model_creator"]["name"], "reasoning",
                       test,
                       row["evaluations"].get("artificial_analysis_intelligence_index"), tolerance=2)
        if not data["pagination"]["has_more"]:
            return
        page += 1


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
    parser.add_argument("--aa-release", action="append", default=[])
    args = parser.parse_args()
    raw = download(MODELS)
    scores = Scores(json.loads(raw)["models"])
    key = os.getenv("AA_API_KEY")
    releases = aa_public(download(AA + "/leaderboards/models?deprecation=all").decode(), scores)
    releases.update(args.aa_release)
    def release_page(slug):
        if not re.fullmatch(r"[a-z0-9-]+", slug):
            parser.error("invalid AA release slug")
        return download(f"{AA}/models/{slug}").decode()
    with ThreadPoolExecutor(max_workers=4) as pool:
        for page in pool.map(release_page, sorted(releases)):
            aa_public(page, scores, detail=True)
    if key:
        aa_api(key, scores)
    arena(scores)
    payload = dict(benchmarks={k: list(v.values()) for k, v in sorted(scores.by_model.items())},
                   defaults=scores.defaults, sources={"Artificial Analysis": AA, "Arena (CC BY 4.0)": ARENA,
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
    print(f"Collected independent evaluations for {len(scores.by_model)} canonical models.")


if __name__ == "__main__":
    main()
