"""
Fetch all Mooncell Events (活动一览) and Summon Banners (卡池一览) via SMW action=ask API,
save raw snapshot to data/events_banners_raw.json, and build app/public/data/events_banners.json.
"""
import argparse
import hashlib
import json
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlencode, quote

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
APP_DATA_DIR = ROOT / "app" / "public" / "data"


def media_url(filename: str, thumb_width: int | None = None) -> str:
    filename = (filename or "").strip().replace(" ", "_")
    if not filename:
        return ""
    if filename.startswith("文件:") or filename.startswith("File:"):
        filename = filename.split(":", 1)[1].strip()
    if not filename:
        return ""
    filename = filename[0].upper() + filename[1:]
    h = hashlib.md5(filename.encode("utf-8")).hexdigest()
    q = quote(filename, safe="")
    if thumb_width:
        return f"https://media.fgo.wiki/thumb/{h[0]}/{h[:2]}/{q}/{thumb_width}px-{q}"
    return f"https://media.fgo.wiki/{h[0]}/{h[:2]}/{q}"


def smw_ask_all(query_base: str, page_size: int = 400, max_pages: int = 8) -> dict:
    all_results = {}
    for page in range(max_pages):
        offset = page * page_size
        q = f"{query_base}|limit={page_size}|offset={offset}"
        url = "https://fgo.wiki/api.php?" + urlencode({
            "action": "ask",
            "query": q,
            "format": "json",
            "formatversion": 2,
        })
        req = urllib.request.Request(url, headers={"User-Agent": "MooncellOffline/0.1"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.load(resp)
        results = data.get("query", {}).get("results", {})
        if not results or not isinstance(results, dict):
            break
        all_results.update(results)
        print(f"  SMW offset={offset} got {len(results)} (total={len(all_results)})", flush=True)
        if len(results) < page_size:
            break
        time.sleep(0.35)
    return all_results


def first_str(arr) -> str:
    if not arr:
        return ""
    v = arr[0]
    if isinstance(v, dict):
        return str(v.get("fulltext") or v.get("raw") or "")
    return str(v)


def first_ts(arr) -> int:
    if not arr:
        return 0
    v = arr[0]
    if isinstance(v, dict) and v.get("timestamp"):
        try:
            return int(v["timestamp"])
        except ValueError:
            return 0
    return 0


def first_bool(arr) -> bool:
    s = first_str(arr).strip().lower()
    return s in ("t", "true", "1", "yes", "是")


def list_titles(arr) -> list[str]:
    out = []
    for v in (arr or []):
        if isinstance(v, dict):
            t = str(v.get("fulltext") or "").strip()
        else:
            t = str(v).strip()
        if t and t not in out:
            out.append(t)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--from-raw",
        action="store_true",
        help="Parse from local data/events_banners_raw.json without fetching remote API",
    )
    args = parser.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = DATA_DIR / "events_banners_raw.json"

    if args.from_raw and raw_path.exists():
        print(f"Loading raw snapshot from {raw_path} ...", flush=True)
        raw_obj = json.loads(raw_path.read_text(encoding="utf-8"))
        events_raw = raw_obj.get("events", {})
        banners_raw = raw_obj.get("banners", {})
    else:
        print("1) Fetching Events (活动一览)...", flush=True)
        events_raw = smw_ask_all(
            "[[分类:有活动信息的页面]][[EventType::Event||Campaign||Other]]"
            "|?EventNameCN|?EventNameJP|?EventStartCN|?EventEndCN|?EventStartJP|?EventEndJP"
            "|?EventImageCN|?EventImageJP|?EventType|?EventRecentServer"
            "|sort=EventStartJP|order=desc"
        )

        print("2) Fetching Summon Banners (卡池一览)...", flush=True)
        banners_raw = smw_ask_all(
            "[[SummonStartJP::+]]"
            "|?SummonTitleCN|?SummonTitleJP|?SummonImage|?SummonImageCN|?SummonImageJP"
            "|?SummonStartCN|?SummonEndCN|?SummonStartJP|?SummonEndJP"
            "|?推荐召唤从者|?推荐召唤礼装|?SummonLuckybag"
            "|sort=SummonStartJP|order=desc",
            page_size=400,
            max_pages=6,
        )

        raw_path.write_text(
            json.dumps({"events": events_raw, "banners": banners_raw}, ensure_ascii=False),
            encoding="utf-8",
        )

    # Parse Events
    events = []
    for page_title, obj in events_raw.items():
        po = obj.get("printouts", {})
        name_cn = first_str(po.get("EventNameCN")) or page_title
        name_jp = first_str(po.get("EventNameJP"))
        start_cn = first_ts(po.get("EventStartCN"))
        end_cn = first_ts(po.get("EventEndCN"))
        start_jp = first_ts(po.get("EventStartJP"))
        end_jp = first_ts(po.get("EventEndJP"))
        img_cn = first_str(po.get("EventImageCN"))
        img_jp = first_str(po.get("EventImageJP"))
        img_file = img_cn or img_jp
        ev_type = first_str(po.get("EventType")) or "Event"
        server = first_str(po.get("EventRecentServer")) or ("cn" if start_cn > 0 else "jp")

        events.append({
            "title": page_title,
            "nameCn": name_cn,
            "nameJp": name_jp,
            "startCn": start_cn,
            "endCn": end_cn,
            "startJp": start_jp,
            "endJp": end_jp,
            "type": ev_type,
            "server": server,
            "bannerThumb": media_url(img_file, 480) if img_file else "",
            "bannerFull": media_url(img_file) if img_file else "",
        })

    events.sort(key=lambda e: max(e["startJp"], e["startCn"]), reverse=True)

    # Parse Banners
    banners = []
    for page_title, obj in banners_raw.items():
        po = obj.get("printouts", {})
        title_cn = first_str(po.get("SummonTitleCN")) or page_title
        title_jp = first_str(po.get("SummonTitleJP"))
        start_cn = first_ts(po.get("SummonStartCN"))
        end_cn = first_ts(po.get("SummonEndCN"))
        start_jp = first_ts(po.get("SummonStartJP"))
        end_jp = first_ts(po.get("SummonEndJP"))
        img_file = (
            first_str(po.get("SummonImageCN"))
            or first_str(po.get("SummonImage"))
            or first_str(po.get("SummonImageJP"))
        )
        servants = list_titles(po.get("推荐召唤从者"))
        ces = list_titles(po.get("推荐召唤礼装"))
        luckybag = first_bool(po.get("SummonLuckybag"))

        banners.append({
            "title": page_title,
            "titleCn": title_cn,
            "titleJp": title_jp,
            "startCn": start_cn,
            "endCn": end_cn,
            "startJp": start_jp,
            "endJp": end_jp,
            "bannerThumb": media_url(img_file, 480) if img_file else "",
            "bannerFull": media_url(img_file) if img_file else "",
            "servants": servants,
            "ces": ces,
            "luckybag": luckybag,
        })

    banners.sort(key=lambda b: max(b["startJp"], b["startCn"]), reverse=True)

    payload = {
        "generatedAt": time.strftime("%Y-%m-%d %H:%M"),
        "counts": {
            "events": len(events),
            "banners": len(banners),
        },
        "events": events,
        "banners": banners,
    }
    (APP_DATA_DIR / "events_banners.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Done! Saved {len(events)} events and {len(banners)} banners to events_banners.json", flush=True)


if __name__ == "__main__":
    main()
