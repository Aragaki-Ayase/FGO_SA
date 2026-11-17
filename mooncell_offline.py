"""Turn MediaWiki XML exports into an offline SQLite catalog."""

import argparse
import bz2
import gzip
import json
import sqlite3
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote


SCHEMA = """
CREATE TABLE IF NOT EXISTS pages (
    page_id INTEGER PRIMARY KEY,
    namespace INTEGER NOT NULL,
    title TEXT NOT NULL,
    redirect TEXT,
    revision_id INTEGER NOT NULL,
    updated_at TEXT,
    model TEXT,
    wikitext TEXT,
    source_url TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS pages_title ON pages(title);
CREATE INDEX IF NOT EXISTS pages_namespace ON pages(namespace, title);
"""


def load_pages(path):
    opener = {".bz2": bz2.open, ".gz": gzip.open}.get(path.suffix.lower(), open)
    with opener(path, "rb") as stream:
        events = ET.iterparse(stream, events=("start", "end"))
        _, root = next(events)
        prefix = root.tag.partition("}")[0] + "}" if root.tag.startswith("{") else ""
        if root.tag != prefix + "mediawiki":
            raise ValueError(f"{path}: expected a MediaWiki XML export")
        depth = 1
        for event, node in events:
            if event == "start":
                depth += 1
                continue
            if depth == 2:
                if node.tag == prefix + "page":
                    yield read_page(node, prefix)
                root.remove(node)
            depth -= 1


def read_page(page, prefix):
    def get(node, key):
        return node.findtext(prefix + key)

    revisions = page.findall(prefix + "revision")
    if not revisions:
        raise ValueError("Page has no revision: " + str(get(page, "title")))
    latest = max(revisions, key=lambda r: int(get(r, "id")))
    title = get(page, "title")
    if not title:
        raise ValueError("Page has no title")
    redirect = page.find(prefix + "redirect")
    content = latest.find(prefix + "text")
    return (
        int(get(page, "id")), int(get(page, "ns")), title,
        redirect.get("title") if redirect is not None else None,
        int(get(latest, "id")), get(latest, "timestamp"), get(latest, "model"),
        None if content is None or "deleted" in content.attrib else (content.text or ""),
        "https://fgo.wiki/w/" + quote(title.replace(" ", "_"), safe=""),
    )


def import_files(db, paths):
    db.executescript(SCHEMA)
    count = 0
    with db:
        for path in paths:
            for page in load_pages(path):
                cursor = db.execute("""
                    INSERT INTO pages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(page_id) DO UPDATE SET
                        namespace=excluded.namespace, title=excluded.title,
                        redirect=excluded.redirect, revision_id=excluded.revision_id,
                        updated_at=excluded.updated_at, model=excluded.model,
                        wikitext=excluded.wikitext, source_url=excluded.source_url
                    WHERE excluded.revision_id >= pages.revision_id
                    AND (excluded.wikitext IS NOT NULL
                         OR pages.wikitext IS NULL
                         OR excluded.revision_id > pages.revision_id)
                """, page)
                count += cursor.rowcount
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=Path("mooncell.sqlite3"))
    commands = parser.add_subparsers(dest="command", required=True)
    importer = commands.add_parser("import", help="Import .xml, .xml.gz or .xml.bz2 files")
    importer.add_argument("files", nargs="+", type=Path)
    search = commands.add_parser("search", help="Search by title, or include source text")
    search.add_argument("query")
    search.add_argument("--body", action="store_true")
    show = commands.add_parser("show", help="Read a page by its exact title")
    show.add_argument("title")
    args = parser.parse_args()
    try:
        if args.command == "import":
            with sqlite3.connect(args.db) as db:
                count = import_files(db, args.files)
                print(f"Imported or updated {count} pages into {args.db}")
            return 0
        with sqlite3.connect(args.db.resolve().as_uri() + "?mode=ro", uri=True) as db:
            db.row_factory = sqlite3.Row
            if args.command == "search":
                body_clause = "OR instr(wikitext, ?) > 0" if args.body else ""
                params = (args.query,) * (2 if args.body else 1)
                rows = db.execute(f"""
                    SELECT page_id, title, namespace, redirect, source_url FROM pages
                    WHERE instr(title, ?) > 0 {body_clause}
                    ORDER BY namespace, title LIMIT 50
                """, params)
                result = [dict(row) for row in rows]
            else:
                row = db.execute("SELECT * FROM pages WHERE title = ?", (args.title,)).fetchone()
                if row is None:
                    print(f"Page not found: {args.title}", file=sys.stderr)
                    return 1
                result = dict(row)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, sqlite3.Error, ET.ParseError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
