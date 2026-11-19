"""
Collect lightweight FGO CN story war index from Atlas Academy (basic_war.json)
enriched with JP release timestamps (JP basic_event.json), and download 5 category
banner images locally to app/public/assets/story/ for crisp offline Mooncell-style cards.
"""
import io
import json
import time
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
APP_DATA_DIR = ROOT / "app" / "public" / "data"
STORY_ASSETS_DIR = ROOT / "app" / "public" / "assets" / "story"
JST = timezone(timedelta(hours=9))


def fetch_json(url: str, retries: int = 3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 MooncellOfflineApp/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(0.8)


def fetch_bytes(url: str, retries: int = 3) -> bytes:
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 MooncellOfflineApp/1.0"})
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.read()
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(0.8)
    return b""


def classify_war(w: dict) -> str | None:
    wid = int(w.get("id", 0))
    flags = w.get("flags") or []
    event_id = int(w.get("eventId", 0))
    name = (w.get("name") or "").strip()
    long_name = (w.get("longName") or "").strip().replace("\n", " ")

    clean_label = long_name or name
    if not clean_label or clean_label in ("-", "—", "迦勒底之门"):
        if wid not in (14000,):
            return None

    if "mainScenario" in flags:
        if 100 <= wid < 200:
            return "part1"
        if 200 <= wid < 300:
            return "part15"
        if wid >= 40000 or "奏章" in clean_label or "Ordeal Call" in clean_label:
            return "ordeal_call"
        if wid >= 300:
            return "part2"
        return "part1"

    if event_id > 0:
        return "event"

    return None


def fmt_jst_date(ts: int) -> str:
    if not ts or ts <= 0:
        return ""
    return datetime.fromtimestamp(ts, tz=JST).strftime("%Y-%m-%d")


def download_category_banners():
    """
    Download 5 iconic official FGO chapter/event banner images (Mooncell 关卡配置 style)
    locally to app/public/assets/story/ as compressed WebP for instant offline rendering.
    """
    STORY_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    # Use official Atlas Academy CN/JP war banners & iconic backgrounds
    banner_sources = {
        "part1": [
            "https://static.atlasacademy.io/CN/Back/back10400.png",
            "https://static.atlasacademy.io/CN/Back/back10100.png",
        ],
        "part15": [
            "https://static.atlasacademy.io/CN/Back/back33100.png",
            "https://static.atlasacademy.io/CN/Back/back28100.png",
        ],
        "part2": [
            "https://static.atlasacademy.io/CN/Back/back96200.png",
            "https://static.atlasacademy.io/CN/Back/back92601.png",
        ],
        "ordeal_call": [
            "https://static.atlasacademy.io/CN/Back/back184300.png",
            "https://static.atlasacademy.io/CN/Back/back166700.png",
            "https://static.atlasacademy.io/CN/Back/back155900.png",
        ],
        "event": [
            "https://static.atlasacademy.io/CN/Back/back134500.png",
            "https://static.atlasacademy.io/CN/Back/back200400.png",
        ],
    }

    for cat, urls in banner_sources.items():
        out_path = STORY_ASSETS_DIR / f"cat_{cat}.webp"
        if out_path.exists() and out_path.stat().st_size > 2000:
            print(f"  banner {cat} already exists ({out_path.stat().st_size:,} bytes)", flush=True)
            continue
        ok = False
        for u in urls:
            try:
                raw = fetch_bytes(u, retries=2)
                if len(raw) < 1000:
                    continue
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                # 裁剪成宽屏横幅比例 (16:5) 贴合 Mooncell 关卡配置横幅风格
                w, h = im.size
                target_h = int(w * 0.36)
                if h > target_h:
                    top = (h - target_h) // 2
                    im = im.crop((0, top, w, top + target_h))
                im.thumbnail((720, 260))
                im.save(out_path, "WEBP", quality=80)
                print(f"  saved banner {out_path.name} ({out_path.stat().st_size:,} bytes) from {u}", flush=True)
                ok = True
                break
            except Exception as e:
                print(f"  skip {u}: {e}", flush=True)
        if not ok:
            print(f"  WARNING: failed to download banner for {cat}", flush=True)


def main():
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    print("1) Fetching Atlas Academy CN basic_war.json ...", flush=True)
    wars = fetch_json("https://api.atlasacademy.io/export/CN/basic_war.json")
    banner_map = {}

    print("2) Fetching Atlas Academy JP basic_event.json for JP release dates ...", flush=True)
    jp_events = fetch_json("https://api.atlasacademy.io/export/JP/basic_event.json")
    jp_event_start = {}
    for ev in jp_events or []:
        eid = int(ev.get("id", 0))
        st = int(ev.get("startedAt", 0))
        if eid and st > 0:
            jp_event_start[eid] = st
    print(f"   Loaded {len(jp_event_start)} JP event timestamps", flush=True)

    items = []
    for w in wars:
        cat = classify_war(w)
        if not cat:
            continue
        wid = int(w.get("id", 0))
        event_id = int(w.get("eventId", 0))
        name = (w.get("name") or "").strip().replace("\n", " ")
        long_name = (w.get("longName") or "").strip().replace("\n", " ")
        if name == "-":
            name = ""
        if long_name == "-":
            long_name = ""
        title = long_name or name
        if not title:
            continue

        start_jp_ts = jp_event_start.get(event_id, 0) if event_id > 0 else 0
        banner_url = (
            banner_map.get(wid)
            or (w.get("banner") or "").strip()
            or f"https://static.atlasacademy.io/CN/Banner/questboard_cap{wid}.png"
        )
        items.append({
            "id": wid,
            "eventId": event_id,
            "category": cat,
            "name": name or title,
            "longName": title,
            "banner": banner_url,
            "startJp": start_jp_ts,
            "startJpDate": fmt_jst_date(start_jp_ts),
        })

    main_items = [x for x in items if x["category"] != "event"]
    event_items = [x for x in items if x["category"] == "event"]
    main_items.sort(key=lambda x: x["id"])
    # 活动按日服实装时间/id倒序排列
    event_items.sort(key=lambda x: (x["startJp"], x["id"]), reverse=True)

    payload = {
        "generatedAt": time.strftime("%Y-%m-%d %H:%M"),
        "counts": {
            "total": len(main_items) + len(event_items),
            "main": len(main_items),
            "event": len(event_items),
        },
        "wars": main_items + event_items,
    }
    out_file = APP_DATA_DIR / "story_wars.json"
    out_file.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    matched_dates = sum(1 for x in event_items if x["startJpDate"])
    print(
        f"3) Saved {out_file.name}: {len(main_items)} main + {len(event_items)} event wars "
        f"({matched_dates}/{len(event_items)} with JP dates, {out_file.stat().st_size:,} bytes)",
        flush=True,
    )

    print("4) Downloading 5 category banner images ...", flush=True)
    download_category_banners()


if __name__ == "__main__":
    main()
