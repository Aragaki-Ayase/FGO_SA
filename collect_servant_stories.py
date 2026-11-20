"""
Collect all FGO CN Servant Interlude (幕间物语) & Valentine (情人节剧情) indexes
from Atlas Academy CN and cross-reference Mooncell servant catalog IDs/icons,
saving app/public/data/servant_stories.json and 2 category banner WebP images.
"""
import concurrent.futures
import io
import json
import socket
import time
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
APP_DATA_DIR = ROOT / "app" / "public" / "data"
STORY_ASSETS_DIR = ROOT / "app" / "public" / "assets" / "story"

WAR_IDS_TO_SCAN = [
    1003, 9999,
    100, 101, 102, 103, 104, 105, 106, 107, 108,
    201, 202, 203, 204,
    300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311,
    400, 401, 402, 403, 404, 405,
]

UA = {"User-Agent": "Mozilla/5.0 MooncellOfflineApp/1.0"}


def is_port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except Exception:
        return False


def build_opener(use_proxy: bool):
    if use_proxy:
        proxy = urllib.request.ProxyHandler({
            "http": "http://127.0.0.1:7890",
            "https": "http://127.0.0.1:7890",
        })
        return urllib.request.build_opener(proxy)
    return urllib.request.build_opener()


PROXY_AVAILABLE = is_port_open("127.0.0.1", 7890)


def fetch_bytes(url: str, timeout: int = 45, retries: int = 3) -> bytes:
    openers = (
        [build_opener(True), build_opener(False)]
        if PROXY_AVAILABLE
        else [build_opener(False)]
    )
    last_err = None
    for attempt in range(retries):
        for opener in openers:
            try:
                req = urllib.request.Request(url, headers=UA)
                with opener.open(req, timeout=timeout) as resp:
                    return resp.read()
            except Exception as e:
                last_err = e
        time.sleep(0.8 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_err}")


def fetch_json(url: str, timeout: int = 45, retries: int = 3):
    raw = fetch_bytes(url, timeout=timeout, retries=retries)
    return json.loads(raw.decode("utf-8"))


def build_entries_for_quest(q: dict, spot_name: str, war_name: str) -> list[dict]:
    entries: list[dict] = []
    seen_ids: set[str] = set()
    q_name = str(q.get("name") or "").strip().replace("\n", " ")
    phase_scripts = q.get("phaseScripts") or []
    resolved_spot = spot_name or war_name or "幕间物语"

    for ps in phase_scripts:
        phase = int(ps.get("phase") or 1)
        scripts = ps.get("scripts") or []
        for idx, sc in enumerate(scripts):
            script_id = str(sc.get("scriptId") or "").strip()
            script_url = str(sc.get("script") or "").strip()
            if not script_id or not script_url or script_id in seen_ids:
                continue
            seen_ids.add(script_id)

            part_label = ""
            if len(scripts) > 1:
                if idx == 0:
                    part_label = "战斗前"
                elif idx == len(scripts) - 1:
                    part_label = "战斗后"
                else:
                    part_label = f"片段 {idx + 1}"
            elif len(phase_scripts) > 1:
                part_label = f"进度 {phase}"

            entries.append({
                "scriptId": script_id,
                "scriptUrl": script_url,
                "spotName": resolved_spot,
                "questName": q_name,
                "phase": phase,
                "partLabel": part_label,
            })
    return entries


def download_banner(cat_key: str, urls: list[str]):
    STORY_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = STORY_ASSETS_DIR / f"cat_{cat_key}.webp"
    if out_path.exists() and out_path.stat().st_size > 2000:
        print(f"  banner {out_path.name} already exists ({out_path.stat().st_size:,} bytes)", flush=True)
        return
    for u in urls:
        try:
            raw = fetch_bytes(u, timeout=30, retries=2)
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
            print(f"  saved {out_path.name} ({out_path.stat().st_size:,} bytes) <- {u}", flush=True)
            return
        except Exception as e:
            print(f"  skip banner {u}: {e}", flush=True)
    print(f"  WARNING: failed to generate {out_path.name}", flush=True)


