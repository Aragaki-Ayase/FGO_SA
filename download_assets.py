"""
Download and compress Mooncell images into app/public/assets/ for offline bundling.
Uses persistent HTTPS connections (Keep-Alive) + Pillow WebP compression for card arts.
Resumable: skips already downloaded files.
"""
import argparse
import io
import json
import ssl
import threading
import time
import http.client
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image

ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = ROOT / "data" / "image_manifest.json"
PUBLIC_DIR = ROOT / "app" / "public"

thread_local = threading.local()
ssl_context = ssl.create_default_context()


def get_connection(host: str = "media.fgo.wiki") -> http.client.HTTPSConnection:
    conn = getattr(thread_local, "conn", None)
    if conn is None or conn.host != host:
        conn = http.client.HTTPSConnection(host, timeout=15, context=ssl_context)
        thread_local.conn = conn
    return conn


def reset_connection():
    conn = getattr(thread_local, "conn", None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
    thread_local.conn = None


def fetch_bytes(url: str) -> bytes | None:
    parsed = urlparse(url)
    path_query = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Connection": "keep-alive",
    }
    for attempt in range(3):
        try:
            conn = get_connection(parsed.netloc)
            conn.request("GET", path_query, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            if resp.status == 200 and data:
                return data
            if resp.status == 404:
                return None
            reset_connection()
        except Exception:
            reset_connection()
            time.sleep(0.3 * (attempt + 1))
    return None


def process_item(local_rel: str, info: dict) -> tuple[str, bool, str]:
    target_path = PUBLIC_DIR / local_rel.lstrip("/")
    if target_path.exists() and target_path.stat().st_size > 64:
        return (local_rel, True, "skipped")

    target_path.parent.mkdir(parents=True, exist_ok=True)
    raw = fetch_bytes(info["remote"])
    if raw is None and info.get("fallback_remote"):
        raw = fetch_bytes(info["fallback_remote"])
    if raw is None:
        return (local_rel, False, "not_found")

    try:
        if local_rel.endswith(".webp"):
            with Image.open(io.BytesIO(raw)) as im:
                if im.mode not in ("RGB", "RGBA"):
                    im = im.convert("RGBA" if "A" in im.mode else "RGB")
                max_w = 285
                if im.width > max_w:
                    ratio = max_w / float(im.width)
                    new_h = int(im.height * ratio)
                    im = im.resize((max_w, new_h), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                im.save(buf, format="WEBP", quality=78, method=4)
                target_path.write_bytes(buf.getvalue())
        else:
            target_path.write_bytes(raw)
        return (local_rel, True, "downloaded")
    except Exception as e:
        return (local_rel, False, str(e))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kinds", nargs="*", default=None,
                        help="Filter by kind: ui_icon skill_icon mat_icon svt_icon ce_icon svt_card ce_card")
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    priority_order = {
        "ui_icon": 0,
        "skill_icon": 1,
        "mat_icon": 2,
        "svt_icon": 3,
        "ce_icon": 4,
        "svt_card": 5,
        "ce_card": 6,
    }
    items = [
        (k, v) for k, v in manifest.items()
        if not args.kinds or v["kind"] in args.kinds
    ]
    items.sort(key=lambda kv: (priority_order.get(kv[1]["kind"], 99), kv[0]))

    # Filter out already existing files before submitting
    todo = []
    skipped = 0
    for k, v in items:
        p = PUBLIC_DIR / k.lstrip("/")
        if p.exists() and p.stat().st_size > 64:
            skipped += 1
        else:
            todo.append((k, v))

    if args.limit > 0:
        todo = todo[:args.limit]

    print(f"Total matched: {len(items)}, already downloaded: {skipped}, to download: {len(todo)}", flush=True)
    if not todo:
        return

    ok_count = 0
    fail_count = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(process_item, k, v): (k, v) for k, v in todo}
        for idx, fut in enumerate(as_completed(futures), 1):
            local_rel, ok, status = fut.result()
            if ok:
                ok_count += 1
            else:
                fail_count += 1
            if idx % 100 == 0 or idx == len(todo):
                elapsed = time.time() - t0
                rate = idx / max(elapsed, 0.1)
                print(f"[{idx}/{len(todo)}] ok={ok_count} fail={fail_count} ({rate:.1f} img/s)", flush=True)


if __name__ == "__main__":
    main()
