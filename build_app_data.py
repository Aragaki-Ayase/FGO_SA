"""
Parse Mooncell SQLite wikitext into structured JSON for the FGO Offline Android/Web App,
and generate an image asset manifest for offline pre-packaging.
"""
import hashlib
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "mooncell.sqlite3"
APP_DATA_DIR = ROOT / "app" / "public" / "data"
MANIFEST_PATH = ROOT / "data" / "image_manifest.json"


def safe_filename(name: str) -> str:
    """Convert a wiki filename into a safe filesystem key while preserving uniqueness."""
    name = name.strip().replace(" ", "_")
    # Replace characters invalid on Windows/Android filesystems
    return re.sub(r'[<>:"/\\|?*]', "_", name)


def media_url(filename: str, thumb_width: int | None = None) -> str:
    """Compute Mooncell CDN (media.fgo.wiki) URL using MediaWiki MD5 path rules."""
    filename = filename.strip().replace(" ", "_")
    if not filename:
        return ""
    filename = filename[0].upper() + filename[1:]
    h = hashlib.md5(filename.encode("utf-8")).hexdigest()
    q = quote(filename, safe="")
    if thumb_width:
        return f"https://media.fgo.wiki/thumb/{h[0]}/{h[:2]}/{q}/{thumb_width}px-{q}"
    return f"https://media.fgo.wiki/{h[0]}/{h[:2]}/{q}"


def clean_wikitext_inline(text: str, preserve_special: bool = True) -> str:
    """Clean HTML comments, ref tags, and wiki templates from effect/profile text."""
    if not text:
        return ""
    # Remove HTML comments
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    # Extract <ref> notes into inline bracket notes or remove ref tags
    text = re.sub(r"<ref[^>]*>(.*?)</ref>", r"（注：\1）", text, flags=re.S)
    text = re.sub(r"<ref[^/>]*/\s*>", "", text)
    text = re.sub(r"<references[^/>]*/\s*>", "", text)
    # Handle {{特攻|target|display|...}} or {{特攻/追加技能|target|display|...}}
    def repl_special(m):
        inner = m.group(1)
        parts = [p.strip() for p in inner.split("|")]
        positional = [p for p in parts if "=" not in p]
        kv = dict(p.partition("=")[::2] for p in parts if "=" in p)
        if len(positional) >= 2 and positional[1]:
            disp = positional[1]
        elif positional:
            disp = f"〔{positional[0]}〕"
        else:
            disp = ""
        if preserve_special and disp:
            return f"⟪特攻:{disp}⟫"
        return disp

    text = re.sub(r"\{\{特[攻防效](?:/追加技能)?\|([^{}]+)\}\}", repl_special, text)
    # Handle {{特性|...}} or {{状态|...}}
    text = re.sub(r"\{\{(?:特性|状态)\|([^|{}]+)(?:\|([^|{}={}]+))?[^{}]*\}\}", lambda m: m.group(2) or f"〔{m.group(1)}〕", text)
    # Handle {{color|color|text}}
    text = re.sub(r"\{\{color\|[^|{}]+\|([^{}]+)\}\}", r"\1", text, flags=re.I)
    # Handle {{ruby|text|ruby}}
    text = re.sub(r"\{\{ruby\|([^|{}]+)\|([^|{}]+)\}\}", r"\1(\2)", text, flags=re.I)
    # Handle [[link|display]] and [[link]]
    text = re.sub(r"\[\[(?:[^\[\]|]+\|)?([^\[\]]+)\]\]", r"\1", text)
    # Replace <br> with newline
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    # Strip remaining simple HTML tags except <ATK...> style brackets in FGO descriptions
    text = re.sub(r"</?(?:span|div|small|big|b|i|u|center|nowiki|noinclude|includeonly)[^>]*>", "", text, flags=re.I)
    text = text.replace("'''", "").replace("''", "")
    return text.strip()


def extract_template_blocks(text: str, name_pattern: str) -> list[tuple[str, str, int, int]]:
    """Find balanced {{name...}} template blocks in text."""
    results = []
    for m in re.finditer(r"\{\{\s*(" + name_pattern + r")(?=[|\s\n}])", text):
        tname = m.group(1).strip()
        start = m.start()
        depth = 0
        i = start
        n = len(text)
        while i < n - 1:
            if text[i:i+2] == "{{":
                depth += 1
                i += 2
            elif text[i:i+2] == "}}":
                depth -= 1
                i += 2
                if depth == 0:
                    body = text[m.end():i-2]
                    results.append((tname, body, start, i))
                    break
            else:
                i += 1
    return results


def split_top_level_pipes(body: str) -> list[str]:
    """Split template body by top-level '|' characters (ignoring nested {{}} or [[]])."""
    parts = []
    curr = []
    depth_tpl = 0
    depth_link = 0
    i = 0
    n = len(body)
    while i < n:
        if body[i:i+2] == "{{":
            depth_tpl += 1
            curr.append("{{")
            i += 2
        elif body[i:i+2] == "}}":
            depth_tpl = max(0, depth_tpl - 1)
            curr.append("}}")
            i += 2
        elif body[i:i+2] == "[[":
            depth_link += 1
            curr.append("[[")
            i += 2
        elif body[i:i+2] == "]]":
            depth_link = max(0, depth_link - 1)
            curr.append("]]")
            i += 2
        elif body[i] == "|" and depth_tpl == 0 and depth_link == 0:
            parts.append("".join(curr))
            curr = []
            i += 1
        else:
            curr.append(body[i])
            i += 1
    parts.append("".join(curr))
    return parts


def parse_template_params(body: str) -> tuple[dict[str, str], list[str]]:
    """Parse template body into (named_params_dict, positional_params_list)."""
    raw_parts = split_top_level_pipes(body)
    named = {}
    positional = []
    # First element before any '|' is empty if body starts with '|'
    for idx, part in enumerate(raw_parts):
        if idx == 0 and not part.strip():
            continue
        # Check if top-level '=' exists
        eq_pos = -1
        depth_tpl = 0
        depth_link = 0
        for ci, ch in enumerate(part):
            if part[ci:ci+2] == "{{":
                depth_tpl += 1
            elif part[ci:ci+2] == "}}":
                depth_tpl = max(0, depth_tpl - 1)
            elif part[ci:ci+2] == "[[":
                depth_link += 1
            elif part[ci:ci+2] == "]]":
                depth_link = max(0, depth_link - 1)
            elif ch == "=" and depth_tpl == 0 and depth_link == 0:
                eq_pos = ci
                break
        if eq_pos != -1:
            k = part[:eq_pos].strip()
            v = part[eq_pos+1:].strip()
            # Only treat as named parameter if key doesn't contain newlines
            if "\n" not in k and len(k) < 40:
                named[k] = v
                continue
        positional.append(part.strip())
    return named, positional


