"""
Collect lightweight FGO CN story war index from Atlas Academy (basic_war.json)
enriched with JP release timestamps (JP basic_event.json), real chapter banner URLs,
and download 5 category banners + 31 main story chapter banners locally to
app/public/assets/story/ for instant, 100% accurate offline rendering.
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
WAR_BANNERS_DIR = STORY_ASSETS_DIR / "wars"
CST = timezone(timedelta(hours=8))
JST = timezone(timedelta(hours=9))

# Verified real banner filenames from /nice/CN/war/{id} (where warId != capId)
REAL_MAIN_BANNER_URL: dict[int, str] = {
    100: "https://static.atlasacademy.io/CN/Banner/questboard_cap100.png",
    101: "https://static.atlasacademy.io/CN/Banner/questboard_cap101.png",
    102: "https://static.atlasacademy.io/CN/Banner/questboard_cap102.png",
    103: "https://static.atlasacademy.io/CN/Banner/questboard_cap103.png",
    104: "https://static.atlasacademy.io/CN/Banner/questboard_cap104.png",
    105: "https://static.atlasacademy.io/CN/Banner/questboard_cap105.png",
    106: "https://static.atlasacademy.io/CN/Banner/questboard_cap106.png",
    107: "https://static.atlasacademy.io/CN/Banner/questboard_cap107.png",
    108: "https://static.atlasacademy.io/CN/Banner/questboard_cap108.png",
    201: "https://static.atlasacademy.io/CN/Banner/questboard_cap201.png",
    202: "https://static.atlasacademy.io/CN/Banner/questboard_cap202.png",
    203: "https://static.atlasacademy.io/CN/Banner/questboard_cap203.png",
    204: "https://static.atlasacademy.io/CN/Banner/questboard_cap204.png",
    300: "https://static.atlasacademy.io/CN/Banner/questboard_cap300.png",
    301: "https://static.atlasacademy.io/CN/Banner/questboard_cap301.png",
    302: "https://static.atlasacademy.io/CN/Banner/questboard_cap302.png",
    303: "https://static.atlasacademy.io/CN/Banner/questboard_cap304.png",
    304: "https://static.atlasacademy.io/CN/Banner/questboard_cap305.png",
    305: "https://static.atlasacademy.io/CN/Banner/questboard_cap307.png",
    306: "https://static.atlasacademy.io/CN/Banner/questboard_cap308.png",
    307: "https://static.atlasacademy.io/CN/Banner/questboard_cap309.png",
    308: "https://static.atlasacademy.io/CN/Banner/questboard_cap312.png",
    309: "https://static.atlasacademy.io/CN/Banner/questboard_cap313.png",
    310: "https://static.atlasacademy.io/CN/Banner/questboard_cap315.png",
    311: "https://static.atlasacademy.io/CN/Banner/questboard_cap317.png",
    400: "https://static.atlasacademy.io/CN/Banner/questboard_cap400.png",
    401: "https://static.atlasacademy.io/CN/Banner/questboard_cap401.png",
    402: "https://static.atlasacademy.io/CN/Banner/questboard_cap402.png",
    403: "https://static.atlasacademy.io/CN/Banner/questboard_cap403.png",
    404: "https://static.atlasacademy.io/CN/Banner/questboard_cap405.png",
    405: "https://static.atlasacademy.io/CN/Banner/questboard_cap406.png",
}


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
        return None

    if "mainScenario" in flags:
        # 剔除 11000(主线记录1)、12000(主线记录1.5)、13000(主线记录2)、14000(奏章总外壳) 及 40201~40501 空白地图容器
        if wid >= 10000:
            return None
        if 100 <= wid < 200:
            return "part1"
        if 200 <= wid < 300:
            return "part15"
        if 400 <= wid < 500 or "奏章" in clean_label or "Ordeal Call" in clean_label:
            return "ordeal_call"
        if 300 <= wid < 400:
            return "part2"
        return "part1"

    if event_id > 0:
        return "event"

    return None


def fmt_cst_date(ts: int) -> str:
    if not ts or ts <= 0:
        return ""
    return datetime.fromtimestamp(ts, tz=CST).strftime("%Y-%m-%d")


def fmt_jst_date(ts: int) -> str:
    if not ts or ts <= 0:
        return ""
    return datetime.fromtimestamp(ts, tz=JST).strftime("%Y-%m-%d")


def download_category_banners():
    STORY_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
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
        ],
        "event": [
            "https://static.atlasacademy.io/CN/Back/back134500.png",
            "https://static.atlasacademy.io/CN/Back/back200400.png",
        ],
    }

    for cat, urls in banner_sources.items():
        out_path = STORY_ASSETS_DIR / f"cat_{cat}.webp"
        if out_path.exists() and out_path.stat().st_size > 2000:
            continue
        for u in urls:
            try:
                raw = fetch_bytes(u, retries=2)
                if len(raw) < 1000:
                    continue
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                w, h = im.size
                target_h = int(w * 0.36)
                if h > target_h:
                    top = (h - target_h) // 2
                    im = im.crop((0, top, w, top + target_h))
                im.thumbnail((720, 260))
                im.save(out_path, "WEBP", quality=80)
                print(f"  saved category banner {out_path.name}", flush=True)
                break
            except Exception:
                pass


def download_main_war_banners(main_items: list[dict]):
    """
    Download all 31 main story chapter banners locally as crisp WebP with alpha channel
    so they never suffer from remote network timeouts or wrong mappings.
    """
    WAR_BANNERS_DIR.mkdir(parents=True, exist_ok=True)
    for item in main_items:
        wid = item["id"]
        remote_url = REAL_MAIN_BANNER_URL.get(
            wid, f"https://static.atlasacademy.io/CN/Banner/questboard_cap{wid}.png"
        )
        local_rel = f"./assets/story/wars/war_{wid}.webp"
        out_path = WAR_BANNERS_DIR / f"war_{wid}.webp"
        if not (out_path.exists() and out_path.stat().st_size > 1000):
            try:
                raw = fetch_bytes(remote_url, retries=3)
                im = Image.open(io.BytesIO(raw))
                im.save(out_path, "WEBP", quality=88)
                print(f"  saved war_{wid}.webp ({out_path.stat().st_size:,} bytes) <- {remote_url}", flush=True)
            except Exception as e:
                print(f"  WARN war_{wid}: {e}", flush=True)
        if out_path.exists() and out_path.stat().st_size > 1000:
            item["banner"] = local_rel
        else:
            item["banner"] = remote_url


def main():
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    print("1) Fetching Atlas Academy CN basic_war.json ...", flush=True)
    wars = fetch_json("https://api.atlasacademy.io/export/CN/basic_war.json")

    print("2) Fetching Atlas Academy CN & JP basic_event.json for release dates ...", flush=True)
    cn_events = fetch_json("https://api.atlasacademy.io/export/CN/basic_event.json")
    jp_events = fetch_json("https://api.atlasacademy.io/export/JP/basic_event.json")
    cn_event_start = {}
    for ev in cn_events or []:
        eid = int(ev.get("id", 0))
        st = int(ev.get("startedAt", 0))
        if eid and st > 0:
            cn_event_start[eid] = st
    jp_event_start = {}
    for ev in jp_events or []:
        eid = int(ev.get("id", 0))
        st = int(ev.get("startedAt", 0))
        if eid and st > 0:
            jp_event_start[eid] = st

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

        start_cn_ts = cn_event_start.get(event_id, 0) if event_id > 0 else 0
        start_jp_ts = jp_event_start.get(event_id, 0) if event_id > 0 else 0
        banner_url = REAL_MAIN_BANNER_URL.get(
            wid,
            (w.get("banner") or "").strip()
            or (f"https://static.atlasacademy.io/CN/Banner/questboard_cap{wid}.png" if cat != "event" else ""),
        )
        items.append({
            "id": wid,
            "eventId": event_id,
            "category": cat,
            "name": name or title,
            "longName": title,
            "banner": banner_url,
            "startCn": start_cn_ts,
            "startCnDate": fmt_cst_date(start_cn_ts),
            "startJp": start_jp_ts,
            "startJpDate": fmt_jst_date(start_jp_ts),
        })

    main_items = [x for x in items if x["category"] != "event"]
    event_items = [x for x in items if x["category"] == "event"]
    main_items.sort(key=lambda x: x["id"])
    # 国服已实装活动优先按国服开启时间降序排列（最新在最上方）；国服暂未实装的日服活动排在末尾按日服时间降序
    event_items.sort(
        key=lambda x: (1 if x["startCn"] > 0 else 0, x["startCn"], x["startJp"], x["id"]),
        reverse=True,
    )

    print("3) Downloading 5 category banners & 31 main story chapter banners ...", flush=True)
    download_category_banners()
    download_main_war_banners(main_items)

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
    print(
        f"4) Saved {out_file.name}: {len(main_items)} main + {len(event_items)} event wars "
        f"({out_file.stat().st_size:,} bytes)",
        flush=True,
    )


if __name__ == "__main__":
    main()