def main():
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Read Mooncell catalog_summary.json for consistent nameCn & iconLocal
    mooncell_svt_map: dict[int, dict] = {}
    summary_path = APP_DATA_DIR / "catalog_summary.json"
    if summary_path.exists():
        summary_data = json.loads(summary_path.read_text(encoding="utf-8"))
        for s in summary_data.get("servants", []):
            sid = int(s.get("id") or 0)
            if sid:
                mooncell_svt_map[sid] = s
    print(f"1) Loaded {len(mooncell_svt_map)} Mooncell servant summaries.", flush=True)

    # 2. Fetch Atlas Academy CN nice_servant.json
    print(f"2) Fetching Atlas Academy CN nice_servant.json (proxy={PROXY_AVAILABLE})...", flush=True)
    nice_servants = fetch_json("https://api.atlasacademy.io/export/CN/nice_servant.json", timeout=120, retries=3)
    print(f"   Fetched {len(nice_servants)} CN servant records.", flush=True)

    svt_by_collection: dict[int, dict] = {}
    svt_by_atlas_id: dict[int, int] = {}
    quest_to_collections: dict[int, list[int]] = {}
    relate_91_quests: set[int] = set()

    for s in nice_servants:
        col_no = int(s.get("collectionNo") or 0)
        atlas_id = int(s.get("id") or 0)
        if col_no <= 0:
            continue
        svt_by_atlas_id[atlas_id] = col_no
        svt_by_collection[col_no] = s

        for qid in s.get("relateQuestIds") or []:
            qid_int = int(qid)
            quest_to_collections.setdefault(qid_int, [])
            if col_no not in quest_to_collections[qid_int]:
                quest_to_collections[qid_int].append(col_no)
            if str(qid_int).startswith("91"):
                relate_91_quests.add(qid_int)

    # 3. Concurrently scan wars for type == 'friendship' quests
    print(f"3) Scanning {len(WAR_IDS_TO_SCAN)} wars for friendship (interlude) quests...", flush=True)
    friendship_quests: dict[int, dict] = {}

    def fetch_war(wid: int):
        try:
            return fetch_json(f"https://api.atlasacademy.io/nice/CN/war/{wid}", timeout=35, retries=3)
        except Exception as e:
            print(f"   WARN war/{wid}: {e}", flush=True)
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        for war in ex.map(fetch_war, WAR_IDS_TO_SCAN):
            if not war:
                continue
            war_name = str(war.get("name") or "").strip().replace("\n", " ")
            if war_name == "-":
                war_name = ""
            for spot in war.get("spots") or []:
                spot_name = str(spot.get("name") or "").strip().replace("\n", " ")
                for q in spot.get("quests") or []:
                    if q.get("type") != "friendship":
                        continue
                    qid = int(q.get("id") or 0)
                    if not qid:
                        continue
                    entries = build_entries_for_quest(q, spot_name, war_name)
                    if not entries:
                        continue
                    friendship_quests[qid] = {
                        "quest": q,
                        "spotName": spot_name or war_name or "幕间物语",
                        "entries": entries,
                    }

    # 4. Fetch any 91* relateQuestIds missing from scanned wars
    missing_qids = sorted(qid for qid in relate_91_quests if qid not in friendship_quests)
    print(f"4) Found {len(friendship_quests)} friendship quests in wars; checking {len(missing_qids)} extra 91* relateQuestIds...", flush=True)

    if missing_qids:
        def fetch_quest(qid: int):
            try:
                return qid, fetch_json(f"https://api.atlasacademy.io/nice/CN/quest/{qid}/1", timeout=25, retries=2)
            except Exception:
                return qid, None

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
            for qid, q in ex.map(fetch_quest, missing_qids):
                if not q or q.get("type") != "friendship":
                    continue
                entries = build_entries_for_quest(q, "幕间物语", "幕间物语")
                if entries:
                    friendship_quests[qid] = {
                        "quest": q,
                        "spotName": "幕间物语",
                        "entries": entries,
                    }

    # 5. Associate each friendship quest with collectionNo(s)
    interludes_by_svt: dict[int, list[dict]] = {}
    for qid, info in sorted(friendship_quests.items()):
        q = info["quest"]
        col_list = list(quest_to_collections.get(qid) or [])
        if not col_list:
            # Fallback: inspect releaseConditions for target servant atlas_id
            for rc in q.get("releaseConditions") or []:
                if rc.get("type") in ("svtLimit", "svtFriendship"):
                    tid = int(rc.get("targetId") or 0)
                    mapped_col = svt_by_atlas_id.get(tid)
                    if mapped_col and mapped_col not in col_list:
                        col_list.append(mapped_col)

        q_obj = {
            "questId": qid,
            "name": str(q.get("name") or "").strip().replace("\n", " "),
            "spotName": info["spotName"],
            "entries": info["entries"],
        }
        for col_no in col_list:
            interludes_by_svt.setdefault(col_no, []).append(q_obj)

    def get_svt_meta(col_no: int) -> tuple[str, str]:
        mc = mooncell_svt_map.get(col_no)
        if mc:
            return mc.get("nameCn") or "", mc.get("iconLocal") or f"/assets/icons/svt/Servant{col_no:03d}.jpg"
        at = svt_by_collection.get(col_no, {})
        return str(at.get("name") or f"从者#{col_no}"), f"/assets/icons/svt/Servant{col_no:03d}.jpg"

    interludes_out = []
    total_interlude_quests = 0
    for col_no in sorted(interludes_by_svt.keys()):
        quests = sorted(interludes_by_svt[col_no], key=lambda x: x["questId"])
        if not quests:
            continue
        name_cn, icon_local = get_svt_meta(col_no)
        interludes_out.append({
            "svtId": col_no,
            "nameCn": name_cn,
            "iconLocal": icon_local,
            "quests": quests,
        })
        total_interlude_quests += len(quests)

    # 6. Build Valentine scripts grouped by collectionNo
    valentines_out = []
    total_valentine_scripts = 0
    for col_no in sorted(svt_by_collection.keys()):
        s = svt_by_collection[col_no]
        raw_val = s.get("valentineScript") or []
        scripts_list = []
        seen_sids: set[str] = set()
        for vs in raw_val:
            sid = str(vs.get("scriptId") or "").strip()
            surl = str(vs.get("script") or "").strip()
            sname = str(vs.get("scriptName") or "").strip().replace("\n", " ") or "情人节剧情"
            if not sid or not surl or sid in seen_sids:
                continue
            seen_sids.add(sid)
            scripts_list.append({
                "scriptId": sid,
                "scriptUrl": surl,
                "scriptName": sname,
            })
        if not scripts_list:
            continue
        name_cn, icon_local = get_svt_meta(col_no)
        valentines_out.append({
            "svtId": col_no,
            "nameCn": name_cn,
            "iconLocal": icon_local,
            "scripts": scripts_list,
        })
        total_valentine_scripts += len(scripts_list)

    payload = {
        "generatedAt": time.strftime("%Y-%m-%d %H:%M"),
        "counts": {
            "interludeServants": len(interludes_out),
            "interludeQuests": total_interlude_quests,
            "valentineServants": len(valentines_out),
            "valentineScripts": total_valentine_scripts,
        },
        "interludes": interludes_out,
        "valentines": valentines_out,
    }
    out_file = APP_DATA_DIR / "servant_stories.json"
    out_file.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"5) Saved {out_file.name}: {len(interludes_out)} interlude servants ({total_interlude_quests} quests), "
        f"{len(valentines_out)} valentine servants ({total_valentine_scripts} scripts), "
        f"size={out_file.stat().st_size:,} bytes",
        flush=True,
    )

    print("6) Downloading 2 category banner WebPs...", flush=True)
    download_banner("interlude", [
        "https://static.atlasacademy.io/CN/Back/back10200.png",
        "https://static.atlasacademy.io/CN/Back/back10400.png",
        "https://static.atlasacademy.io/CN/Back/back13200.png",
    ])
    download_banner("valentine", [
        "https://static.atlasacademy.io/CN/Back/back26700.png",
        "https://static.atlasacademy.io/CN/Back/back116100.png",
        "https://static.atlasacademy.io/CN/Back/back141200.png",
        "https://static.atlasacademy.io/CN/Back/back10200.png",
    ])


if __name__ == "__main__":
    main()