# Trait categorization rules ("同类特性归到一起")
TRAIT_CATEGORIES = [
    ("阵营与属性", [
        "天", "地", "人", "星", "兽", "天地从者",
        "秩序", "中立", "混沌",
        "善", "中庸", "恶", "夏", "狂", "新娘",
    ]),
    ("性别与体型", [
        "女性", "男性", "性别不明",
        "人型", "非人型", "孩童从者", "超巨大", "巨人", "多人构成一骑的从者",
    ]),
    ("种族与生命形态", [
        "人科", "神性", "神灵", "龙", "魔性", "魔兽型", "猛兽", "兽科",
        "妖精", "鬼", "恶魔", "蛇", "兔子系从者", "机械",
        "活在当下的人类", "领域外生命", "人类的威胁",
    ]),
    ("系列与面孔", [
        "阿尔托莉雅脸", "亚瑟", "伊丽莎白", "樱系列", "伊莉雅",
        "信长", "瓦尔基里", "阿尔托莉雅·卡斯特", "虞美人", "酒吞童子",
    ]),
    ("势力与地域文化", [
        "王", "圆桌骑士", "罗马", "希腊神话系男性", "阿耳戈船相关人员",
        "源氏", "新选组", "梁山泊", "FSN从者", "童话特性的从者",
    ]),
    ("战斗机制与特殊状态", [
        "骑乘", "浮游着的", "夏日模式从者", "所爱之人", "可宇航的",
        "被EA特攻", "不被EA特攻", "猪化无效", "持有灵衣之人",
    ]),
]

TRAIT_NORMALIZE = {
    "童话特性从者": "童话特性的从者",
    "可宇航的从者": "可宇航的",
    "樱系列系": "樱系列",
    "不明": "性别不明",
}

CLASS_NORMALIZE = {
    "Grand Caster": "Caster",
    "BeastⅠ": "Beast",
    "BeastⅡ": "Beast",
    "BeastⅢ／R": "Beast",
    "BeastⅢ／L": "Beast",
    "BeastⅣ": "Beast",
    "BeastⅦ": "Beast",
    "UnBeast": "Beast",
}


def parse_np_single(body: str) -> dict:
    """Parse a single {{宝具...}} block."""
    named, _ = parse_template_params(body)
    effects = []
    if "宝具信息" in named and named["宝具信息"]:
        info = re.sub(r"<!--.*?-->", "", named["宝具信息"], flags=re.S)
        for chunk in info.split(";;"):
            chunk = chunk.strip()
            if not chunk:
                continue
            target = ""
            if "**对象##" in chunk:
                chunk, _, target = chunk.partition("**对象##")
                target = clean_wikitext_inline(target.splitlines()[0])
            parts = [p.strip() for p in chunk.split("::")]
            eff_text = clean_wikitext_inline(parts[0])
            vals = [clean_wikitext_inline(v, preserve_special=False) for v in parts[1:] if v.strip()]
            if eff_text:
                effects.append({
                    "text": eff_text,
                    "values": vals or ["∅"],
                    "target": target,
                })
    else:
        for letter in "ABCDEFGH":
            eff_raw = named.get(f"效果{letter}", "")
            if not eff_raw:
                continue
            eff_text = clean_wikitext_inline(eff_raw)
            vals = []
            for idx in range(1, 6):
                v = named.get(f"数值{letter}{idx}", "").strip()
                if v:
                    vals.append(clean_wikitext_inline(v, preserve_special=False))
            target = clean_wikitext_inline(named.get(f"对象{letter}", ""), preserve_special=False)
            effects.append({
                "text": eff_text,
                "values": vals or ["∅"],
                "target": target,
            })
    return {
        "nameCn": clean_wikitext_inline(named.get("中文名", ""), preserve_special=False),
        "rubyCn": clean_wikitext_inline(named.get("国服上标", ""), preserve_special=False),
        "nameJp": clean_wikitext_inline(named.get("日文名", ""), preserve_special=False),
        "rubyJp": clean_wikitext_inline(named.get("日服上标", ""), preserve_special=False),
        "card": named.get("卡色", "Buster").strip(),
        "type": named.get("类型", "辅助").strip(),
        "rank": named.get("阶级", "").strip(),
        "kind": named.get("种类", "").strip(),
        "effects": effects,
    }


def parse_skill_single(body: str, image_Set: dict) -> dict:
    """Parse a single {{持有技能...}} block."""
    body_clean = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    named, pos = parse_template_params(body_clean)
    icon_name = (pos[0] if len(pos) > 0 else named.get("1", "未知技能")).strip() or "未知技能"
    name_cn = clean_wikitext_inline(pos[1] if len(pos) > 1 else named.get("2", ""), preserve_special=False)
    name_jp = clean_wikitext_inline(pos[2] if len(pos) > 2 else named.get("3", ""), preserve_special=False)
    cd_str = (pos[3] if len(pos) > 3 else named.get("4", "")).strip()
    cd = int(cd_str) if cd_str.isdigit() else None

    effects = []
    if "技能信息" in named and named["技能信息"]:
        for chunk in named["技能信息"].split(";;"):
            chunk = chunk.strip()
            if not chunk:
                continue
            if "**对象##" in chunk:
                chunk, _, _ = chunk.partition("**对象##")
            parts = [p.strip() for p in chunk.split("::")]
            eff_text = clean_wikitext_inline(parts[0])
            vals = [clean_wikitext_inline(v, preserve_special=False) for v in parts[1:] if v.strip()]
            if eff_text:
                effects.append({
                    "text": eff_text,
                    "values": vals or ["∅"],
                })
    else:
        rest = pos[4:]
        i = 0
        while i < len(rest):
            eff_text = clean_wikitext_inline(rest[i])
            raw_vals = rest[i+1:i+11]
            vals = [clean_wikitext_inline(v, preserve_special=False) for v in raw_vals if v.strip()]
            if eff_text:
                effects.append({
                    "text": eff_text,
                    "values": vals or ["∅"],
                })
            i += 11

    icon_fn = f"{icon_name}.png"
    icon_safe = safe_filename(icon_fn)
    icon_local = f"/assets/icons/skill/{icon_safe}"
    icon_remote = media_url(icon_fn)
    image_Set[icon_local] = {"remote": icon_remote, "kind": "skill_icon", "filename": icon_fn}

    return {
        "icon": icon_name,
        "iconLocal": icon_local,
        "iconRemote": icon_remote,
        "nameCn": name_cn,
        "nameJp": name_jp,
        "cd": cd,
        "effects": effects,
    }


