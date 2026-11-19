import json
import sqlite3
import time
import urllib.request
from urllib.parse import urlencode, quote

def api_get(**params):
    url = "https://fgo.wiki/api.php?" + urlencode(
        dict(format="json", formatversion=2, maxlag=5, **params)
    )
    req = urllib.request.Request(url, headers={"User-Agent": "MooncellOffline/0.1"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.load(resp)

def save_page(db, p):
    if "missing" in p or "revisions" not in p:
        return False
    rev = p["revisions"][0]
    slot = rev["slots"]["main"]
    text = slot["content"]
    db.execute(
        "INSERT OR REPLACE INTO pages VALUES (?,?,?,?,?,?,?,?,?)",
        (
            p["pageid"],
            p["ns"],
            p["title"],
            None,
            rev["revid"],
            rev["timestamp"],
            slot["contentmodel"],
            text,
            "https://fgo.wiki/w/" + quote(p["title"], safe=""),
        ),
    )
    return True

db = sqlite3.connect("data/mooncell.sqlite3")

# 1. Fetch core catalog pages + Module:周常规划/data
core_titles = [
    "御主装备",
    "灵衣一览",
    "道具一览",
    "模块:周常规划/data",
    "模块:道具效率",
    "模板:周常规划/data",
    "模板:周常规划/link",
    "模板:周常规划/sample",
]
d1 = api_get(action="query", titles="|".join(core_titles), prop="revisions", rvprop="ids|timestamp|content", rvslots="main")
with db:
    for p in d1["query"]["pages"]:
        ok = save_page(db, p)
        length = len(p["revisions"][0]["slots"]["main"]["content"]) if ok else 0
        print(f"Core page: {p['title']} saved={ok} len={length}", flush=True)

# 2. List all pages in 分类:道具
item_titles = []
cmcontinue = None
while True:
    params = dict(action="query", list="categorymembers", cmtitle="分类:道具", cmlimit="500", cmnamespace="0")
    if cmcontinue:
        params["cmcontinue"] = cmcontinue
    res = api_get(**params)
    for m in res["query"]["categorymembers"]:
        item_titles.append(m["title"])
    cmcontinue = res.get("continue", {}).get("cmcontinue")
    if not cmcontinue:
        break

print(f"Total 分类:道具 pages: {len(item_titles)}", flush=True)

# 3. Fetch all item pages in batches of 50
saved_items = 0
for offset in range(0, len(item_titles), 50):
    batch = item_titles[offset:offset + 50]
    res = api_get(action="query", titles="|".join(batch), prop="revisions", rvprop="ids|timestamp|content", rvslots="main")
    with db:
        for p in res["query"]["pages"]:
            if save_page(db, p):
                saved_items += 1
    print(f"Items batch {min(offset + 50, len(item_titles))}/{len(item_titles)} saved={saved_items}", flush=True)
    time.sleep(0.4)

# Preview 模板:周常规划/data & sample
for tname in ["模板:周常规划/data", "模板:周常规划/sample"]:
    row = db.execute("SELECT wikitext FROM pages WHERE title=?", (tname,)).fetchone()
    if row:
        print(f"\n=== Preview {tname} (len={len(row[0])}) ===")
        print(row[0][:1200])

db.close()
