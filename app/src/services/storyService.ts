import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  StoryWarCategory,
  StoryWarSummary,
  StoryWarsPayload,
  StoryScriptEntry,
  StoryWarDetail,
  SvtScriptMeta,
  StoryBlock,
  ParsedStoryScript,
  WarReadProgress,
} from '../types';

const STORY_DB_NAME = 'atlas_story_cache_v1';
const PROGRESS_STORAGE_KEY = 'mooncell_story_progress_v1';
const STORY_DATA_VERSION = '20261119v5';
const STORY_OVERRIDES_KEY = 'story_wars_overrides_v3';
const WAR_DETAIL_VERSION = 2;
const SCRIPT_PARSER_VERSION = 5;

const REAL_MAIN_BANNER_MAP: Record<number, string> = {
  100: './assets/story/wars/war_100.webp',
  101: './assets/story/wars/war_101.webp',
  102: './assets/story/wars/war_102.webp',
  103: './assets/story/wars/war_103.webp',
  104: './assets/story/wars/war_104.webp',
  105: './assets/story/wars/war_105.webp',
  106: './assets/story/wars/war_106.webp',
  107: './assets/story/wars/war_107.webp',
  108: './assets/story/wars/war_108.webp',
  201: './assets/story/wars/war_201.webp',
  202: './assets/story/wars/war_202.webp',
  203: './assets/story/wars/war_203.webp',
  204: './assets/story/wars/war_204.webp',
  300: './assets/story/wars/war_300.webp',
  301: './assets/story/wars/war_301.webp',
  302: './assets/story/wars/war_302.webp',
  303: './assets/story/wars/war_303.webp',
  304: './assets/story/wars/war_304.webp',
  305: './assets/story/wars/war_305.webp',
  306: './assets/story/wars/war_306.webp',
  307: './assets/story/wars/war_307.webp',
  308: './assets/story/wars/war_308.webp',
  309: './assets/story/wars/war_309.webp',
  310: './assets/story/wars/war_310.webp',
  311: './assets/story/wars/war_311.webp',
  400: './assets/story/wars/war_400.webp',
  401: './assets/story/wars/war_401.webp',
  402: './assets/story/wars/war_402.webp',
  403: './assets/story/wars/war_403.webp',
  404: './assets/story/wars/war_404.webp',
  405: './assets/story/wars/war_405.webp',
};

/* ========================= IndexedDB 工具 ========================= */

function openStoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORY_DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('war_details')) {
        db.createObjectStore('war_details', { keyPath: 'warId' });
      }
      if (!db.objectStoreNames.contains('scripts')) {
        db.createObjectStore('scripts', { keyPath: 'scriptId' });
      }
      if (!db.objectStoreNames.contains('svt_scripts')) {
        db.createObjectStore('svt_scripts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('image_cache')) {
        db.createObjectStore('image_cache', { keyPath: 'url' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  try {
    const db = await openStoryDb();
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

async function idbPut<T>(store: string, val: T): Promise<void> {
  try {
    const db = await openStoryDb();
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(val);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore storage quota errors
  }
}

async function idbGetAllKeys(store: string): Promise<string[]> {
  try {
    const db = await openStoryDb();
    return new Promise((resolve) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAllKeys();
      req.onsuccess = () => resolve((req.result || []).map((k) => String(k)));
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/* ========================= 网络请求（带自动重试 & 代理适配） ========================= */

function toProxiedStaticUrl(rawUrl: string): string {
  if (Capacitor.isNativePlatform()) return rawUrl;
  if (rawUrl.startsWith('https://static.atlasacademy.io/')) {
    return rawUrl.replace('https://static.atlasacademy.io', '/atlas-static');
  }
  return rawUrl;
}

export function resolveStoryImageUrl(rawUrl: string): string {
  return toProxiedStaticUrl(rawUrl);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAtlasJson(apiPath: string, retries = 2, timeoutMs = 8000): Promise<any> {
  const fullUrl = `https://api.atlasacademy.io${apiPath}`;
  let lastErr: any = null;

  for (let i = 0; i < retries; i++) {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({
          url: fullUrl,
          headers: { 'User-Agent': 'MooncellOfflineApp/1.0' },
          connectTimeout: Math.min(5000, timeoutMs),
          readTimeout: timeoutMs,
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      }

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        // Web 端优先走 Vite 代理，回退直连（Atlas Academy 允许 CORS）
        const proxyResp = await fetch(`/atlas-api${apiPath}`, { signal: controller.signal });
        const ct = proxyResp.headers.get('content-type') || '';
        if (proxyResp.ok && ct.includes('json')) {
          return await proxyResp.json();
        }
        const directResp = await fetch(fullUrl, { signal: controller.signal });
        if (!directResp.ok) throw new Error(`HTTP ${directResp.status}`);
        return await directResp.json();
      } finally {
        window.clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await sleep(400 * (i + 1));
    }
  }
  throw lastErr || new Error('连接 Atlas Academy 失败');
}

async function fetchAtlasText(rawUrl: string, retries = 2, timeoutMs = 10000): Promise<string> {
  let lastErr: any = null;

  for (let i = 0; i < retries; i++) {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({
          url: rawUrl,
          headers: { 'User-Agent': 'MooncellOfflineApp/1.0' },
          connectTimeout: 5000,
          readTimeout: timeoutMs,
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        return typeof res.data === 'string' ? res.data : String(res.data ?? '');
      }

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const proxied = toProxiedStaticUrl(rawUrl);
        const resp = await fetch(proxied, { signal: controller.signal });
        if (resp.ok) {
          const text = await resp.text();
          if (!text.startsWith('<!DOCTYPE') && !text.startsWith('<html')) {
            return text;
          }
        }
        const directResp = await fetch(rawUrl, { signal: controller.signal });
        if (!directResp.ok) throw new Error(`HTTP ${directResp.status}`);
        return await directResp.text();
      } finally {
        window.clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await sleep(400 * (i + 1));
    }
  }
  throw lastErr || new Error('加载剧情脚本失败');
}

/* ========================= 剧情目录加载与在线同步 ========================= */

function classifyWar(w: any): StoryWarCategory | null {
  const wid = Number(w?.id || 0);
  const flags: string[] = Array.isArray(w?.flags) ? w.flags : [];
  const eventId = Number(w?.eventId || 0);
  const name = String(w?.name || '').trim();
  const longName = String(w?.longName || '').trim().replace(/\n/g, ' ');
  const cleanLabel = longName || name;

  if (!cleanLabel || cleanLabel === '-' || cleanLabel === '—' || cleanLabel === '迦勒底之门') {
    return null;
  }

  if (flags.includes('mainScenario')) {
    // 剔除 11000(主线记录1)、12000(主线记录1.5)、13000(主线记录2)、14000(奏章外壳) 及 40201~40501 空白地图容器
    if (wid >= 10000) return null;
    if (wid >= 100 && wid < 200) return 'part1';
    if (wid >= 200 && wid < 300) return 'part15';
    if ((wid >= 400 && wid < 500) || cleanLabel.includes('奏章') || cleanLabel.includes('Ordeal Call')) {
      return 'ordeal_call';
    }
    if (wid >= 300 && wid < 400) return 'part2';
    return 'part1';
  }
  if (eventId > 0) return 'event';
  return null;
}

// 国服已实装活动优先按国服开启时间降序（最新在最上方）；国服暂未实装的日服活动排在末尾按日服时间降序
function sortEventWars(a: StoryWarSummary, b: StoryWarSummary): number {
  const aHasCn = (a.startCn || 0) > 0 ? 1 : 0;
  const bHasCn = (b.startCn || 0) > 0 ? 1 : 0;
  if (aHasCn !== bHasCn) return bHasCn - aHasCn;
  return (b.startCn || 0) - (a.startCn || 0) || (b.startJp || 0) - (a.startJp || 0) || b.id - a.id;
}

export async function loadStoryWars(): Promise<StoryWarsPayload> {
  const resp = await fetch(`./data/story_wars.json?v=${STORY_DATA_VERSION}`);
  if (!resp.ok) {
    throw new Error('无法加载离线剧情目录');
  }
  const base: StoryWarsPayload = await resp.json();

  const cached = await idbGet<{ key: string; wars?: StoryWarSummary[]; updatedAt?: string }>(
    'meta',
    STORY_OVERRIDES_KEY
  );
  if (cached?.wars && cached.wars.length > 0) {
    const map = new Map(base.wars.map((w) => [w.id, w]));
    for (const w of cached.wars) {
      if (w.category !== 'event' && w.id >= 10000) continue;
      map.set(w.id, {
        ...w,
        banner: REAL_MAIN_BANNER_MAP[w.id] || w.banner,
      });
    }
    const all = Array.from(map.values()).filter((w) => w.category === 'event' || w.id < 10000);
    const mainList = all.filter((w) => w.category !== 'event').sort((a, b) => a.id - b.id);
    const evList = all.filter((w) => w.category === 'event').sort(sortEventWars);
    base.wars = [...mainList, ...evList];
    base.counts = { total: base.wars.length, main: mainList.length, event: evList.length };
    if (cached.updatedAt) base.generatedAt = cached.updatedAt;
  }
  return base;
}

function fmtOffsetDate(ts: number, offsetHours: number): string {
  if (!ts || ts <= 0) return '';
  const d = new Date((ts + offsetHours * 3600) * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function syncStoryWarsFromAtlas(): Promise<{
  wars: StoryWarSummary[];
  addedCount: number;
}> {
  const [rawList, cnEvents, jpEvents] = await Promise.all([
    fetchAtlasJson('/export/CN/basic_war.json', 1, 6000),
    fetchAtlasJson('/export/CN/basic_event.json', 1, 6000).catch(() => []),
    fetchAtlasJson('/export/JP/basic_event.json', 1, 6000).catch(() => []),
  ]);

  const cnStartMap = new Map<number, number>();
  for (const ev of cnEvents || []) {
    const eid = Number(ev?.id || 0);
    const st = Number(ev?.startedAt || 0);
    if (eid && st > 0) cnStartMap.set(eid, st);
  }

  const jpStartMap = new Map<number, number>();
  for (const ev of jpEvents || []) {
    const eid = Number(ev?.id || 0);
    const st = Number(ev?.startedAt || 0);
    if (eid && st > 0) jpStartMap.set(eid, st);
  }

  const prev = await idbGet<{ key: string; wars?: StoryWarSummary[] }>(
    'meta',
    STORY_OVERRIDES_KEY
  );
  const prevBannerMap = new Map((prev?.wars || []).map((x) => [x.id, x.banner]));

  const parsed: StoryWarSummary[] = [];
  for (const w of rawList || []) {
    const cat = classifyWar(w);
    if (!cat) continue;
    const wid = Number(w.id || 0);
    const eventId = Number(w.eventId || 0);
    let name = String(w.name || '').trim().replace(/\n/g, ' ');
    let longName = String(w.longName || '').trim().replace(/\n/g, ' ');
    if (name === '-') name = '';
    if (longName === '-') longName = '';
    const title = longName || name;
    if (!title) continue;
    const startCn = eventId > 0 ? cnStartMap.get(eventId) || 0 : 0;
    const startJp = eventId > 0 ? jpStartMap.get(eventId) || 0 : 0;
    const banner =
      REAL_MAIN_BANNER_MAP[wid] ||
      String(w.banner || '').trim() ||
      prevBannerMap.get(wid) ||
      (cat !== 'event' ? `https://static.atlasacademy.io/CN/Banner/questboard_cap${wid}.png` : '');
    parsed.push({
      id: wid,
      eventId,
      category: cat,
      name: name || title,
      longName: title,
      banner,
      startCn,
      startCnDate: fmtOffsetDate(startCn, 8),
      startJp,
      startJpDate: fmtOffsetDate(startJp, 9),
    });
  }

  const prevCount = prev?.wars?.length || 0;
  const nowStr = new Date().toLocaleString('zh-CN', { hour12: false });

  if (parsed.length > 0) {
    await idbPut('meta', {
      key: STORY_OVERRIDES_KEY,
      wars: parsed,
      updatedAt: nowStr,
    });
  }

  const mainList = parsed.filter((w) => w.category !== 'event').sort((a, b) => a.id - b.id);
  const evList = parsed.filter((w) => w.category === 'event').sort(sortEventWars);
  return {
    wars: [...mainList, ...evList],
    addedCount: Math.max(0, parsed.length - prevCount),
  };
}

/* ========================= 立绘表情坐标（svtScript）持久化 & 批量拉取 ========================= */

const svtScriptCache = new Map<string, Promise<SvtScriptMeta | null>>();

function normalizeSvtScriptItem(item: any, fallbackId?: string): SvtScriptMeta {
  return {
    id: Number(item?.id || fallbackId || 0),
    faceX: Number(item?.faceX || 0),
    faceY: Number(item?.faceY || 0),
    offsetX: Number(item?.offsetX || 0),
    offsetY: Number(item?.offsetY || 0),
    scale: Number(item?.scale || 1),
    extendData: item?.extendData || {},
  };
}

/**
 * 打开一节剧情时，一次性批量拉取本节所有登场角色的 svtScript 坐标并持久化到 IndexedDB
 */
export async function prefetchSvtScriptMetas(charaIds: string[]): Promise<void> {
  const uniqueIds = Array.from(
    new Set(charaIds.map((id) => String(id || '').trim()).filter((id) => /^\d+$/.test(id)))
  );
  if (uniqueIds.length === 0) return;

  const missingIds: string[] = [];
  for (const id of uniqueIds) {
    if (svtScriptCache.has(id)) continue;
    const cached = await idbGet<SvtScriptMeta>('svt_scripts', Number(id));
    if (cached && cached.id) {
      svtScriptCache.set(id, Promise.resolve(cached));
    } else {
      missingIds.push(id);
    }
  }
  if (missingIds.length === 0) return;

  // 每批最多 40 个角色合并为一次请求
  const BATCH_SIZE = 40;
  for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
    const batch = missingIds.slice(i, i + BATCH_SIZE);
    const query = batch.map((id) => `charaId=${encodeURIComponent(id)}`).join('&');
    const batchPromise = fetchAtlasJson(`/raw/CN/svtScript?${query}`, 2)
      .then(async (arr) => {
        const resultMap = new Map<string, SvtScriptMeta>();
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const meta = normalizeSvtScriptItem(item);
            if (meta.id > 0 && !resultMap.has(String(meta.id))) {
              resultMap.set(String(meta.id), meta);
              await idbPut('svt_scripts', meta);
            }
          }
        }
        return resultMap;
      })
      .catch(() => new Map<string, SvtScriptMeta>());

    for (const id of batch) {
      svtScriptCache.set(
        id,
        batchPromise.then((m) => m.get(id) || null)
      );
    }
  }
}

export function loadSvtScriptMeta(charaId: string): Promise<SvtScriptMeta | null> {
  const key = String(charaId || '').trim();
  if (!key || !/^\d+$/.test(key)) return Promise.resolve(null);
  const existing = svtScriptCache.get(key);
  if (existing) return existing;

  const p = (async (): Promise<SvtScriptMeta | null> => {
    const cached = await idbGet<SvtScriptMeta>('svt_scripts', Number(key));
    if (cached && cached.id) return cached;

    try {
      const arr = await fetchAtlasJson(`/raw/CN/svtScript?charaId=${key}`, 2);
      if (Array.isArray(arr) && arr.length > 0) {
        const meta = normalizeSvtScriptItem(arr[0], key);
        await idbPut('svt_scripts', meta);
        return meta;
      }
    } catch {
      // ignore
    }
    return null;
  })();

  svtScriptCache.set(key, p);
  return p;
}

/* ========================= 剧情图片持久化本地缓存（IndexedDB + 内存 Blob URL 复用） ========================= */

interface CachedImageRecord {
  url: string;
  blob: Blob;
  size: number;
  updatedAt: number;
}

const imageObjectUrlMap = new Map<string, string>();
const inflightImageLoads = new Map<string, Promise<string | null>>();

async function fetchImageBlob(rawUrl: string): Promise<Blob | null> {
  // Web 端优先走 Vite 代理再回退直连；Android 端直接 fetch（static.atlasacademy.io 允许 CORS）
  const candidates = Capacitor.isNativePlatform()
    ? [rawUrl]
    : Array.from(new Set([toProxiedStaticUrl(rawUrl), rawUrl]));

  for (const target of candidates) {
    try {
      const resp = await fetch(target);
      if (!resp.ok) {
        if (resp.status === 404) return null;
        continue;
      }
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('text/html')) continue;
      const blob = await resp.blob();
      if (blob && blob.size > 0) {
        return blob;
      }
    } catch {
      // 尝试下一个候选地址
    }
  }
  return null;
}

/**
 * 加载并持久化缓存剧情图片（背景 / 立绘 / CG / 礼装 / 标记图）：
 * - 命中内存：0ms 直接返回已有 blob: URL
 * - 命中 IndexedDB：本地磁盘秒开，不走网络
 * - 并发去重：同一张图同时被多个场景引用时仅发起 1 次下载
 * - 返回 null 表示图片不存在(404)或下载失败
 */
export function loadCachedStoryImage(rawUrl: string): Promise<string | null> {
  const key = (rawUrl || '').trim();
  if (!key) return Promise.resolve(null);

  const memUrl = imageObjectUrlMap.get(key);
  if (memUrl) return Promise.resolve(memUrl);

  const inflight = inflightImageLoads.get(key);
  if (inflight) return inflight;

  const task = (async (): Promise<string | null> => {
    try {
      // 1) 先查 IndexedDB 本地持久化缓存
      const rec = await idbGet<CachedImageRecord>('image_cache', key);
      if (rec?.blob && rec.blob.size > 0) {
        const objUrl = URL.createObjectURL(rec.blob);
        imageObjectUrlMap.set(key, objUrl);
        return objUrl;
      }

      // 2) 未命中则联网下载并持久化写入 IndexedDB
      const blob = await fetchImageBlob(key);
      if (!blob) return null;

      const objUrl = URL.createObjectURL(blob);
      imageObjectUrlMap.set(key, objUrl);

      // 异步写入本地磁盘，不阻塞首屏渲染
      void idbPut<CachedImageRecord>('image_cache', {
        url: key,
        blob,
        size: blob.size,
        updatedAt: Date.now(),
      });
      return objUrl;
    } catch {
      return null;
    } finally {
      inflightImageLoads.delete(key);
    }
  })();

  inflightImageLoads.set(key, task);
  return task;
}

export async function getStoryImageCacheStats(): Promise<{ count: number; totalBytes: number }> {
  try {
    const db = await openStoryDb();
    return await new Promise((resolve) => {
      const tx = db.transaction('image_cache', 'readonly');
      const store = tx.objectStore('image_cache');
      const req = store.openCursor();
      let count = 0;
      let totalBytes = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          count++;
          const val = cursor.value as CachedImageRecord | undefined;
          totalBytes += Number(val?.size || val?.blob?.size || 0);
          cursor.continue();
        } else {
          resolve({ count, totalBytes });
        }
      };
      req.onerror = () => resolve({ count: 0, totalBytes: 0 });
    });
  } catch {
    return { count: 0, totalBytes: 0 };
  }
}

export async function clearStoryImageCache(): Promise<void> {
  // 释放内存中的 Object URL
  for (const objUrl of imageObjectUrlMap.values()) {
    try {
      URL.revokeObjectURL(objUrl);
    } catch {
      // ignore
    }
  }
  imageObjectUrlMap.clear();
  inflightImageLoads.clear();

  try {
    const db = await openStoryDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('image_cache', 'readwrite');
      tx.objectStore('image_cache').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/* ========================= 章节内剧情节目录加载 ========================= */

function buildQuestChapterLabel(q: any, questName: string, fallbackIndex: number): string {
  const rawSubStr = String(q?.chapterSubStr ?? '');
  const trimmedSubStr = rawSubStr.trim();
  const subId = Number(q?.chapterSubId || 0);
  const qType = String(q?.type || '');

  // 若任务名本身已包含“第X节”，直接提取作为节号标签
  const nameSecMatch = questName.match(/^(第\s*[0-9一二三四五六七八九十百零两]+\s*节)/);
  if (nameSecMatch) {
    return nameSecMatch[1].replace(/\s+/g, '');
  }

  // 官方 chapterSubStr 非空（如“后篇”“序章”等）
  if (trimmedSubStr) {
    if (subId > 0 && subId < 80 && !trimmedSubStr.includes('节')) {
      return `${trimmedSubStr} · 第${subId}节`;
    }
    return trimmedSubStr;
  }

  // 全角空格 \u3000 是 FGO 官方专门用于隐藏“第X节”编号的占位（例如断章/幕间）
  if (subId > 0 && rawSubStr !== '\u3000' && subId < 80) {
    return `第${subId}节`;
  }

  if (/^(序章|序幕|终章|终幕|幕间|开幕|尾声|断章|番外|后日谈)/.test(questName)) {
    const m = questName.match(/^(序章|序幕|终章|终幕|幕间|开幕|尾声|断章(?:[／/\s]*[0-9ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)?|番外|后日谈)/);
    if (m) return m[1];
  }

  if (qType && qType !== 'main') {
    if (questName.includes('回顾')) return '回顾关卡';
    return '支线';
  }

  return `第${fallbackIndex}节`;
}

export async function loadWarDetail(
  warId: number,
  forceRefresh = false
): Promise<StoryWarDetail> {
  if (!forceRefresh) {
    const cached = await idbGet<StoryWarDetail>('war_details', warId);
    if (cached && Array.isArray(cached.entries) && cached.detailVersion === WAR_DETAIL_VERSION) {
      return cached;
    }
  }

  const raw = await fetchAtlasJson(`/nice/CN/war/${warId}`);

  // 展平全部带剧情脚本的任务，按游戏内官方进度顺序重新排序：
  // 1) 主线/活动正篇 (type === 'main') 优先，支线/回顾关卡排在后面
  // 2) priority 降序（FGO 官方剧情进度排序键）
  // 3) quest.id 升序兜底
  const flatQuests: { spotName: string; quest: any }[] = [];
  for (const spot of raw?.spots || []) {
    const spotName = String(spot?.name || '').trim().replace(/\n/g, ' ');
    for (const q of spot?.quests || []) {
      if (Array.isArray(q?.phaseScripts) && q.phaseScripts.length > 0) {
        flatQuests.push({ spotName, quest: q });
      }
    }
  }

  flatQuests.sort((a, b) => {
    const aMain = a.quest?.type === 'main' ? 0 : 1;
    const bMain = b.quest?.type === 'main' ? 0 : 1;
    if (aMain !== bMain) return aMain - bMain;
    const aPrio = Number(a.quest?.priority || 0);
    const bPrio = Number(b.quest?.priority || 0);
    if (aPrio !== bPrio) return bPrio - aPrio;
    return Number(a.quest?.id || 0) - Number(b.quest?.id || 0);
  });

  const entries: StoryScriptEntry[] = [];
  const seenScriptIds = new Set<string>();
  let mainQuestSeq = 0;

  for (const { spotName, quest: q } of flatQuests) {
    const questName = String(q?.name || '').trim().replace(/\n/g, ' ');
    const questType = String(q?.type || '');
    if (questType === 'main') mainQuestSeq++;
    const chapterLabel = buildQuestChapterLabel(q, questName, mainQuestSeq || entries.length + 1);

    const phaseScripts = [...(Array.isArray(q?.phaseScripts) ? q.phaseScripts : [])].sort(
      (a, b) => Number(a?.phase || 0) - Number(b?.phase || 0)
    );

    for (const ps of phaseScripts) {
      const phase = Number(ps?.phase || 1);
      const scripts = Array.isArray(ps?.scripts) ? ps.scripts : [];
      scripts.forEach((sc: any, idx: number) => {
        const scriptId = String(sc?.scriptId || '').trim();
        const scriptUrl = String(sc?.script || '').trim();
        if (!scriptId || !scriptUrl || seenScriptIds.has(scriptId)) return;
        seenScriptIds.add(scriptId);

        let partLabel = '';
        if (scripts.length > 1) {
          partLabel =
            idx === 0 ? '战斗前' : idx === scripts.length - 1 ? '战斗后' : `片段 ${idx + 1}`;
        } else if (phaseScripts.length > 1) {
          partLabel = `进度 ${phase}`;
        }

        entries.push({
          scriptId,
          scriptUrl,
          spotName: spotName || '剧情节点',
          questName: questName || `${chapterLabel}`,
          chapterLabel,
          questType,
          phase,
          partLabel,
        });
      });
    }
  }

  const detail: StoryWarDetail = {
    warId,
    name: String(raw?.name || '').trim().replace(/\n/g, ' '),
    longName: String(raw?.longName || raw?.name || '').trim().replace(/\n/g, ' '),
    entries,
    fetchedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    detailVersion: WAR_DETAIL_VERSION,
  };

  await idbPut('war_details', detail);
  return detail;
}

/* ========================= 剧情脚本文本清洗与解析 ========================= */

function cleanInlineMarkup(raw: string): string {
  let text = raw;
  // 玩家名占位
  text = text.replace(/\[%1\]/g, '藤丸立香');
  // 注音标签：[#主文本:注音] -> 主文本（注音）
  text = text.replace(/\[#([^:\]]+):([^\]]+)\]/g, '$1（$2）');
  // 强调标签：[#重点词] -> 重点词
  text = text.replace(/\[#([^\]:]+)\]/g, '$1');
  // 换行与破折号
  text = text.replace(/\[r\]/g, '\n');
  text = text.replace(/\[line\s+\d+\]/g, '——');
  // 清除 Unity NGUI 颜色码（如 [51d4ff] / [51d4ffff]）、颜色闭合符 [-] 及样式闭合标签（如 [/b] [/i] [/u] [/s] [/c]）
  text = text.replace(/\[-\]/g, '');
  text = text.replace(/\[[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\]/g, '');
  text = text.replace(/\[\/[a-zA-Z0-9_-]+\]/g, '');
  // 清除其余行内演出控制码（如 [f ...] [s ...] [wt ...] [b] [i] 等）
  text = text.replace(/\[[a-zA-Z0-9_]+(?:\s+[^\]]*)?\]/g, '');
  // 压缩多余空白
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

// 仅过滤纯黑/纯白底图及电影上下黑边遮罩，避免误杀有内容的剧情插图与信件/标题 CG
const SKIP_IMAGE_ASSET_RE = /^(cut063_cinema(_fs)?|back10000|back10001|black|white)$/i;

// FGO 脚本中专门用于挂载天气/粒子/镜头特效的隐形占位角色名称特征
const DUMMY_CHARA_NAME_RE =
  /(dummy|ダミー|エフェクト|特效用|演出用|効果用|效果用|背景用|通信用|フィルター用|滤镜用|カメラ用|镜头用|ウインドウ用|ウィンドウ用|空白|透明)/i;

function isDummyChara(charaId: string, name: string): boolean {
  const n = (name || '').trim();
  if (n && DUMMY_CHARA_NAME_RE.test(n)) return true;
  // 98115000 为 FGO 官方最常用的无名/特效占位角色 ID
  if (charaId === '98115000' && (!n || n.includes('用'))) return true;
  return false;
}

function isOffscreenCoord(token?: string): boolean {
  if (!token || !token.includes(',')) return false;
  const [xs, ys] = token.split(',');
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x) >= 1000 || Math.abs(y) >= 1000;
}

type SlotAsset =
  | {
      kind: 'chara';
      charaId: string;
      name: string;
      url: string;
      face: number;
      silhouette: boolean;
      visible: boolean;
    }
  | { kind: 'scene'; bgId: string; url: string; fallbackUrl?: string }
  | { kind: 'cg'; imgName: string; url: string }
  | { kind: 'equip'; equipId: string; url: string };

function buildBgAsset(bgId: string, enableFullScreen: boolean): { url: string; fallbackUrl?: string } {
  const stdUrl = `https://static.atlasacademy.io/CN/Back/back${bgId}.png`;
  if (enableFullScreen) {
    return {
      url: `https://static.atlasacademy.io/CN/Back/back${bgId}_1344_626.png`,
      fallbackUrl: stdUrl,
    };
  }
  return { url: stdUrl };
}

function cleanSpeakerName(rawSpeaker: string): string {
  // 先清除 NGUI 颜色码/闭合符/注音等富文本标签，再移除 FGO 槽位前缀（如 "B：希翁?"、"A:[51d4ff]达·芬奇[-]"）
  const stripped = cleanInlineMarkup(rawSpeaker).replace(/\n+/g, ' ').trim();
  return stripped.replace(/^[A-Za-z]\s*[：:]\s*/, '').trim();
}

export function parseStoryScript(rawText: string): StoryBlock[] {
  const lines = rawText.split(/\r?\n/);
  const blocks: StoryBlock[] = [];
  let speaker = '';
  let buf: string[] = [];
  let lastBgId = '';
  let currentBgUrl = '';
  let currentBgFallbackUrl: string | undefined;
  let lastEmittedMediaKey = '';
  let enableFullScreen = false;
  let cameraFilter = '';
  let activeTalkSlot = '';
  let pendingChoices: { index: string; text: string }[] = [];

  // 参考 Atlas Academy DB：维护槽位(A~Z)绑定的立绘/表情/剪影/场景/CG/礼装
  const slotMap = new Map<string, SlotAsset>();

  // 合并同一演出段内连续的 charaFace + charaFadein 指令，在文本/选项前输出最终定格画面
  let pendingScene: Extract<StoryBlock, { type: 'scene' }> | null = null;

  const flushPendingScene = () => {
    if (!pendingScene) return;
    const key = `scene:${pendingScene.bgUrl || ''}:${pendingScene.charaId}:${pendingScene.face}:${pendingScene.silhouette ? 1 : 0}:${pendingScene.cameraFilter || ''}`;
    if (key !== lastEmittedMediaKey) {
      lastEmittedMediaKey = key;
      blocks.push(pendingScene);
    }
    pendingScene = null;
  };

  const flushChoices = () => {
    if (pendingChoices.length > 0) {
      flushPendingScene();
      blocks.push({ type: 'choices', options: pendingChoices });
      pendingChoices = [];
    }
  };

  const flushText = () => {
    if (buf.length === 0) return;
    const cleaned = cleanInlineMarkup(buf.join(''));
    buf = [];
    if (!cleaned) return;
    flushPendingScene();
    flushChoices();
    if (speaker) {
      blocks.push({ type: 'dialogue', speaker, text: cleaned });
    } else {
      blocks.push({ type: 'narration', text: cleaned });
    }
  };

  const emitBg = (bgId: string) => {
    if (!bgId || bgId === '10000' || bgId === '10001') {
      if (bgId === '10000' || bgId === '10001') {
        lastBgId = bgId;
        currentBgUrl = '';
        currentBgFallbackUrl = undefined;
      }
      return;
    }
    if (bgId === lastBgId) return;
    flushText();
    flushPendingScene();
    flushChoices();
    lastBgId = bgId;
    const { url, fallbackUrl } = buildBgAsset(bgId, enableFullScreen);
    currentBgUrl = url;
    currentBgFallbackUrl = fallbackUrl;
    const key = `bg:${url}`;
    if (key !== lastEmittedMediaKey) {
      lastEmittedMediaKey = key;
      blocks.push({ type: 'bg', id: bgId, url, fallbackUrl, fullScreen: enableFullScreen });
    }
  };

  const emitCg = (imgName: string) => {
    if (!imgName || SKIP_IMAGE_ASSET_RE.test(imgName)) return;
    const url = `https://static.atlasacademy.io/CN/Image/${imgName}/${imgName}.png`;
    const key = `cg:${url}`;
    if (key === lastEmittedMediaKey) return;
    flushText();
    flushPendingScene();
    flushChoices();
    lastEmittedMediaKey = key;
    blocks.push({ type: 'cg', name: imgName, url });
  };

  const emitEquip = (equipId: string) => {
    if (!equipId) return;
    const url = `https://static.atlasacademy.io/CN/CharaGraph/${equipId}/${equipId}a.png`;
    const key = `equip:${url}`;
    if (key === lastEmittedMediaKey) return;
    flushText();
    flushPendingScene();
    flushChoices();
    lastEmittedMediaKey = key;
    blocks.push({ type: 'equip', equipId, url });
  };

  const queueCharaScene = (asset: Extract<SlotAsset, { kind: 'chara' }>) => {
    pendingScene = {
      type: 'scene',
      bgUrl: currentBgUrl || undefined,
      bgFallbackUrl: currentBgFallbackUrl,
      charaId: asset.charaId,
      figureUrl: asset.url,
      face: asset.face,
      name: asset.name || speaker || '登场角色',
      fullScreen: enableFullScreen,
      silhouette: asset.silhouette,
      cameraFilter: cameraFilter || undefined,
    };
  };

  const emitMark = (markName: string) => {
    if (!markName) return;
    const url = `https://static.atlasacademy.io/CN/Marks/${markName}.png`;
    const key = `mark:${url}`;
    if (key === lastEmittedMediaKey) return;
    flushText();
    flushPendingScene();
    flushChoices();
    lastEmittedMediaKey = key;
    blocks.push({ type: 'mark', name: markName, url });
  };

  const showSlotAsset = (slot: string) => {
    const asset = slotMap.get(slot);
    if (!asset) return;
    if (asset.kind === 'scene') {
      emitBg(asset.bgId);
    } else if (asset.kind === 'cg') {
      emitCg(asset.imgName);
    } else if (asset.kind === 'equip') {
      emitEquip(asset.equipId);
    } else if (asset.kind === 'chara') {
      asset.visible = true;
      queueCharaScene(asset);
    }
  };

  const handleCommandTag = (tagBody: string) => {
    const parts = tagBody.trim().split(/\s+/);
    const cmd = parts[0];
    if (!cmd) return;

    switch (cmd) {
      case 'enableFullScreen':
        enableFullScreen = true;
        break;
      case 'cameraFilter': {
        const mode = (parts[1] || '').toLowerCase();
        cameraFilter = mode === 'normal' || mode === 'none' ? '' : mode;
        break;
      }
      case 'scene':
        if (parts[1]) emitBg(parts[1]);
        break;
      case 'sceneSet': {
        const slot = parts[1];
        const bgId = parts[2];
        if (slot && bgId) {
          const { url, fallbackUrl } = buildBgAsset(bgId, enableFullScreen);
          slotMap.set(slot, { kind: 'scene', bgId, url, fallbackUrl });
        }
        break;
      }
      case 'imageSet':
      case 'verticalImageSet':
      case 'horizontalImageSet': {
        const slot = parts[1];
        const imgName = parts[2];
        if (slot && imgName && !SKIP_IMAGE_ASSET_RE.test(imgName)) {
          slotMap.set(slot, {
            kind: 'cg',
            imgName,
            url: `https://static.atlasacademy.io/CN/Image/${imgName}/${imgName}.png`,
          });
        }
        break;
      }
      case 'equipSet': {
        const slot = parts[1];
        const equipId = parts[2];
        if (slot && equipId) {
          slotMap.set(slot, {
            kind: 'equip',
            equipId,
            url: `https://static.atlasacademy.io/CN/CharaGraph/${equipId}/${equipId}a.png`,
          });
        }
        break;
      }
      case 'charaSet': {
        const slot = parts[1];
        const charaId = parts[2];
        const name = cleanSpeakerName(parts.slice(4).join(' ').trim());
        if (slot && charaId && /^\d+$/.test(charaId)) {
          if (isDummyChara(charaId, name)) {
            slotMap.delete(slot);
          } else {
            slotMap.set(slot, {
              kind: 'chara',
              charaId,
              name,
              url: `https://static.atlasacademy.io/CN/CharaFigure/${charaId}/${charaId}_merged.png`,
              face: 0,
              silhouette: false,
              visible: false,
            });
          }
        }
        break;
      }
      case 'charaChange':
      case 'charaCrossFade': {
        const slot = parts[1];
        const charaId = parts[2];
        const prev = slotMap.get(slot);
        const name =
          parts.slice(4).join(' ').trim() ||
          (prev && prev.kind === 'chara' ? prev.name : '') ||
          speaker;
        if (slot && charaId && /^\d+$/.test(charaId)) {
          if (isDummyChara(charaId, name)) {
            slotMap.delete(slot);
          } else {
            const nextAsset: Extract<SlotAsset, { kind: 'chara' }> = {
              kind: 'chara',
              charaId,
              name,
              url: `https://static.atlasacademy.io/CN/CharaFigure/${charaId}/${charaId}_merged.png`,
              face: prev && prev.kind === 'chara' ? prev.face : 0,
              silhouette: prev && prev.kind === 'chara' ? prev.silhouette : false,
              visible: true,
            };
            slotMap.set(slot, nextAsset);
            queueCharaScene(nextAsset);
          }
        }
        break;
      }
      case 'charaFilter': {
        const slot = parts[1];
        const filterType = (parts[2] || '').toLowerCase();
        const asset = slotMap.get(slot);
        if (asset && asset.kind === 'chara') {
          asset.silhouette = filterType === 'silhouette';
        }
        break;
      }
      case 'charaTalk': {
        const target = parts[1] || '';
        if (target && target !== 'on' && target !== 'off' && target !== 'depthOn' && target !== 'depthOff') {
          activeTalkSlot = target;
          const asset = slotMap.get(target);
          if (asset && asset.kind === 'chara' && asset.visible) {
            queueCharaScene(asset);
          }
        }
        break;
      }
      case 'charaFace':
      case 'charaFaceFade': {
        const slot = parts[1];
        const faceNum = Number(parts[2] || 0);
        const asset = slotMap.get(slot);
        if (asset && asset.kind === 'chara' && Number.isFinite(faceNum)) {
          asset.face = faceNum;
          if (asset.visible || activeTalkSlot === slot) {
            queueCharaScene(asset);
          }
        }
        break;
      }
      case 'charaFadeout': {
        const slot = parts[1];
        const asset = slotMap.get(slot);
        if (asset && asset.kind === 'chara') {
          asset.visible = false;
        }
        break;
      }
      case 'charaPut':
      case 'charaPutFSR': {
        const slot = parts[1];
        const coord = parts[2];
        if (!slot) break;
        if (isOffscreenCoord(coord)) {
          // 移出屏幕外（如 1200,1200 / 2000,2000）表示隐藏或特效占位，不展示立绘
          const asset = slotMap.get(slot);
          if (asset && asset.kind === 'chara') {
            asset.visible = false;
          }
          break;
        }
        showSlotAsset(slot);
        break;
      }
      case 'charaFadeTime': {
        const slot = parts[1];
        const alpha = Number(parts[3]);
        if (!slot) break;
        if (Number.isFinite(alpha) && alpha <= 0.01) {
          // 透明度渐变到 0 等同隐藏，不展示立绘
          const asset = slotMap.get(slot);
          if (asset && asset.kind === 'chara') {
            asset.visible = false;
          }
          break;
        }
        showSlotAsset(slot);
        break;
      }
      case 'charaFadein':
      case 'charaFadeinFSL':
      case 'charaFadeinFSR': {
        const slot = parts[1];
        const coord = parts[3];
        if (!slot || isOffscreenCoord(coord)) break;
        showSlotAsset(slot);
        break;
      }
      case 'charaCutin':
      case 'charaCutinPause': {
        const slot = parts[1];
        if (slot) showSlotAsset(slot);
        break;
      }
      case 'pictureFrame': {
        const imgName = parts[1];
        if (imgName && !SKIP_IMAGE_ASSET_RE.test(imgName)) {
          emitCg(imgName);
        }
        break;
      }
      case 'image': {
        const markName = parts[1];
        if (markName) emitMark(markName);
        break;
      }
      default:
        break;
    }
  };

  for (const rawLine of lines) {
    const s = rawLine.trim();
    if (!s) continue;

    // 1. 脚本头与注释
    if (s.startsWith('＄') || s.startsWith('//')) {
      continue;
    }

    // 2. 说话人标记：＠玛修 或 ＠B：希翁? 或 ＠（清空说话人转为旁白）
    if (s.startsWith('＠')) {
      flushText();
      flushChoices();
      speaker = cleanSpeakerName(s.slice(1).trim());
      continue;
    }

    // 3. 分支选项：？1：选项内容
    const mChoice = s.match(/^？(\d+)：(.*)$/);
    if (mChoice) {
      flushText();
      const optText = cleanInlineMarkup(mChoice[2]);
      if (optText) {
        pendingChoices.push({ index: mChoice[1], text: optText });
      }
      continue;
    }
    if (s.startsWith('？！')) {
      flushText();
      flushChoices();
      continue;
    }

    // 4. 整行均为演出指令标签（允许一行内连续多个 [cmd ...]）
    if (/^(?:\[[^\]]+\]\s*)+$/.test(s)) {
      const matches = s.matchAll(/\[([^\]]+)\]/g);
      for (const m of matches) {
        const body = m[1].trim();
        if (body === 'k' || body === 'messageOff') {
          flushText();
        } else {
          handleCommandTag(body);
        }
      }
      continue;
    }

    // 5. 正文行内若包含 [image xxx] 标记图，也提取展示
    if (s.includes('[image ')) {
      const markMatches = s.matchAll(/\[image\s+(\S+)\]/g);
      for (const m of markMatches) {
        emitMark(m[1]);
      }
    }

    // 6. 对话/旁白正文
    if (s.includes('[k]')) {
      buf.push(s.replace(/\[k\]/g, ''));
      flushText();
    } else {
      buf.push(s);
    }
  }

  flushText();
  flushPendingScene();
  flushChoices();
  return blocks;
}

export async function loadStoryScript(
  scriptId: string,
  scriptUrl: string,
  forceRefresh = false
): Promise<ParsedStoryScript> {
  if (!forceRefresh) {
    const cached = await idbGet<ParsedStoryScript>('scripts', scriptId);
    if (cached && Array.isArray(cached.blocks) && cached.parserVersion === SCRIPT_PARSER_VERSION) {
      return cached;
    }
  }

  const rawText = await fetchAtlasText(scriptUrl);
  const blocks = parseStoryScript(rawText);
  const parsed: ParsedStoryScript = {
    scriptId,
    blocks,
    fetchedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    parserVersion: SCRIPT_PARSER_VERSION,
  };
  await idbPut('scripts', parsed);
  return parsed;
}

export async function getCachedScriptIdSet(): Promise<Set<string>> {
  const keys = await idbGetAllKeys('scripts');
  return new Set(keys);
}

/**
 * 低速串行缓存整章全部剧情文本（每次请求间隔 150ms，避免并发压力）
 */
export async function cacheWarAllScripts(
  entries: StoryScriptEntry[],
  onProgress: (done: number, total: number) => void
): Promise<{ cachedCount: number; failedCount: number }> {
  const existing = await getCachedScriptIdSet();
  const total = entries.length;
  let done = 0;
  let cachedCount = 0;
  let failedCount = 0;

  for (const entry of entries) {
    if (existing.has(entry.scriptId)) {
      done++;
      cachedCount++;
      onProgress(done, total);
      continue;
    }
    try {
      await loadStoryScript(entry.scriptId, entry.scriptUrl, false);
      cachedCount++;
    } catch {
      failedCount++;
    }
    done++;
    onProgress(done, total);
    if (done < total) {
      await sleep(150);
    }
  }
  return { cachedCount, failedCount };
}

/* ========================= 章节阅读进度记忆（localStorage） ========================= */

export function getAllWarProgress(): Record<number, WarReadProgress> {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getWarProgress(warId: number): WarReadProgress | null {
  const all = getAllWarProgress();
  return all[warId] || null;
}

export function saveWarProgress(
  warId: number,
  entryIndex: number,
  scriptId: string,
  title: string,
  scrollTop: number
): WarReadProgress {
  const all = getAllWarProgress();
  const prev = all[warId];
  const readSet = new Set<string>(prev?.readScriptIds || []);
  readSet.add(scriptId);

  const next: WarReadProgress = {
    warId,
    lastScriptId: scriptId,
    lastEntryIndex: entryIndex,
    lastTitle: title,
    lastScrollTop: Math.max(0, Math.round(scrollTop)),
    readScriptIds: Array.from(readSet),
    updatedAt: Date.now(),
  };
  all[warId] = next;
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore storage quota errors
  }
  return next;
}
