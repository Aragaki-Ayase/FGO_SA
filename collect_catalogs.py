"""Download the three Mooncell catalogs, with resumable raw detail pages."""
import json
import re
import sqlite3
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlencode, quote
from mooncell_offline import SCHEMA

OUT = Path("data")
SOURCES = {"servant": "英灵图鉴/数据", "craft_essence": "礼装图鉴/数据",
           "command_code": "指令纹章图鉴/数据"}


def request(**params):
    url = "https://fgo.wiki/api.php?" + urlencode(
        dict(format="json", formatversion=2, maxlag=5, **params))
    for attempt in range(5):
        time.sleep(1 if attempt == 0 else min(30, 2 ** attempt))
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MooncellOffline/0.1 (personal offline catalog)"})
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.load(response)
            if "error" in result:
                raise RuntimeError(result["error"])
            return result
        except Exception:
            if attempt == 4:
                raise


def fetch(titles):
    return request(action="query", titles="|".join(titles), prop="revisions",
                   rvprop="ids|timestamp|content", rvslots="main")


def save(db, page):
    if "missing" in page or "revisions" not in page:
        return
    rev = page["revisions"][0]
    slot = rev["slots"]["main"]
    text = slot["content"]
    redirect = re.match(r"\s*#(?:REDIRECT|重定向)\s*\[\[([^\]]+)\]\]", text, re.I)
    db.execute("INSERT OR REPLACE INTO pages VALUES (?,?,?,?,?,?,?,?,?)",
               (page["pageid"], page["ns"], page["title"],
                redirect.group(1) if redirect else None, rev["revid"],
                rev["timestamp"], slot["contentmodel"], text,
                "https://fgo.wiki/w/" + quote(page["title"], safe="")))


def main():
    OUT.mkdir(exist_ok=True)
    db = sqlite3.connect(OUT / "mooncell.sqlite3")
    db.executescript(SCHEMA + """
        CREATE TABLE IF NOT EXISTS catalog (
          kind TEXT, number INTEGER, name TEXT, title TEXT, fields_json TEXT,
          PRIMARY KEY(kind,number));
    """)
    sources = fetch(list(SOURCES.values()))
    (OUT / "catalog-sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    pages = {p["title"]: p for p in sources["query"]["pages"]}
    export = {}
    with db:
        for kind, title in SOURCES.items():
            page = pages[title]
            save(db, page)
            records = []
            for block in re.split(r"(?m)(?=^id=)", page["revisions"][0]["slots"]["main"]["content"]):
                if not block.startswith("id="):
                    continue
                fields = {}
                for line in block.splitlines():
                    key, sep, value = line.partition("=")
                    if sep:
                        fields[key.strip()] = value.strip()
                number = int(fields["id"])
                target = fields.get("name_link") or fields.get("name_cn") or fields["name"]
                record = dict(kind=kind, number=number, title=target, fields=fields)
                records.append(record)
            if len({r["number"] for r in records}) != len(records):
                raise ValueError("Duplicate catalog numbers: " + kind)
            db.execute("DELETE FROM catalog WHERE kind=?", (kind,))
            for r in records:
                f = r["fields"]
                db.execute("INSERT INTO catalog VALUES (?,?,?,?,?)",
                           (kind, r["number"], f.get("name_cn") or f.get("name"), r["title"],
                            json.dumps(f, ensure_ascii=False)))
            export[kind] = records
            print(kind, len(records), flush=True)
    (OUT / "catalogs.json").write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
    titles = sorted({r["title"] for records in export.values() for r in records})
    present = {row[0] for row in db.execute("SELECT title FROM pages")}
    pending = [title for title in titles if title not in present]
    for offset in range(0, len(pending), 20):
        result = fetch(pending[offset:offset + 20])
        with db:
            for p in result["query"]["pages"]:
                save(db, p)
            for change in result["query"].get("normalized", []):
                db.execute("UPDATE catalog SET title=? WHERE title=?",
                           (change["to"], change["from"]))
        print("details", min(offset + 20, len(pending)), "/", len(pending), flush=True)
    attempted = set()
    while True:
        targets = {row[0].split("#")[0].replace("_", " ").lstrip(":") for row in db.execute(
            "SELECT redirect FROM pages WHERE redirect IS NOT NULL")}
        targets = sorted(t for t in targets if t and t not in attempted and not db.execute(
            "SELECT 1 FROM pages WHERE title=?", (t,)).fetchone())
        if not targets:
            break
        for offset in range(0, len(targets), 20):
            batch = targets[offset:offset + 20]
            attempted.update(batch)
            result = fetch(batch)
            with db:
                for p in result["query"]["pages"]:
                    save(db, p)
            print("redirect targets", offset + len(batch), "/", len(targets), flush=True)
    missing = [r[0] for r in db.execute(
        "SELECT DISTINCT c.title FROM catalog c LEFT JOIN pages p ON p.title=c.title WHERE p.page_id IS NULL")]
    for records in export.values():
        for record in records:
            record["title"] = db.execute("SELECT title FROM catalog WHERE kind=? AND number=?",
                                        (record["kind"], record["number"])).fetchone()[0]
    (OUT / "catalogs.json").write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
    unresolved = [t for t in attempted if not db.execute("SELECT 1 FROM pages WHERE title=?", (t,)).fetchone()]
    report = dict(counts={k: len(v) for k, v in export.items()}, missing_titles=missing,
                  unresolved_redirects=sorted(unresolved),
                  detail_format="wikitext", images_downloaded=False)
    (OUT / "catalog-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False), flush=True)
    db.close()


if __name__ == "__main__":
    main()
