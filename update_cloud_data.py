"""
Cloud catalog updater & manifest generator for GitHub Actions (Plan 1).
1. Incrementally syncs new AND revised Servants, Voices, Craft Essences, Core Templates,
   Mystic Codes, Costumes, Items & Drop Rates into data/mooncell.sqlite3
   using full batch revision_id (revid) comparison (not just last 50 recentchanges).
2. Rebuilds structured JSON data in app/public/data/ (catalog_summary, servants chunks,
   ces chunks, extras_catalog, events_banners, story_wars).
3. Generates app/public/data/cloud_manifest.json with per-file short SHA-256 hashes so
   the mobile App only downloads changed chunks when clicking "更新数据".
"""
import argparse
import hashlib
import json
import re
import sqlite3
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlencode, quote

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "mooncell.sqlite3"
APP_DATA_DIR = ROOT / "app" / "public" / "data"

UA = {"User-Agent": "MooncellOfflineCloudSync/1.0"}


def api_get_json(params: dict, retries: int = 3) -> dict:
    url = "https://fgo.wiki/api.php?" + urlencode({**params, "format": "json", "formatversion": 2})
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.load(resp)
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(1.0 * (i + 1))
    return {}


def parse_catalog_blocks(raw: str) -> list[dict]:
    out = []
    cur = {}
    for line in raw.splitlines():
        if line.startswith("id="):
            if cur.get("id"):
                out.append(cur)
            cur = {}
        if "=" in line:
            k, v = line.split("=", 1)
            cur[k.strip()] = v.strip()
    if cur.get("id"):
        out.append(cur)
    return out


def fetch_pages_batch(titles: list[str]) -> list[dict]:
    results = []
    batch_size = 25
    for i in range(0, len(titles), batch_size):
        chunk = titles[i : i + batch_size]
        data = api_get_json({
            "action": "query",
            "titles": "|".join(chunk),
            "prop": "revisions",
            "rvprop": "ids|timestamp|content",
            "rvslots": "main",
        })
        for p in data.get("query", {}).get("pages", []):
            if p.get("missing"):
                continue
            revs = p.get("revisions") or []
            if not revs:
                continue
            slot = revs[0].get("slots", {}).get("main", {})
            content = slot.get("content", "")
            m_redir = re.match(r"\s*#(?:REDIRECT|重定向)\s*\[\[([^\]]+)\]\]", content, re.I)
            results.append({
                "page_id": int(p.get("pageid", 0)),
                "namespace": int(p.get("ns", 0)),
                "title": p.get("title", ""),
                "redirect": m_redir.group(1) if m_redir else None,
                "revision_id": int(revs[0].get("revid", 0)),
                "updated_at": revs[0].get("timestamp", ""),
                "model": slot.get("contentmodel", "wikitext"),
                "wikitext": content,
                "source_url": "https://fgo.wiki/w/" + quote(p.get("title", ""), safe=""),
            })
        time.sleep(0.3)
    return results


def fetch_latest_revids(titles: list[str]) -> tuple[dict[str, int], dict[str, str]]:
    """
    Fetch latest revision_id for a list of page titles in batches of 50 (ids only, no wikitext).
    Returns (revid_by_canonical_title, normalized_from_to_map).
    """
    revids: dict[str, int] = {}
    norm_map: dict[str, str] = {}
    unique_titles = list(dict.fromkeys(t for t in titles if t))
    batch_size = 50
    for i in range(0, len(unique_titles), batch_size):
        chunk = unique_titles[i : i + batch_size]
        data = api_get_json({
            "action": "query",
            "titles": "|".join(chunk),
            "prop": "revisions",
            "rvprop": "ids",
        })
        q = data.get("query", {})
        for n in q.get("normalized", []):
            if n.get("from") and n.get("to"):
                norm_map[n["from"]] = n["to"]
        for p in q.get("pages", []):
            if p.get("missing"):
                continue
            revs = p.get("revisions") or []
            if p.get("title") and revs:
                revids[p["title"]] = int(revs[0].get("revid", 0))
        if i + batch_size < len(unique_titles):
            time.sleep(0.25)
    return revids, norm_map


def upsert_page(cur: sqlite3.Cursor, p: dict):
    cur.execute(
        "INSERT OR REPLACE INTO pages VALUES (?,?,?,?,?,?,?,?,?)",
        (
            p["page_id"],
            p["namespace"],
            p["title"],
            p["redirect"],
            p["revision_id"],
            p["updated_at"],
            p["model"],
            p["wikitext"],
            p["source_url"],
        ),
    )


