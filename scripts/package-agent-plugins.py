"""Split a pinned repository ZIP into installable packages, retaining dependency manifests."""
import copy
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path

archive_path, metadata_path = sys.argv[1:3]
catalog_path = Path("src/worker/data/agent-plugins.json")
catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
previews = json.loads(Path(metadata_path).read_text(encoding="utf-8"))
with zipfile.ZipFile(archive_path) as archive:
    for preview in previews:
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as target:
            for entry in archive.infolist():
                parts = entry.filename.split("/", 1)
                if len(parts) != 2 or entry.is_dir():
                    continue
                relative = parts[1]
                dependency = len(relative.split("/")) == 3 and relative.startswith("plugins/") and relative.endswith(("/.app.json", "/.mcp.json"))
                if relative.startswith(preview["source"]["path"] + "/") or dependency:
                    copied = copy.copy(entry)
                    target.writestr(copied, archive.read(entry), compress_type=zipfile.ZIP_DEFLATED)
                    # zipfile supplies 0600 for zero attributes; restore the upstream metadata.
                    copied.external_attr = entry.external_attr
        data = output.getvalue()
        digest = hashlib.sha256(data).hexdigest()
        path = f"/agent-plugin-archives/{preview['key']}-{digest}.zip"
        if len(data) >= 25 * 1024 * 1024:
            raise ValueError("Plugin exceeds static asset limit")
        Path("public" + path).write_bytes(data)
        entry = next(e for e in catalog["entries"] if e["key"] == preview["key"])
        entry["archive"] = {"path": path, "bytes": len(data), "sha256": digest}
        entry["skill_count"] = sum(s.get("kind") != "command" for s in preview["skills"])
        entry["connector_count"] = len(preview["servers"])
        print(preview["name"], len(data))
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

