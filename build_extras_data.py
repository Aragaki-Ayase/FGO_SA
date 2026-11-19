"""
Parse Mooncell's Mystic Codes (魔术礼装), Spiritron Dresses (灵衣一览),
and Items + Free Quest Drop Efficiency (道具一览 + 模板:周常规划/data)
from data/mooncell.sqlite3 into app/public/data/extras_catalog.json,
and return image manifest entries for offline bundling.
"""
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "mooncell.sqlite3"
APP_DATA_DIR = ROOT / "app" / "public" / "data"


def build_extras(
    db: sqlite3.Connection,
    image_set: dict,
    helpers: dict,
) -> dict:
    """
    Build mysticCodes, costumes, and items (with dropQuests) from SQLite.
    `helpers` passes shared functions from build_app_data.py.
    """
    safe_filename = helpers["safe_filename"]
    media_url = helpers["media_url"]
    clean_wikitext_inline = helpers["clean_wikitext_inline"]
    extract_template_blocks = helpers["extract_template_blocks"]
    parse_template_params = helpers["parse_template_params"]

    # ------------------------------------------------------------------
    # 1. Parse Mystic Codes (御主装备 -> {{魔术礼装}})
    # ------------------------------------------------------------------
    mystic_codes = []
    mc_row = db.execute("SELECT wikitext FROM pages WHERE title='御主装备'").fetchone()
    if mc_row:
        mc_wt = mc_row[0]
        for idx, (_, body, _, _) in enumerate(extract_template_blocks(mc_wt, "魔术礼装"), 1):
            named, _ = parse_template_params(body)
            name_cn = clean_wikitext_inline(named.get("中文名称", ""), preserve_special=False)
            name_jp = clean_wikitext_inline(named.get("日文名称", ""), preserve_special=False)
            if not name_cn and not name_jp:
                continue
            base_name = name_cn or name_jp
            desc_cn = clean_wikitext_inline(named.get("中文简介", ""), preserve_special=False)
            desc_jp = clean_wikitext_inline(named.get("日文简介", ""), preserve_special=False)
            obtain = clean_wikitext_inline(named.get("获得方法", ""), preserve_special=False)

            exp_raw = named.get("累计经验", "").strip()
            exp_curve = [int(x.strip()) for x in exp_raw.split(",") if x.strip().isdigit()]

            # Arts: 立绘1(男性), 立绘2(女性), optional 立绘3, 立绘4
            arts = []
            art_specs = [
                (named.get("立绘名1", "").strip() or "男性", named.get("立绘1", "").strip() or f"{base_name}1"),
                (named.get("立绘名2", "").strip() or "女性", named.get("立绘2", "").strip() or f"{base_name}2"),
            ]
            for extra_i in (3, 4):
                lbl = named.get(f"立绘名{extra_i}", "").strip()
                fn_base = named.get(f"立绘{extra_i}", "").strip()
                if lbl or fn_base:
                    art_specs.append((lbl or f"形象{extra_i}", fn_base or f"{base_name}{extra_i}"))

            for a_idx, (a_lbl, a_base) in enumerate(art_specs):
                fn = a_base if a_base.lower().endswith((".png", ".jpg")) else f"{a_base}.png"
                safe_base = safe_filename(Path(fn).stem)
                t_local = f"/assets/cards/mc/{safe_base}.webp"
                t_remote = media_url(fn, 285)
                f_url = media_url(fn)
                if a_idx < 2:
                    image_set[t_local] = {
                        "remote": t_remote,
                        "fallback_remote": f_url,
                        "kind": "mc_card",
                        "filename": fn,
                    }
                arts.append({
                    "label": a_lbl,
                    "file": fn,
                    "thumbLocal": t_local if a_idx < 2 else t_remote,
                    "thumbRemote": t_remote,
                    "fullUrl": f_url,
                })

            # Skills: {{赋予技能|图标|中文名|日文名|CD|效果|v1|v2...|v10}}
            skills = []
            skill_sec = named.get("赋予技能", "")
            for _, sbody, _, _ in extract_template_blocks(skill_sec, "赋予技能"):
                sbody_clean = re.sub(r"<!--.*?-->", "", sbody, flags=re.S)
                snamed, spos = parse_template_params(sbody_clean)
                icon_name = (spos[0] if len(spos) > 0 else "未知技能").strip() or "未知技能"
                s_cn = clean_wikitext_inline(spos[1] if len(spos) > 1 else "", preserve_special=False)
                s_jp = clean_wikitext_inline(spos[2] if len(spos) > 2 else "", preserve_special=False)
                cd_str = (spos[3] if len(spos) > 3 else "").strip()
                cd = int(cd_str) if cd_str.isdigit() else None

                effects = []
                rest = spos[4:]
                i = 0
                while i < len(rest):
                    eff_text = clean_wikitext_inline(rest[i])
                    if not eff_text:
                        i += 1
                        continue
                    # Determine whether next items are 10 values or 1 single value (like ∅ or 20%)
                    vals = []
                    j = i + 1
                    while j < len(rest) and len(vals) < 10:
                        cand = rest[j].strip()
                        # Heuristic: if cand looks like a new Chinese effect description (> 5 CJK chars), stop
                        if len(re.findall(r"[\u4e00-\u9fff]", cand)) >= 4:
                            break
                        if cand:
                            vals.append(clean_wikitext_inline(cand, preserve_special=False))
                        j += 1
                    effects.append({
                        "text": eff_text,
                        "values": vals or ["∅"],
                    })
                    i = j

                icon_fn = f"{icon_name}.png"
                icon_local = f"/assets/icons/skill/{safe_filename(icon_fn)}"
                icon_remote = media_url(icon_fn)
                image_set[icon_local] = {"remote": icon_remote, "kind": "skill_icon", "filename": icon_fn}

                skills.append({
                    "icon": icon_name,
                    "iconLocal": icon_local,
                    "iconRemote": icon_remote,
                    "nameCn": s_cn,
                    "nameJp": s_jp,
                    "cd": cd,
                    "effects": effects,
                })

            mystic_codes.append({
                "id": idx,
                "nameCn": base_name,
                "nameJp": name_jp,
                "descCn": desc_cn,
                "descJp": desc_jp,
                "obtain": obtain,
                "expCurve": exp_curve,
                "arts": arts,
                "skills": skills,
            })

    # ------------------------------------------------------------------
    # 2. Parse Spiritron Dresses / Costumes (灵衣一览 -> {{灵衣一览}})
    # ------------------------------------------------------------------
    costumes = []
    cos_row = db.execute("SELECT wikitext FROM pages WHERE title='灵衣一览'").fetchone()
    if cos_row:
        cos_wt = cos_row[0]
        for fallback_idx, (_, body, _, _) in enumerate(extract_template_blocks(cos_wt, "灵衣一览"), 1):
            named, _ = parse_template_params(body)
            num_str = named.get("序号", "").strip()
            num = int(num_str) if num_str.isdigit() else fallback_idx
            servant_name = clean_wikitext_inline(named.get("从者", ""), preserve_special=False)
            name_cn = clean_wikitext_inline(named.get("中文名", ""), preserve_special=False)
            name_jp = clean_wikitext_inline(named.get("日文名", ""), preserve_special=False)
            if not name_cn and not name_jp:
                continue
            desc_cn = clean_wikitext_inline(named.get("中文简介", ""), preserve_special=False)
            desc_jp = clean_wikitext_inline(named.get("日文简介", ""), preserve_special=False)
            obtain = clean_wikitext_inline(named.get("开放条件", ""), preserve_special=False)

            # Materials
            mat_raw = named.get("素材", "")
            materials = []
            for _, mbody, _, _ in extract_template_blocks(mat_raw, "材料消耗"):
                _, mpos = parse_template_params(mbody)
                if len(mpos) >= 2:
                    mname = mpos[0].strip()
                    mcount = mpos[1].strip()
                    mfn = f"{mname}.jpg"
                    mlocal = f"/assets/icons/mat/{safe_filename(mfn)}"
                    mremote = media_url(mfn)
                    image_set[mlocal] = {"remote": mremote, "kind": "mat_icon", "filename": mfn}
                    materials.append({
                        "name": mname,
                        "count": mcount,
                        "iconLocal": mlocal,
                        "iconRemote": mremote,
                    })

            # Costume Avatar Icon
            icon_base = named.get("图标", "").strip()
            art_base = named.get("立绘", "").strip()
            icon_fn = f"{icon_base}.png" if icon_base else (f"{art_base}.png" if art_base else "")
            icon_local = ""
            icon_remote = ""
            if icon_fn:
                icon_local = f"/assets/icons/costume/{safe_filename(Path(icon_fn).stem)}.webp"
                icon_remote = media_url(icon_fn, 150)
                image_set[icon_local] = {
                    "remote": icon_remote,
                    "fallback_remote": media_url(icon_fn),
                    "kind": "costume_icon",
                    "filename": icon_fn,
                }

            # Costume Card Art
            art_fn = f"{art_base}.png" if art_base else ""
            art_thumb_local = ""
            art_thumb_remote = ""
            art_full_url = ""
            if art_fn:
                art_thumb_local = f"/assets/cards/costume/{safe_filename(Path(art_fn).stem)}.webp"
                art_thumb_remote = media_url(art_fn, 285)
                art_full_url = media_url(art_fn)
                image_set[art_thumb_local] = {
                    "remote": art_thumb_remote,
                    "fallback_remote": art_full_url,
                    "kind": "costume_card",
                    "filename": art_fn,
                }

            costumes.append({
                "id": num,
                "servant": servant_name,
                "nameCn": name_cn or name_jp,
                "nameJp": name_jp,
                "descCn": desc_cn,
                "descJp": desc_jp,
                "obtain": obtain,
                "materials": materials,
                "iconLocal": icon_local,
                "iconRemote": icon_remote,
                "artThumbLocal": art_thumb_local,
                "artThumbRemote": art_thumb_remote,
                "artFullUrl": art_full_url,
            })
        costumes.sort(key=lambda c: c["id"], reverse=True)

    # ------------------------------------------------------------------
    # 3. Parse Free Quest Drop Efficiency (模板:周常规划/data & sample)
    # ------------------------------------------------------------------
    drops_by_item = defaultdict(list)
    data_row = db.execute("SELECT wikitext FROM pages WHERE title='模板:周常规划/data'").fetchone()
    sample_row = db.execute("SELECT wikitext FROM pages WHERE title='模板:周常规划/sample'").fetchone()

    sample_map = {}
    if sample_row:
        raw_s = sample_row[0].strip().rstrip(",")
        try:
            sample_map = json.loads("{" + raw_s + "}")
        except Exception:
            sample_map = {}

    if data_row:
        raw_d = data_row[0].strip().rstrip(",")
        try:
            quests_arr = json.loads("[" + raw_d + "]")
        except Exception:
            quests_arr = []

        for q in quests_arr:
            if not isinstance(q, list) or len(q) < 8:
                continue
            chapter_cn, chapter_jp = str(q[0]), str(q[1])
            loc_cn, loc_jp = str(q[2]), str(q[3])
            quest_cn, quest_jp = str(q[4]), str(q[5])
            ap = int(q[6]) if isinstance(q[6], (int, float)) else 0
            rewards = q[7] if isinstance(q[7], list) else []

            bond = 0
            exp = 0
            drop_entries = []
            for entry in rewards:
                if not isinstance(entry, dict):
                    continue
                for k, v in entry.items():
                    if k == "牵绊" and isinstance(v, list) and v:
                        bond = int(v[0])
                    elif k == "经验" and isinstance(v, list) and v:
                        exp = int(v[0])
                    elif k.startswith("掉落：") and isinstance(v, list) and v:
                        item_name = k[len("掉落："):].strip()
                        rate_str = str(v[0]).strip()
                        if rate_str.endswith("%"):
                            try:
                                rate_num = float(rate_str[:-1]) / 100.0
                            except ValueError:
                                rate_num = 0.0
                        else:
                            try:
                                rate_num = float(rate_str)
                            except ValueError:
                                rate_num = 0.0
                        if rate_num > 0:
                            drop_entries.append((item_name, rate_str, rate_num))

            samples = int(sample_map.get(quest_jp, 0) or 0)

            for item_name, rate_str, rate_num in drop_entries:
                ap_per_drop = round(ap / rate_num, 2) if (ap > 0 and rate_num > 0) else 9999.0
                other_drops = [
                    {"name": other_n, "rate": other_r}
                    for other_n, other_r, _ in drop_entries
                    if other_n != item_name
                ]
                drops_by_item[item_name].append({
                    "chapter": chapter_cn,
                    "location": loc_cn,
                    "questCn": quest_cn,
                    "questJp": quest_jp,
                    "ap": ap,
                    "bond": bond,
                    "exp": exp,
                    "samples": samples,
                    "dropRate": rate_str,
                    "dropRateNum": round(rate_num, 5),
                    "apPerDrop": ap_per_drop,
                    "otherDrops": other_drops,
                })

    # Sort each item's drop quests by AP efficiency (lowest apPerDrop first) by default
    for item_name in drops_by_item:
        drops_by_item[item_name].sort(key=lambda x: (x["apPerDrop"], -x["dropRateNum"]))

    # ------------------------------------------------------------------
    # 4. Parse Items Catalog (分类:道具 -> {{道具信息}})
    # ------------------------------------------------------------------
    items = []
    item_rows = db.execute("SELECT title, wikitext FROM pages WHERE wikitext LIKE '%{{道具信息%'").fetchall()
    for title, wt in item_rows:
        blocks = extract_template_blocks(wt, "道具信息")
        if not blocks:
            continue
        named, _ = parse_template_params(blocks[0][1])
        num_str = named.get("序号", "").strip()
        num = int(num_str) if num_str.isdigit() else 9999
        item_id = named.get("道具内部id", "").strip()
        name_cn = clean_wikitext_inline(named.get("中文名称") or title, preserve_special=False)
        name_jp = clean_wikitext_inline(named.get("日文名称", ""), preserve_special=False)
        name_en = clean_wikitext_inline(named.get("英文名称", ""), preserve_special=False)
        rar_str = named.get("稀有度", "1").strip()
        rarity = int(rar_str) if rar_str.isdigit() else 1

        raw_cats = [clean_wikitext_inline(c, preserve_special=False) for c in named.get("分类", "").split(",") if c.strip()]
        if "一般素材" in raw_cats:
            if rarity == 1:
                cat_group = "铜素材"
            elif rarity == 2:
                cat_group = "银素材"
            else:
                cat_group = "金素材"
        elif "职阶技能石" in raw_cats:
            cat_group = "职阶技能石"
        elif "职阶棋子" in raw_cats:
            cat_group = "职阶棋子"
        elif "特殊素材" in raw_cats or "牵绊上限开放素材" in raw_cats:
            cat_group = "特殊素材"
        else:
            cat_group = "一般道具"

        desc_cn = clean_wikitext_inline(named.get("中文详细信息", ""), preserve_special=False)
        desc_jp = clean_wikitext_inline(named.get("日文详细信息", ""), preserve_special=False)

        # Icon filename (Mooncell uses .jpg for materials/gems/monuments, .png for some general items)
        custom_ico = named.get("图标", "").strip()
        if custom_ico:
            ico_fn = custom_ico if custom_ico.lower().endswith((".jpg", ".png")) else f"{custom_ico}.png"
            fallback_fn = f"{Path(ico_fn).stem}.jpg" if ico_fn.endswith(".png") else f"{Path(ico_fn).stem}.png"
        elif cat_group in ("铜素材", "银素材", "金素材", "职阶技能石", "职阶棋子"):
            ico_fn = f"{name_cn}.jpg"
            fallback_fn = f"{name_cn}.png"
        else:
            ico_fn = f"{name_cn}.png"
            fallback_fn = f"{name_cn}.jpg"

        ico_local = f"/assets/icons/mat/{safe_filename(ico_fn)}"
        ico_remote = media_url(ico_fn)
        ico_fallback = media_url(fallback_fn)
        if ico_local not in image_set:
            image_set[ico_local] = {
                "remote": ico_remote,
                "fallback_remote": ico_fallback,
                "kind": "mat_icon",
                "filename": ico_fn,
            }

        item_drops = drops_by_item.get(name_cn, []) or drops_by_item.get(title, [])
        best_quest = item_drops[0] if item_drops else None

        items.append({
            "id": num,
            "itemId": item_id,
            "nameCn": name_cn,
            "nameJp": name_jp,
            "nameEn": name_en,
            "rarity": rarity,
            "categoryGroup": cat_group,
            "rawCategories": raw_cats,
            "descCn": desc_cn,
            "descJp": desc_jp,
            "iconLocal": ico_local,
            "iconRemote": ico_remote,
            "iconFallback": ico_fallback,
            "dropCount": len(item_drops),
            "bestQuest": {
                "chapter": best_quest["chapter"],
                "location": best_quest["location"],
                "questCn": best_quest["questCn"],
                "ap": best_quest["ap"],
                "apPerDrop": best_quest["apPerDrop"],
                "dropRate": best_quest["dropRate"],
            } if best_quest else None,
            "dropQuests": item_drops,
        })

    # Sort items by category priority then ID
    cat_order = {
        "铜素材": 0,
        "银素材": 1,
        "金素材": 2,
        "职阶技能石": 3,
        "职阶棋子": 4,
        "特殊素材": 5,
        "一般道具": 6,
    }
    items.sort(key=lambda x: (cat_order.get(x["categoryGroup"], 9), x["id"], x["nameCn"]))

    payload = {
        "counts": {
            "mysticCode": len(mystic_codes),
            "costume": len(costumes),
            "item": len(items),
            "itemsWithDrops": sum(1 for it in items if it["dropCount"] > 0),
        },
        "mysticCodes": mystic_codes,
        "costumes": costumes,
        "items": items,
    }

    (APP_DATA_DIR / "extras_catalog.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Extras built: mysticCodes={len(mystic_codes)}, costumes={len(costumes)}, "
        f"items={len(items)} (with drops={payload['counts']['itemsWithDrops']})",
        flush=True,
    )
    return payload