def update_catalog_table(conn: sqlite3.Connection, kind: str, blocks: list[dict]):
    records = []
    for fields in blocks:
        num_str = fields.get("id", "")
        if not num_str.isdigit():
            continue
        num = int(num_str)
        target = fields.get("name_link") or fields.get("name_cn") or fields.get("name") or ""
        name = fields.get("name_cn") or fields.get("name") or target
        records.append((kind, num, name, target, json.dumps(fields, ensure_ascii=False)))

    with conn:
        conn.execute("DELETE FROM catalog WHERE kind=?", (kind,))
        conn.executemany("INSERT INTO catalog VALUES (?,?,?,?,?)", records)
    print(f"   Updated catalog table kind='{kind}': {len(records)} rows", flush=True)


def run_step(cmd: list[str]):
    print(f">>> Running: {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, cwd=ROOT, check=True)


def sync_sqlite_incremental(check_all_ces: bool = False, dry_run: bool = False) -> bool:
    """
    Incrementally update data/mooncell.sqlite3 with any new or revised Servant, Voice,
    Craft Essence, and Core Template pages from Mooncell using full revid comparison.
    Returns True if SQLite is available.
    """
    if not DB_PATH.exists():
        manifest_path = ROOT / "offline-data" / "manifest.json"
        if manifest_path.exists():
            print("SQLite DB not found locally; restoring baseline from offline-data/ ...", flush=True)
            run_step([sys.executable, "-X", "utf8", "restore_data.py"])
        else:
            print("SQLite DB not found locally; skipping SQLite servant/CE incremental sync.", flush=True)
            return False

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("1) Checking Mooncell catalog indexes (英灵图鉴/数据, 礼装图鉴/数据, 技能一览/追加技能)...", flush=True)
    idx_pages = fetch_pages_batch(["英灵图鉴/数据", "礼装图鉴/数据", "技能一览/追加技能"])
    svt_blocks: list[dict] = []
    ce_blocks: list[dict] = []
    for p in idx_pages:
        if p["title"] == "英灵图鉴/数据":
            svt_blocks = parse_catalog_blocks(p["wikitext"])
        elif p["title"] == "礼装图鉴/数据":
            ce_blocks = parse_catalog_blocks(p["wikitext"])

    svt_titles = [
        b.get("name_link") or b.get("name_cn") or b.get("name")
        for b in svt_blocks
        if b.get("name_link") or b.get("name_cn") or b.get("name")
    ]
    ce_titles = [
        b.get("name_link") or b.get("name")
        for b in ce_blocks
        if b.get("name_link") or b.get("name")
    ]

    if not dry_run:
        with conn:
            for p in idx_pages:
                upsert_page(conn.cursor(), p)
        if svt_blocks:
            update_catalog_table(conn, "servant", svt_blocks)
        if ce_blocks:
            update_catalog_table(conn, "craft_essence", ce_blocks)

    local_revids = {
        row[0]: int(row[1])
        for row in cur.execute("SELECT title, revision_id FROM pages").fetchall()
    }
    print(f"   Local SQLite has {len(local_revids)} pages; remote catalog svts={len(svt_titles)}, ces={len(ce_titles)}", flush=True)

    def diff_titles(titles: list[str]) -> tuple[list[str], list[str]]:
        revids, norm_map = fetch_latest_revids(titles)
        missing: list[str] = []
        changed: list[str] = []
        for t in titles:
            canon = norm_map.get(t, t)
            remote_rev = revids.get(canon, 0)
            if not remote_rev:
                continue
            local_rev = local_revids.get(canon) or local_revids.get(t)
            if local_rev is None:
                missing.append(canon)
            elif remote_rev != local_rev:
                changed.append(canon)
        return list(dict.fromkeys(missing)), list(dict.fromkeys(changed))

    print("2) Comparing all Servant page revids (~487 servants, batched by 50)...", flush=True)
    missing_svts, changed_svts = diff_titles(svt_titles)

    print("3) Comparing all Servant Voice subpage revids...", flush=True)
    voice_titles = [f"{t}/语音" for t in svt_titles]
    missing_voices, changed_voices = diff_titles(voice_titles)

    ce_title_set = set(ce_titles)
    missing_ces = [t for t in ce_titles if t not in local_revids]
    changed_ces: list[str] = []
    if check_all_ces:
        print("4) Comparing ALL Craft Essence page revids (--check-all-ces)...", flush=True)
        m_ces, changed_ces = diff_titles(ce_titles)
        missing_ces = list(dict.fromkeys(missing_ces + m_ces))
    else:
        print("4) Checking recent 500 changes for Craft Essences / Core pages...", flush=True)
        rc = api_get_json({
            "action": "query",
            "list": "recentchanges",
            "rcnamespace": "0",
            "rclimit": "500",
            "rcprop": "title|ids",
        })
        for item in rc.get("query", {}).get("recentchanges", []):
            title = item.get("title", "")
            rc_rev = int(item.get("revid", 0))
            if title in ce_title_set and title in local_revids and rc_rev and rc_rev != local_revids[title]:
                if title not in changed_ces:
                    changed_ces.append(title)

    print(
        f"   Summary -> Servants: +{len(missing_svts)} new, {len(changed_svts)} revised {changed_svts[:10]} | "
        f"Voices: +{len(missing_voices)} new, {len(changed_voices)} revised | "
        f"CEs: +{len(missing_ces)} new, {len(changed_ces)} revised {changed_ces[:10]}",
        flush=True,
    )

    to_fetch = list(dict.fromkeys(
        missing_svts + changed_svts + missing_voices + changed_voices + missing_ces + changed_ces
    ))
    print(f"   Total pages queued to fetch: {len(to_fetch)}", flush=True)

    if dry_run:
        print("   --check-only active: skipped writing SQLite and rebuilding JSONs.", flush=True)
        conn.close()
        return True

    if to_fetch:
        fetched = fetch_pages_batch(to_fetch)
        with conn:
            c = conn.cursor()
            for p in fetched:
                upsert_page(c, p)
        print(f"   Upserted {len(fetched)} pages into SQLite.", flush=True)

    conn.close()
    return True


def sha256_short(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def build_cloud_manifest():
    """
    Generate app/public/data/cloud_manifest.json with per-file hashes and summary counts.
    """
    files: dict[str, str] = {}
    for rel in [
        "catalog_summary.json",
        "extras_catalog.json",
        "events_banners.json",
        "story_wars.json",
        "servant_stories.json",
    ]:
        p = APP_DATA_DIR / rel
        if p.exists():
            files[rel] = sha256_short(p)

    for sub in ("servants", "ces"):
        sub_dir = APP_DATA_DIR / sub
        if sub_dir.exists():
            for p in sorted(sub_dir.glob("*.json")):
                rel = f"{sub}/{p.name}"
                files[rel] = sha256_short(p)

    counts = {}
    summary_path = APP_DATA_DIR / "catalog_summary.json"
    if summary_path.exists():
        s = json.loads(summary_path.read_text(encoding="utf-8"))
        counts["servant"] = s.get("counts", {}).get("servant", 0)
        counts["craftEssence"] = s.get("counts", {}).get("craftEssence", 0)

    extras_path = APP_DATA_DIR / "extras_catalog.json"
    if extras_path.exists():
        ex = json.loads(extras_path.read_text(encoding="utf-8"))
        counts["mysticCode"] = ex.get("counts", {}).get("mysticCodes", 0)
        counts["costume"] = ex.get("counts", {}).get("costumes", 0)
        counts["item"] = ex.get("counts", {}).get("items", 0)

    ev_path = APP_DATA_DIR / "events_banners.json"
    if ev_path.exists():
        ev = json.loads(ev_path.read_text(encoding="utf-8"))
        counts["events"] = ev.get("counts", {}).get("events", 0)
        counts["banners"] = ev.get("counts", {}).get("banners", 0)

    st_path = APP_DATA_DIR / "story_wars.json"
    if st_path.exists():
        st = json.loads(st_path.read_text(encoding="utf-8"))
        counts["storyWars"] = st.get("counts", {}).get("total", 0)

    svt_st_path = APP_DATA_DIR / "servant_stories.json"
    if svt_st_path.exists():
        svt_st = json.loads(svt_st_path.read_text(encoding="utf-8"))
        counts["interludeServants"] = svt_st.get("counts", {}).get("interludeServants", 0)
        counts["valentineServants"] = svt_st.get("counts", {}).get("valentineServants", 0)

    manifest = {
        "version": time.strftime("%Y%m%d%H%M"),
        "updatedAt": time.strftime("%Y-%m-%d %H:%M"),
        "counts": counts,
        "files": files,
    }
    out = APP_DATA_DIR / "cloud_manifest.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Generated {out.name}: {len(files)} tracked files, version={manifest['version']}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest-only", action="store_true", help="Only regenerate cloud_manifest.json")
    parser.add_argument("--check-only", action="store_true", help="Read-only revid diff check without modifying SQLite or JSONs")
    parser.add_argument("--check-all-ces", action="store_true", help="Also compare revids for all Craft Essence pages")
    args = parser.parse_args()

    if args.manifest_only:
        build_cloud_manifest()
        return

    if args.check_only:
        sync_sqlite_incremental(check_all_ces=args.check_all_ces, dry_run=True)
        return

    has_sqlite = sync_sqlite_incremental(check_all_ces=args.check_all_ces, dry_run=False)
    if has_sqlite:
        run_step([sys.executable, "-X", "utf8", "collect_extras.py"])
        run_step([sys.executable, "-X", "utf8", "build_app_data.py"])
        run_step([sys.executable, "-X", "utf8", "build_extras_data.py"])

    run_step([sys.executable, "-X", "utf8", "collect_events_banners.py"])
    run_step([sys.executable, "-X", "utf8", "collect_story_wars.py"])
    run_step([sys.executable, "-X", "utf8", "collect_servant_stories.py"])
    build_cloud_manifest()


if __name__ == "__main__":
    main()