def extract_variants_recursive(section_text: str, template_name: str, parser_fn, default_label: str = "") -> list[dict]:
    """
    Extract multi-stage (<tabber>), upgraded ({{强化信息}}), or multi-color ({{复合标签}})
    variants of {{宝具}} or {{持有技能}} while preserving tab labels and conditions.
    """
    variants = []

    # Check if there is a <tabber> at the outer level (not inside {{强化信息}})
    # Or handle {{强化信息}} first if it wraps everything
    work = section_text.strip()
    if not work:
        return variants

    # Handle heroine divs (Mash Part 1 / Part 2)
    heroine_divs = list(re.finditer(r'<div class="(heroine[^"]*)">(.*?)</div>', work, flags=re.S))
    if heroine_divs and len(heroine_divs) > 1:
        label_map = {
            "heroine-first-1": "第一部",
            "heroine-second-1": "第一部(强化后)",
            "heroine2-first-1": "灵衣：奥特瑙斯",
            "heroine2-second-1": "灵衣：奥特瑙斯(强化)",
            "heroine2-third-1": "圣骑士玛修",
        }
        for m in heroine_divs:
            cls = m.group(1).strip()
            lbl = label_map.get(cls, cls)
            sub_vars = extract_variants_recursive(m.group(2), template_name, parser_fn, lbl)
            variants.extend(sub_vars)
        if variants:
            return variants

    # Check if top-level is {{强化信息...}}
    up_blocks = extract_template_blocks(work, "强化信息")
    if up_blocks and up_blocks[0][2] < 120:
        for _, up_body, _, _ in up_blocks:
            named, _ = parse_template_params(up_body)
            # Initial content
            if "初始内容" in named:
                sub = extract_variants_recursive(named["初始内容"], template_name, parser_fn,
                                                 f"{default_label}·强化前" if default_label else "强化前")
                variants.extend(sub)
            # Upgraded content 1, 2, 3...
            for suffix in ["", "2", "3", "4"]:
                key = f"强化内容{suffix}"
                if key in named and named[key]:
                    raw_up = named[key]
                    # Extract condition text before the first template or <tabber>
                    first_tpl = re.search(r"(\{\{|\<tabber\>)", raw_up)
                    cond = ""
                    if first_tpl and first_tpl.start() > 0:
                        cond = clean_wikitext_inline(raw_up[:first_tpl.start()], preserve_special=False)
                    lbl_base = f"强化后{suffix}" if suffix else "强化后"
                    lbl = f"{default_label}·{lbl_base}" if default_label else lbl_base
                    sub = extract_variants_recursive(raw_up, template_name, parser_fn, lbl)
                    for sv in sub:
                        if cond and not sv.get("cond"):
                            sv["cond"] = cond
                    variants.extend(sub)
        if variants:
            return variants

    # Check if there is a <tabber>
    tabber_m = re.search(r"<tabber>(.*?)</tabber>", work, flags=re.S)
    if tabber_m:
        tabber_inner = tabber_m.group(1)
        tabs = tabber_inner.split("|-|")
        for tab in tabs:
            tab = tab.strip()
            if not tab or "=" not in tab:
                continue
            tab_label, _, tab_content = tab.partition("=")
            tab_label = clean_wikitext_inline(tab_label.strip(), preserve_special=False)
            combined_label = f"{default_label} ({tab_label})" if default_label else tab_label
            sub = extract_variants_recursive(tab_content, template_name, parser_fn, combined_label)
            variants.extend(sub)
        if variants:
            return variants

    # Check if there is {{复合标签|label1|content1|label2|content2...}}
    comp_blocks = extract_template_blocks(work, "复合标签")
    if comp_blocks:
        for _, comp_body, _, _ in comp_blocks:
            _, pos = parse_template_params(comp_body)
            for i in range(0, len(pos) - 1, 2):
                sub_lbl = clean_wikitext_inline(pos[i], preserve_special=False)
                combined_label = f"{default_label} ({sub_lbl})" if default_label else sub_lbl
                sub = extract_variants_recursive(pos[i+1], template_name, parser_fn, combined_label)
                variants.extend(sub)
        if variants:
            return variants

    # Base case: extract {{template_name}} directly
    tpl_blocks = extract_template_blocks(work, template_name)
    for idx, (_, tpl_body, _, _) in enumerate(tpl_blocks):
        parsed = parser_fn(tpl_body)
        lbl = default_label or (f"阶段{idx+1}" if len(tpl_blocks) > 1 else "默认")
        parsed["tabLabel"] = lbl
        parsed.setdefault("cond", "")
        variants.append(parsed)

    return variants


def parse_active_skills(wt: str, image_set: dict) -> list[dict]:
    """Parse ===持有技能=== section into skill slots, each with variants."""
    m = re.search(r"===持有技能===(.*?)(?====职阶技能===|===追加技能===|==素材需求==|==资料==|\Z)", wt, flags=re.S)
    if not m:
        return []
    sec = m.group(1)

    # Split by '''技能1...''', '''技能2...''', '''技能3...'''
    slot_matches = list(re.finditer(r"'''(技能\s*\d+[^'\n]*)'''", sec))
    slots = []
    if slot_matches:
        for idx, sm in enumerate(slot_matches):
            slot_title = clean_wikitext_inline(sm.group(1), preserve_special=False)
            start = sm.end()
            end = slot_matches[idx + 1].start() if idx + 1 < len(slot_matches) else len(sec)
            chunk = sec[start:end]
            variants = extract_variants_recursive(
                chunk,
                "持有技能",
                lambda b: parse_skill_single(b, image_set),
                "",
            )
            if variants:
                slots.append({
                    "slotTitle": slot_title,
                    "variants": variants,
                })
    else:
        # Fallback if no '''技能1''' headers
        variants = extract_variants_recursive(
            sec,
            "持有技能",
            lambda b: parse_skill_single(b, image_set),
            "",
        )
        for idx, v in enumerate(variants):
            slots.append({
                "slotTitle": f"技能{idx+1}",
                "variants": [v],
            })
    return slots


def parse_class_skills(wt: str, image_set: dict) -> list[dict]:
    """Parse ===职阶技能=== section."""
    m = re.search(r"===职阶技能===(.*?)(?====追加技能===|==素材需求==|==资料==|\Z)", wt, flags=re.S)
    if not m:
        return []
    sec = m.group(1)
    skills = []
    seen = set()
    for _, body, _, _ in extract_template_blocks(sec, "职阶技能"):
        body_clean = re.sub(r"<!--.*?-->", "", body, flags=re.S)
        _, pos = parse_template_params(body_clean)
        for i in range(0, len(pos) - 3, 4):
            icon_name = pos[i].strip() or "未知技能"
            name_cn = clean_wikitext_inline(pos[i+1], preserve_special=False)
            rank = clean_wikitext_inline(pos[i+2], preserve_special=False)
            eff = clean_wikitext_inline(pos[i+3])
            key = (name_cn, rank, eff)
            if key in seen or not name_cn:
                continue
            seen.add(key)
            icon_fn = f"{icon_name}.png"
            icon_safe = safe_filename(icon_fn)
            icon_local = f"/assets/icons/skill/{icon_safe}"
            icon_remote = media_url(icon_fn)
            image_set[icon_local] = {"remote": icon_remote, "kind": "skill_icon", "filename": icon_fn}
            skills.append({
                "icon": icon_name,
                "iconLocal": icon_local,
                "iconRemote": icon_remote,
                "nameCn": name_cn,
                "rank": rank,
                "effect": eff,
            })
    return skills


