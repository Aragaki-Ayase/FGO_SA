"""
Cloud catalog updater & manifest generator for GitHub Actions (Plan 1).
1. Incrementally syncs new/updated Servants, Craft Essences, Voices, Mystic Codes,
   Costumes, Items & Drop Rates into data/mooncell.sqlite3 (if SQLite exists or --full).
2. Rebuilds structured JSON data in app/public/data/ (catalog_summary, servants chunks,
   ces chunks, extras_catalog, events_banners, story_wars).
3. Generates app/public/data/cloud_manifest.json with per-file short SHA-256 hashes so
   the mobile App only downloads changed chunks when clicking "更新数据".
"""
import argparse
import hashlib
import json
import sqlite3
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlencode

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
            content = revs[0].get("slots", {}).get("main", {}).get("content", "")
            results.append({
                "pageid": int(p.get("pageid", 0)),
                "title": p.get("title", ""),
                "revid": int(revs[0].get("revid", 0)),
                "timestamp": revs[0].get("timestamp", ""),
                "content": content,
            })
        time.sleep(0.35)
    return results


def sync_sqlite_incremental() -> bool:
    """
    Incrementally update data/mooncell.sqlite3 with any new/modified Servant, CE,
    Voice, and Index pages from Mooncell. Returns True if SQLite is available.
    """
    if not DB_PATH.exists():
        print("SQLite DB not found locally; skipping SQLite servant/CE incremental sync.", flush=True)
        return False

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    def upsert_page(p: dict):
        cur.execute(
            """
            INSERT INTO pages(title, pageid, revid, timestamp, content)
            VALUES(?, ?, ?, ?, ?)
            ON CONFLICT(title) DO UPDATE SET
              pageid=excluded.pageid,
              revid=excluded.revid,
              timestamp=excluded.timestamp,
              content=excluded.content
            """,
            (p["title"], p["pageid"], p["revid"], p["timestamp"], p["content"]),
        )

    print("1) Checking Mooncell catalog indexes (英灵图鉴/数据 & 礼装图鉴/数据)...", flush=True)
    idx_pages = fetch_pages_batch(["英灵图鉴/数据", "礼装图鉴/数据"])
    svt_titles = []
    ce_titles = []
    for p in idx_pages:
        upsert_page(p)
        blocks = parse_catalog_blocks(p["content"])
        if p["title"] == "英灵图鉴/数据":
            svt_titles = [b.get("name_link") or b.get("name_cn") or b.get("name") for b in blocks]
        elif p["title"] == "礼装图鉴/数据":
            ce_titles = [b.get("name_link") or b.get("name") for b in blocks]
    conn.commit()

    existing_titles = {row[0] for row in cur.execute("SELECT title FROM pages").fetchall()}
    missing_svts = [t for t in svt_titles if t and t not in existing_titles]
    missing_ces = [t for t in ce_titles if t and t not in existing_titles]
    missing_voices = [f"{t}/语音" for t in svt_titles if t and f"{t}/语音" not in existing_titles]

    # Also refresh recent changes (last 50 edits in main namespace) that already exist in our DB
    rc = api_get_json({
        "action": "query",
        "list": "recentchanges",
        "rcnamespace": "0",
        "rclimit": "50",
        "rcprop": "title",
    })
    rc_titles = list({
        item["title"]
        for item in rc.get("query", {}).get("recentchanges", [])
        if item.get("title") in existing_titles
    })

    to_fetch = list(dict.fromkeys(missing_svts + missing_ces + missing_voices[:30] + rc_titles))
    print(
        f"   Missing svts={len(missing_svts)}, ces={len(missing_ces)}, "
        f"voices={len(missing_voices)}, recent_refresh={len(rc_titles)} -> fetching {len(to_fetch)} pages",
        flush=True,
    )
    if to_fetch:
        fetched = fetch_pages_batch(to_fetch)
        for p in fetched:
            upsert_page(p)
        conn.commit()
        print(f"   Upserted {len(fetched)} pages into SQLite.", flush=True)

    conn.close()
    return True


def run_step(cmd: list[str]):
    print(f">>> Running: {' '.join(cmd)}", flush=True)
    subprocess.run(cmd, cwd=ROOT, check=True)


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
    args = parser.parse_args()

    if args.manifest_only:
        build_cloud_manifest()
        return

    has_sqlite = sync_sqlite_incremental()
    if has_sqlite:
        run_step([sys.executable, "-X", "utf8", "collect_extras.py"])
        run_step([sys.executable, "-X", "utf8", "build_app_data.py"])
        run_step([sys.executable, "-X", "utf8", "build_extras_data.py"])

    run_step([sys.executable, "-X", "utf8", "collect_events_banners.py"])
    run_step([sys.executable, "-X", "utf8", "collect_story_wars.py"])
    build_cloud_manifest()


if __name__ == "__main__":
    main()