def load_append_skill_catalog(db: sqlite3.Connection, image_set: dict) -> dict[str, dict]:
    """Load Append Skill definitions from 技能一览/追加技能 page in SQLite."""
    row = db.execute("SELECT wikitext FROM pages WHERE title='技能一览/追加技能'").fetchone()
    catalog = {}
    if not row:
        return catalog
    wt = row[0]
    for _, body, _, _ in extract_template_blocks(wt, "追加技能信息"):
        body_clean = re.sub(r"<!--.*?-->", "", body, flags=re.S)
        named, _ = parse_template_params(body_clean)
        sid = named.get("技能ID", "").strip()
        if not sid:
            continue
        icon_name = named.get("技能图标", "加攻").strip()
        icon_fn = f"{icon_name}.png"
        icon_safe = safe_filename(icon_fn)
        icon_local = f"/assets/icons/skill/{icon_safe}"
        icon_remote = media_url(icon_fn)
        image_set[icon_local] = {"remote": icon_remote, "kind": "skill_icon", "filename": icon_fn}
        vals = []
        for idx in range(1, 11):
            v = named.get(f"技能数值A{idx}", "").strip()
            if v:
                vals.append(v)
        catalog[sid] = {
            "id": sid,
            "icon": icon_name,
            "iconLocal": icon_local,
            "iconRemote": icon_remote,
            "nameCn": clean_wikitext_inline(named.get("中文名称", ""), preserve_special=False),
            "nameJp": clean_wikitext_inline(named.get("日文名称", ""), preserve_special=False),
            "effect": clean_wikitext_inline(named.get("技能描述A", "")),
            "values": vals or ["∅"],
        }
    return catalog


def parse_append_skills(wt: str, append_catalog: dict[str, dict]) -> list[dict]:
    """Parse {{追加技能|技能id1=...|技能id2=...|技能id3=...}} and include 3033000 & 3034000."""
    blocks = extract_template_blocks(wt, "追加技能")
    if not blocks:
        return []
    named, _ = parse_template_params(blocks[0][1])
    ids = []
    for k in ["技能id1", "技能id2", "技能id3"]:
        if k in named and named[k].strip():
            ids.append(named[k].strip())
    if len(ids) >= 3:
        ids.extend(["3033000", "3034000"])
    result = []
    for sid in ids:
        if sid in append_catalog:
            result.append(append_catalog[sid])
    return result


def parse_materials(wt: str, image_set: dict) -> dict:
    """Parse ==素材需求== into ascension, skill, and appendSkill material lists."""
    res = {"ascension": [], "skill": [], "appendSkill": []}

    def parse_mat_items(raw_str: str) -> list[dict]:
        items = []
        for _, mbody, _, _ in extract_template_blocks(raw_str, "材料消耗"):
            _, pos = parse_template_params(mbody)
            if len(pos) >= 2:
                mname = pos[0].strip()
                mcount = pos[1].strip()
                fn = f"{mname}.jpg"
                safe_fn = safe_filename(fn)
                local_p = f"/assets/icons/mat/{safe_fn}"
                rem_u = media_url(fn)
                image_set[local_p] = {"remote": rem_u, "kind": "mat_icon", "filename": fn}
                items.append({
                    "name": mname,
                    "count": mcount,
                    "iconLocal": local_p,
                    "iconRemote": rem_u,
                })
        return items

    for _, body, _, _ in extract_template_blocks(wt, "灵基再临素材"):
        named, _ = parse_template_params(body)
        for stage in ["0->1", "1->2", "2->3", "3->4", "总计"]:
            if stage in named:
                items = parse_mat_items(named[stage])
                if items:
                    res["ascension"].append({"stage": stage, "items": items})
        break

    for _, body, _, _ in extract_template_blocks(wt, "技能升级素材"):
        named, _ = parse_template_params(body)
        is_append = named.get("追加技能", "").strip() == "1"
        target_key = "appendSkill" if is_append else "skill"
        if res[target_key]:
            continue
        for stage in ["1->2", "2->3", "3->4", "4->5", "5->6", "6->7", "7->8", "8->9", "9->10", "总计"]:
            if stage in named:
                items = parse_mat_items(named[stage])
                if items:
                    res[target_key].append({"stage": stage, "items": items})

    return res


def parse_profile(wt: str) -> list[dict]:
    """Parse {{个人资料}} into structured profile cards."""
    blocks = extract_template_blocks(wt, "个人资料")
    if not blocks:
        return []
    named, _ = parse_template_params(blocks[0][1])
    sections = []
    det_cn = named.get("详情官中") or named.get("详情") or ""
    det_jp = named.get("详情日文") or ""
    if det_cn or det_jp:
        sections.append({
            "title": "角色详细",
            "cond": "",
            "textCn": clean_wikitext_inline(det_cn, preserve_special=False),
            "textJp": clean_wikitext_inline(det_jp, preserve_special=False),
        })
    for idx in range(1, 8):
        t_cn = named.get(f"资料{idx}官中") or named.get(f"资料{idx}") or ""
        t_jp = named.get(f"资料{idx}日文") or ""
        cond = named.get(f"资料{idx}条件") or ""
        if t_cn or t_jp:
            sections.append({
                "title": f"个人资料 {idx}",
                "cond": clean_wikitext_inline(cond, preserve_special=False),
                "textCn": clean_wikitext_inline(t_cn, preserve_special=False),
                "textJp": clean_wikitext_inline(t_jp, preserve_special=False),
            })
    return sections


CE_EFFECT_TAG_RULES = [
    ("指令卡性能", [
        ("Buster性能提升", r"Buster(?:指令卡)?性能|Busterカード性能"),
        ("Arts性能提升", r"Arts(?:指令卡)?性能|Artsカード性能"),
        ("Quick性能提升", r"Quick(?:指令卡)?性能|Quickカード性能"),
        ("Extra攻击提升", r"Extra Attack"),
    ]),
    ("NP与充能", [
        ("初始NP", r"以NP已达|チャージした状態でバトルを開始"),
        ("NP获得量提升", r"NP获得量提升|NP獲得量を.*アップ"),
        ("每回合获得NP", r"每回合获得NP|毎ターンNP獲得"),
    ]),
    ("输出与特攻加成", [
        ("宝具威力提升", r"宝具威力提升|宝具威力を.*アップ"),
        ("暴击威力提升", r"暴击威力.*提升|クリティカル威力を.*アップ"),
        ("攻击力提升", r"攻击力.*提升|攻撃力を.*アップ"),
        ("宝具OC提升", r"充能阶段上升|チャージ段階を.*引き上げる|チャージ段階を.*上げる"),
        ("特攻状态", r"特攻状态|特攻状態を|特攻威力"),
        ("伤害附加", r"伤害附加|ダメージプラス"),
    ]),
    ("暴击星相关", [
        ("每回合获得暴击星", r"每回合获得.*暴击星|毎ターンスター"),
        ("登场获得暴击星", r"登场时获得.*暴击星|参戦時にスター"),
        ("暴击星集中度提升", r"暴击星集中度|スター集中度"),
        ("暴击星发生率提升", r"暴击星发生率|スター発生率"),
    ]),
    ("命中·穿透·成功率", [
        ("无敌贯通", r"无敌贯通|無敵貫通"),
        ("必中状态", r"必中状态|必中状態"),
        ("无视防御", r"无视防御|防御無視"),
        ("弱化付与成功率提升", r"弱化付与成功率|弱体付与成功率"),
        ("强化成功率提升", r"强化成功率|強化成功率"),
        ("即死成功率提升", r"即死付与成功率|即死成功率"),
    ]),
    ("生存·防御·回复", [
        ("无敌状态", r"付与.*无敌状态|無敵状態を付与"),
        ("回避状态", r"付与.*回避状态|回避状態を付与"),
        ("毅力", r"毅力状态|ガッツ状態"),
        ("目标集中", r"目标集中状态|ターゲット集中"),
        ("防御力提升", r"防御力.*提升|防御力を.*アップ"),
        ("伤害减免", r"被伤害减免|ダメージカット"),
        ("弱化无效/耐性", r"弱化无效|弱化耐性提升|弱体無効|弱体耐性を.*アップ"),
        ("HP回复/最大HP", r"HP回复|最大HP|HPを回復|HP回復量"),
    ]),
    ("日常刷本加成", [
        ("牵绊点数加成", r"牵绊.*提升|絆ポイント"),
        ("御主/魔术礼装EXP加成", r"EXP.*提升|マスターEXP|魔術礼装EXP"),
        ("QP获得量加成", r"QP.*提升|QP獲得量"),
    ]),
]


def extract_ce_effect_tags(skill_text: str, category: str) -> list[str]:
    tags = []
    for _, rules in CE_EFFECT_TAG_RULES:
        for tag_name, pattern in rules:
            if re.search(pattern, skill_text, flags=re.I):
                tags.append(tag_name)
    if "EXP" in category and "礼装强化经验卡" not in tags:
        tags.append("礼装强化经验卡")
    return tags


def classify_ce_stat_type(atk_str: str, hp_str: str) -> str:
    def first_int(s: str) -> int:
        m = re.search(r"\d+", s or "")
        return int(m.group(0)) if m else 0
    atk_v = first_int(atk_str)
    hp_v = first_int(hp_str)
    if atk_v > 0 and hp_v == 0:
        return "纯ATK"
    if hp_v > 0 and atk_v == 0:
        return "纯HP"
    if atk_v > 0 and hp_v > 0:
        return "ATK/HP均衡"
    return "特殊/零属性"


def parse_bond_points(wt: str) -> list[int]:
    """Parse {{牵绊点数|p1|...|p10|rarity}} into 10 per-level bond point integers."""
    blocks = extract_template_blocks(wt, "牵绊点数")
    if not blocks:
        return []
    _, pos = parse_template_params(blocks[0][1])
    pts = []
    for p in pos[:10]:
        p_clean = p.strip().replace(",", "")
        if p_clean.isdigit():
            pts.append(int(p_clean))
    return pts


def parse_voices(voice_wt: str | None) -> list[dict]:
    """Parse Servant/语音 subpage wikitext into sections of voice lines."""
    if not voice_wt:
        return []
    sections = []
    voice_clean = re.sub(r"</?noinclude>", "", voice_wt)
    for _, body, _, _ in extract_template_blocks(voice_clean, "#invoke:VoiceTable"):
        named, _ = parse_template_params(body)
        sec_title = clean_wikitext_inline(named.get("表格标题", "语音"), preserve_special=False)
        items = []
        for idx in range(1, 80):
            v_title = named.get(f"标题{idx}", "").strip()
            v_cn = named.get(f"中文{idx}", "").strip()
            v_jp = named.get(f"日文{idx}", "").strip()
            if not v_title and not v_cn and not v_jp:
                continue
            items.append({
                "title": clean_wikitext_inline(v_title, preserve_special=False),
                "textCn": clean_wikitext_inline(v_cn, preserve_special=False),
                "textJp": clean_wikitext_inline(v_jp, preserve_special=False),
            })
        if items:
            sections.append({
                "section": sec_title,
                "items": items,
            })
    return sections


CE_EFFECT_TAG_RULES = [
    ("指令卡性能", [
        ("Buster性能提升", r"Buster(?:指令卡)?性能|Busterカード性能"),
        ("Arts性能提升", r"Arts(?:指令卡)?性能|Artsカード性能"),
        ("Quick性能提升", r"Quick(?:指令卡)?性能|Quickカード性能"),
        ("Extra攻击提升", r"Extra Attack"),
    ]),
    ("NP与充能", [
        ("初始NP", r"以NP已达|チャージした状態でバトルを開始"),
        ("NP获得量提升", r"NP获得量提升|NP獲得量を.*アップ"),
        ("每回合获得NP", r"每回合获得NP|毎ターンNP獲得"),
    ]),
    ("输出与特攻加成", [
        ("宝具威力提升", r"宝具威力提升|宝具威力を.*アップ"),
        ("暴击威力提升", r"暴击威力.*提升|クリティカル威力を.*アップ"),
        ("攻击力提升", r"攻击力.*提升|攻撃力を.*アップ"),
        ("宝具OC提升", r"充能阶段上升|チャージ段階を.*引き上げる|チャージ段階を.*上げる"),
        ("特攻状态", r"特攻状态|特攻状態を|特攻威力"),
        ("伤害附加", r"伤害附加|ダメージプラス"),
    ]),
    ("暴击星相关", [
        ("每回合获得暴击星", r"每回合获得.*暴击星|毎ターンスター"),
        ("登场获得暴击星", r"登场时获得.*暴击星|参戦時にスター"),
        ("暴击星集中度提升", r"暴击星集中度|スター集中度"),
        ("暴击星发生率提升", r"暴击星发生率|スター発生率"),
    ]),
    ("命中·穿透·成功率", [
        ("无敌贯通", r"无敌贯通|無敵貫通"),
        ("必中状态", r"必中状态|必中状態"),
        ("无视防御", r"无视防御|防御無視"),
        ("弱化付与成功率提升", r"弱化付与成功率|弱体付与成功率"),
        ("强化成功率提升", r"强化成功率|強化成功率"),
        ("即死成功率提升", r"即死付与成功率|即死成功率"),
    ]),
    ("生存·防御·回复", [
        ("无敌状态", r"付与.*无敌状态|無敵状態を付与"),
        ("回避状态", r"付与.*回避状态|回避状態を付与"),
        ("毅力", r"毅力状态|ガッツ状態"),
        ("目标集中", r"目标集中状态|ターゲット集中"),
        ("防御力提升", r"防御力.*提升|防御力を.*アップ"),
        ("伤害减免", r"被伤害减免|ダメージカット"),
        ("弱化无效/耐性", r"弱化无效|弱化耐性提升|弱体無効|弱体耐性を.*アップ"),
        ("HP回复/最大HP", r"HP回复|最大HP|HPを回復|HP回復量"),
    ]),
    ("日常刷本加成", [
        ("牵绊点数加成", r"牵绊.*提升|絆ポイント"),
        ("御主/魔术礼装EXP加成", r"EXP.*提升|マスターEXP|魔術礼装EXP"),
        ("QP获得量加成", r"QP.*提升|QP獲得量"),
    ]),
]


def extract_ce_effect_tags(skill_text: str, category: str) -> list[str]:
    tags = []
    for _, rules in CE_EFFECT_TAG_RULES:
        for tag_name, pattern in rules:
            if re.search(pattern, skill_text, flags=re.I):
                tags.append(tag_name)
    if "EXP" in category and "礼装强化经验卡" not in tags:
        tags.append("礼装强化经验卡")
    return tags


def classify_ce_stat_type(atk_str: str, hp_str: str) -> str:
    def first_int(s: str) -> int:
        m = re.search(r"\d+", s or "")
        return int(m.group(0)) if m else 0
    atk_v = first_int(atk_str)
    hp_v = first_int(hp_str)
    if atk_v > 0 and hp_v == 0:
        return "纯ATK"
    if hp_v > 0 and atk_v == 0:
        return "纯HP"
    if atk_v > 0 and hp_v > 0:
        return "ATK/HP均衡"
    return "特殊/零属性"


def parse_bond_points(wt: str) -> list[int]:
    """Parse {{牵绊点数|p1|...|p10|rarity}} into 10 per-level bond point integers."""
    blocks = extract_template_blocks(wt, "牵绊点数")
    if not blocks:
        return []
    _, pos = parse_template_params(blocks[0][1])
    pts = []
    for p in pos[:10]:
        p_clean = p.strip().replace(",", "")
        if p_clean.isdigit():
            pts.append(int(p_clean))
    return pts


def resolve_wikitext(db: sqlite3.Connection, title: str, wt: str | None, redir: str | None) -> str:
    seen = {title}
    while redir and redir not in seen:
        seen.add(redir)
        target = redir.split("#")[0].replace("_", " ").lstrip(":")
        row = db.execute("SELECT wikitext, redirect FROM pages WHERE title=?", (target,)).fetchone()
        if not row:
            break
        wt, redir = row
    return wt or ""


def build_all():
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (APP_DATA_DIR / "servants").mkdir(parents=True, exist_ok=True)
    (APP_DATA_DIR / "ces").mkdir(parents=True, exist_ok=True)

    db = sqlite3.connect(DB_PATH)
    image_set = {}

    # Register UI icons (Buster/Arts/Quick, class icons)
    for card_c in ["Buster", "Arts", "Quick", "Extra"]:
        fn = f"{card_c}.png"
        local_p = f"/assets/icons/ui/{safe_filename(fn)}"
        image_set[local_p] = {"remote": media_url(fn), "kind": "ui_icon", "filename": fn}

    for cls_c in ["Saber", "Archer", "Lancer", "Rider", "Caster", "Assassin", "Berserker",
                  "Shielder", "Ruler", "Avenger", "MoonCancer", "Alterego", "Foreigner", "Pretender", "Beast", "All"]:
        fn = f"金卡{cls_c}.png"
        local_p = f"/assets/icons/ui/{safe_filename(fn)}"
        image_set[local_p] = {"remote": media_url(fn), "kind": "ui_icon", "filename": fn}

    append_catalog = load_append_skill_catalog(db, image_set)

    # 1. Parse Craft Essences first so we can map Bond CEs to Servants
    ce_rows = db.execute("""
        SELECT c.number, c.name, c.title, c.fields_json, p.wikitext, p.redirect, p.revision_id, p.updated_at
        FROM catalog c LEFT JOIN pages p ON p.title = c.title
        WHERE c.kind = 'craft_essence'
        ORDER BY c.number DESC
    """).fetchall()

    ce_summary_list = []
    ce_details_map = {}
    bond_ce_by_servant = {}

    for num, cname, title, fjson, wt, redir, rev_id, updated_at in ce_rows:
        wt = resolve_wikitext(db, title, wt, redir)
        fields = json.loads(fjson) if fjson else {}
        blocks = extract_template_blocks(wt, "概念礼装")
        named = parse_template_params(blocks[0][1])[0] if blocks else {}

        rarity_str = named.get("稀有度", "4").strip()
        rarity = int(rarity_str) if rarity_str.isdigit() else 4
        name_cn = clean_wikitext_inline(named.get("名称") or fields.get("name") or cname, preserve_special=False)
        name_jp = clean_wikitext_inline(named.get("日文名称", ""), preserve_special=False)
        pic_name = (named.get("图片名") or named.get("名称") or title).strip()
        cost_str = named.get("cost", "9").strip()
        hp_str = named.get("HP", "100").strip()
        atk_str = named.get("ATK", "100").strip()
        ico_name = (named.get("国服图标") or named.get("图标") or "加攻").strip()
        cat_raw = named.get("礼装分类", "普通概念礼装").split(";;")[0].strip() or "普通概念礼装"
        ce_type = fields.get("type", "").strip() or cat_raw

        skill_raw = named.get("国服持有技能") or named.get("持有技能") or ""
        skill_lines = [clean_wikitext_inline(line) for line in skill_raw.splitlines() if line.strip()]
        des = skill_lines[0] if skill_lines else clean_wikitext_inline(fields.get("des", ""))
        des_max = skill_lines[1] if len(skill_lines) > 1 else clean_wikitext_inline(fields.get("des_max", ""))

        intro_cn = clean_wikitext_inline(named.get("解说", ""), preserve_special=False)
        intro_jp = clean_wikitext_inline(named.get("日文解说", ""), preserve_special=False)
        illustrator = clean_wikitext_inline(named.get("画师", ""), preserve_special=False)
        chars = [clean_wikitext_inline(c, preserve_special=False) for c in named.get("出场角色", "").split(";;") if c.strip()]

        # Framed thumbnail (图2样式: 礼装001.jpg .. 礼装2719.jpg)
        thumb_fn = f"礼装{num:03d}.jpg"
        thumb_local = f"/assets/icons/ce/{safe_filename(thumb_fn)}"
        thumb_remote = media_url(thumb_fn)
        image_set[thumb_local] = {"remote": thumb_remote, "kind": "ce_icon", "filename": thumb_fn}

        # Skill icon
        s_fn = f"{ico_name}.png"
        s_local = f"/assets/icons/skill/{safe_filename(s_fn)}"
        s_remote = media_url(s_fn)
        image_set[s_local] = {"remote": s_remote, "kind": "skill_icon", "filename": s_fn}

        # Card art
        card_fn = f"{pic_name}.png"
        card_thumb_local = f"/assets/cards/ce/{safe_filename(pic_name)}.webp"
        card_thumb_remote = media_url(card_fn, 300)
        card_full_url = media_url(card_fn)
        image_set[card_thumb_local] = {
            "remote": card_thumb_remote,
            "fallback_remote": card_full_url,
            "kind": "ce_card",
            "filename": card_fn,
        }

        # Check if Bond CE
        m_bond = re.search(r"\{\{牵绊礼装\|([^}|]+)", wt)
        bond_svt = m_bond.group(1).strip() if m_bond else ""
        if bond_svt:
            bond_ce_by_servant[bond_svt] = {
                "id": num,
                "nameCn": name_cn,
                "iconLocal": thumb_local,
                "iconRemote": thumb_remote,
                "des": des,
                "introCn": intro_cn,
            }

        combined_skill_text = f"{des}\n{des_max}"
        effect_tags = extract_ce_effect_tags(combined_skill_text, cat_raw)
        stat_type = classify_ce_stat_type(atk_str, hp_str)

        ce_summary = {
            "id": num,
            "title": title,
            "nameCn": name_cn,
            "nameJp": name_jp,
            "aliases": fields.get("name_other", ""),
            "rarity": rarity,
            "category": cat_raw,
            "type": ce_type,
            "statType": stat_type,
            "effectTags": effect_tags,
            "cost": cost_str,
            "hp": hp_str,
            "atk": atk_str,
            "des": des,
            "desMax": des_max,
            "iconLocal": thumb_local,
            "iconRemote": thumb_remote,
            "skillIconLocal": s_local,
            "skillIconRemote": s_remote,
        }
        ce_summary_list.append(ce_summary)
        ce_details_map[num] = {
            **ce_summary,
            "illustrator": illustrator,
            "characters": chars,
            "bondServant": bond_svt,
            "introCn": intro_cn,
            "introJp": intro_jp,
            "cardThumbLocal": card_thumb_local,
            "cardThumbRemote": card_thumb_remote,
            "cardFullUrl": card_full_url,
        }

    # 2. Parse all 487 Servants
    svt_rows = db.execute("""
        SELECT c.number, c.name, c.title, c.fields_json, p.wikitext, p.redirect, p.revision_id, p.updated_at
        FROM catalog c LEFT JOIN pages p ON p.title = c.title
        WHERE c.kind = 'servant'
        ORDER BY c.number DESC
    """).fetchall()

    svt_summary_list = []
    svt_details_map = {}

    for num, sname, title, fjson, wt, redir, rev_id, updated_at in svt_rows:
        wt = resolve_wikitext(db, title, wt, redir)
        fields = json.loads(fjson) if fjson else {}
        base_blocks = extract_template_blocks(wt, "基础数值")
        base_named = parse_template_params(base_blocks[0][1])[0] if base_blocks else {}

        rarity_str = base_named.get("稀有度", "5").strip()
        rarity = int(rarity_str) if rarity_str.isdigit() else 5
        raw_cls = base_named.get("职阶", "Saber").strip()
        norm_cls = CLASS_NORMALIZE.get(raw_cls, raw_cls)

        method_raw = (fields.get("method") or base_named.get("获取途径") or "期间限定").strip()
        # Normalize method for filter
        method_map = {
            "限定": "期间限定",
            "常驻": "圣晶石常驻",
            "剧情": "剧情限定",
            "活动": "活动赠送",
            "友情": "友情点召唤",
            "初始": "初始获得",
        }
        method_norm = method_map.get(method_raw, method_raw)

        name_cn = clean_wikitext_inline(base_named.get("中文名") or fields.get("name_cn") or sname, preserve_special=False)
        name_jp = clean_wikitext_inline(base_named.get("日文名") or fields.get("name_jp") or "", preserve_special=False)
        name_en = clean_wikitext_inline(base_named.get("英文名") or fields.get("name_en") or "", preserve_special=False)
        nicknames = clean_wikitext_inline(base_named.get("昵称", ""), preserve_special=False)
        aliases = " ".join(filter(None, [fields.get("name_other", ""), nicknames, base_named.get("中文名2", "")]))

        # Framed Servant thumbnail (图1样式: Servant001.jpg .. Servant487.jpg)
        svt_icon_fn = f"Servant{num:03d}.jpg"
        svt_icon_local = f"/assets/icons/svt/{safe_filename(svt_icon_fn)}"
        svt_icon_remote = media_url(svt_icon_fn)
        image_set[svt_icon_local] = {"remote": svt_icon_remote, "kind": "svt_icon", "filename": svt_icon_fn}

        # Parse Noble Phantasms
        np_sec_m = re.search(r"==宝具==(.*?)(?===技能==|==素材需求==|==资料==|\Z)", wt, flags=re.S)
        np_variants = []
        if np_sec_m:
            np_variants = extract_variants_recursive(np_sec_m.group(1), "宝具", parse_np_single, "")
        if not np_variants:
            np_variants = extract_variants_recursive(wt, "宝具", parse_np_single, "")

        np_colors = sorted({v["card"] for v in np_variants if v.get("card")}) or ["Buster"]
        np_types = sorted({v["type"] for v in np_variants if v.get("type")}) or ["全体"]
        np_kinds = sorted({v["kind"] for v in np_variants if v.get("kind")})

        # Parse Traits & Attributes
        attr1 = base_named.get("属性1", "").strip()
        attr2 = base_named.get("属性2", "").strip()
        sub_attr = base_named.get("副属性", "").strip()
        gender_raw = base_named.get("性别", "").strip()
        gender = TRAIT_NORMALIZE.get(gender_raw, gender_raw)

        raw_traits = []
        for idx in range(1, 21):
            t_val = base_named.get(f"特性{idx}", "").strip()
            t_note = base_named.get(f"特性{idx}备注", "").strip()
            if t_val:
                norm_t = TRAIT_NORMALIZE.get(t_val, t_val)
                raw_traits.append({"name": norm_t, "note": t_note})

        trait_set = {t["name"] for t in raw_traits}
        if attr1:
            trait_set.add(attr1)
        if attr2:
            trait_set.add(attr2)
        if sub_attr:
            trait_set.add(sub_attr)
        if gender:
            trait_set.add(gender)
        if base_named.get("人型", "").strip() == "是":
            trait_set.add("人型")
        elif base_named.get("人型", "").strip() == "否":
            trait_set.add("非人型")
        if base_named.get("被EA特攻", "").strip() == "是":
            trait_set.add("被EA特攻")
        elif base_named.get("被EA特攻", "").strip() == "否":
            trait_set.add("不被EA特攻")
        if base_named.get("猪化无效", "").strip() == "是":
            trait_set.add("猪化无效")

        # Card Art Gallery (stages 1..20 + April Fools)
        ascensions = []
        for idx in range(1, 21):
            st_lbl = base_named.get(f"立绘{idx}", "").strip()
            st_file = base_named.get(f"文件{idx}", "").strip()
            if st_file:
                fn = f"{st_file}.png"
                safe_base = safe_filename(st_file)
                # Pre-bundle Stage 1 & Stage 4 compressed card art thumbnails for every servant,
                # and register all stages with remote thumb + original full URL
                t_local = f"/assets/cards/svt/{safe_base}.webp"
                t_remote = media_url(fn, 285)
                f_url = media_url(fn)
                if idx in (1, 4):
                    image_set[t_local] = {
                        "remote": t_remote,
                        "fallback_remote": f_url,
                        "kind": "svt_card",
                        "filename": fn,
                    }
                ascensions.append({
                    "label": st_lbl or f"阶段 {idx}",
                    "file": fn,
                    "thumbLocal": t_local if idx in (1, 4) else t_remote,
                    "thumbRemote": t_remote,
                    "fullUrl": f_url,
                })

        # Command cards (Q/A/B)
        cards = [
            base_named.get("第一张卡", "Quick").strip(),
            base_named.get("第二张卡", "Quick").strip(),
            base_named.get("第三张卡", "Arts").strip(),
            base_named.get("第四张卡", "Arts").strip(),
            base_named.get("第五张卡", "Buster").strip(),
        ]

        # Active, Class, Append Skills
        active_skills = parse_active_skills(wt, image_set)
        class_skills = parse_class_skills(wt, image_set)
        append_skills = parse_append_skills(wt, append_catalog)
        materials = parse_materials(wt, image_set)
        profile = parse_profile(wt)

        voice_row = db.execute("SELECT wikitext FROM pages WHERE title=?", (f"{title}/语音",)).fetchone()
        voices = parse_voices(voice_row[0] if voice_row else None)

        bond_points = parse_bond_points(wt)
        bond_ce = bond_ce_by_servant.get(title) or bond_ce_by_servant.get(name_cn)

        svt_summary = {
            "id": num,
            "svtId": base_named.get("从者内部id", ""),
            "title": title,
            "nameCn": name_cn,
            "nameJp": name_jp,
            "nameEn": name_en,
            "aliases": aliases,
            "rarity": rarity,
            "className": norm_cls,
            "rawClass": raw_cls,
            "method": method_norm,
            "npColors": np_colors,
            "npTypes": np_types,
            "npKinds": np_kinds,
            "traits": sorted(trait_set),
            "atkMax": int(base_named.get("满级ATK", "0") or 0),
            "hpMax": int(base_named.get("满级HP", "0") or 0),
            "iconLocal": svt_icon_local,
            "iconRemote": svt_icon_remote,
        }
        svt_summary_list.append(svt_summary)

        svt_details_map[num] = {
            **svt_summary,
            "cv": clean_wikitext_inline(base_named.get("声优显示") or base_named.get("声优", ""), preserve_special=False),
            "illustrator": clean_wikitext_inline(base_named.get("画师", ""), preserve_special=False),
            "gender": gender,
            "height": base_named.get("身高", ""),
            "weight": base_named.get("体重", ""),
            "attr1": attr1,
            "attr2": attr2,
            "subAttr": sub_attr,
            "stats": {
                "atkBase": base_named.get("基础ATK", ""),
                "hpBase": base_named.get("基础HP", ""),
                "atkMax": base_named.get("满级ATK", ""),
                "hpMax": base_named.get("满级HP", ""),
                "atk90": base_named.get("90级ATK", ""),
                "hp90": base_named.get("90级HP", ""),
                "atk100": base_named.get("100级ATK", ""),
                "hp100": base_named.get("100级HP", ""),
                "atk120": base_named.get("120级ATK", ""),
                "hp120": base_named.get("120级HP", ""),
            },
            "params": {
                "str": base_named.get("筋力", ""),
                "end": base_named.get("耐久", ""),
                "agi": base_named.get("敏捷", ""),
                "mp": base_named.get("魔力", ""),
                "luk": base_named.get("幸运", ""),
                "np": base_named.get("宝具", ""),
            },
            "cards": cards,
            "npRates": {
                "Q": base_named.get("Q卡np率", ""),
                "A": base_named.get("A卡np率", ""),
                "B": base_named.get("B卡np率", ""),
                "EX": base_named.get("EX卡np率", ""),
                "NP": base_named.get("宝具np率", ""),
                "def": base_named.get("受击np率", ""),
            },
            "hits": {
                "Q": base_named.get("Q卡hit数", ""),
                "A": base_named.get("A卡hit数", ""),
                "B": base_named.get("B卡hit数", ""),
                "EX": base_named.get("EX卡hit数", ""),
                "NP": base_named.get("宝具卡hit数", ""),
            },
            "starRate": base_named.get("出星率", ""),
            "deathRate": base_named.get("即死率", ""),
            "critWeight": base_named.get("暴击权重", ""),
            "traitDetails": raw_traits,
            "ascensions": ascensions,
            "noblePhantasms": np_variants,
            "activeSkills": active_skills,
            "classSkills": class_skills,
            "appendSkills": append_skills,
            "materials": materials,
            "bondPoints": bond_points,
            "bondCe": bond_ce,
            "profile": profile,
            "voices": voices,
            "sourceUrl": f"https://fgo.wiki/w/{quote(title, safe='')}",
            "revisionId": rev_id,
            "updatedAt": updated_at,
        }

    # Collect any remaining uncategorized traits into "其他特性"
    categorized_traits = {t for _, tlist in TRAIT_CATEGORIES for t in tlist}
    all_present_traits = {t for s in svt_summary_list for t in s["traits"]}
    extra_traits = sorted(all_present_traits - categorized_traits)
    trait_groups = [
        {"group": grp, "traits": [t for t in tlist if t in all_present_traits]}
        for grp, tlist in TRAIT_CATEGORIES
    ]
    if extra_traits:
        trait_groups.append({"group": "其他特性", "traits": extra_traits})

    ce_effect_groups = [
        {"group": grp_name, "tags": [t for t, _ in rules]}
        for grp_name, rules in CE_EFFECT_TAG_RULES
    ]

    # Write catalog_summary.json
    summary_payload = {
        "generatedAt": "2026-11-18",
        "counts": {
            "servant": len(svt_summary_list),
            "craftEssence": len(ce_summary_list),
        },
        "traitGroups": trait_groups,
        "ceEffectGroups": ce_effect_groups,
        "servants": svt_summary_list,
        "craftEssences": ce_summary_list,
    }
    (APP_DATA_DIR / "catalog_summary.json").write_text(
        json.dumps(summary_payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    # Write chunked detail files (by ID ranges of 50 for servants, 200 for CEs) for fast on-demand offline loading
    for chunk_start in range(1, 501, 50):
        chunk_end = chunk_start + 49
        chunk_data = {
            str(k): v for k, v in svt_details_map.items() if chunk_start <= k <= chunk_end
        }
        if chunk_data:
            (APP_DATA_DIR / "servants" / f"svt_{chunk_start}_{chunk_end}.json").write_text(
                json.dumps(chunk_data, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )

    for chunk_start in range(1, 2801, 200):
        chunk_end = chunk_start + 199
        chunk_data = {
            str(k): v for k, v in ce_details_map.items() if chunk_start <= k <= chunk_end
        }
        if chunk_data:
            (APP_DATA_DIR / "ces" / f"ce_{chunk_start}_{chunk_end}.json").write_text(
                json.dumps(chunk_data, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )

    # Write image manifest for offline asset downloader
    MANIFEST_PATH.write_text(
        json.dumps(image_set, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    by_kind = defaultdict(int)
    for info in image_set.values():
        by_kind[info["kind"]] += 1
    print("Structured data built successfully!")
    print("Servants:", len(svt_summary_list), "Craft Essences:", len(ce_summary_list))
    print("Images in manifest:", dict(by_kind), "Total:", len(image_set))
    db.close()


if __name__ == "__main__":
    build_all()
