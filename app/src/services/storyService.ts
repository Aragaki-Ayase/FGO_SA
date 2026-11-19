import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  StoryWarCategory,
  StoryWarSummary,
  StoryWarsPayload,
  StoryScriptEntry,
  StoryWarDetail,
  StoryBlock,
  ParsedStoryScript,
  WarReadProgress,
} from '../types';

const STORY_DB_NAME = 'atlas_story_cache_v1';
const PROGRESS_STORAGE_KEY = 'mooncell_story_progress_v1';
const STORY_DATA_VERSION = '20261119v4';
const STORY_OVERRIDES_KEY = 'story_wars_overrides_v2';

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
    const req = indexedDB.open(STORY_DB_NAME, 1);
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

async function fetchAtlasJson(apiPath: string, retries = 3): Promise<any> {
  const fullUrl = `https://api.atlasacademy.io${apiPath}`;
  let lastErr: any = null;

  for (let i = 0; i < retries; i++) {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({
          url: fullUrl,
          headers: { 'User-Agent': 'MooncellOfflineApp/1.0' },
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      }

      // Web 端优先走 Vite 代理，回退直连（Atlas Academy 允许 CORS）
      const proxyResp = await fetch(`/atlas-api${apiPath}`);
      const ct = proxyResp.headers.get('content-type') || '';
      if (proxyResp.ok && ct.includes('json')) {
        return await proxyResp.json();
      }
      const directResp = await fetch(fullUrl);
      if (!directResp.ok) throw new Error(`HTTP ${directResp.status}`);
      return await directResp.json();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await sleep(500 * (i + 1));
    }
  }
  throw lastErr || new Error('连接 Atlas Academy 失败');
}

async function fetchAtlasText(rawUrl: string, retries = 3): Promise<string> {
  let lastErr: any = null;

  for (let i = 0; i < retries; i++) {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({
          url: rawUrl,
          headers: { 'User-Agent': 'MooncellOfflineApp/1.0' },
        });
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        return typeof res.data === 'string' ? res.data : String(res.data ?? '');
      }

      const proxied = toProxiedStaticUrl(rawUrl);
      const resp = await fetch(proxied);
      if (resp.ok) {
        const text = await resp.text();
        if (!text.startsWith('<!DOCTYPE') && !text.startsWith('<html')) {
          return text;
        }
      }
      const directResp = await fetch(rawUrl);
      if (!directResp.ok) throw new Error(`HTTP ${directResp.status}`);
      return await directResp.text();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await sleep(500 * (i + 1));
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
    const evList = all.filter((w) => w.category === 'event').sort((a, b) => (b.startJp || 0) - (a.startJp || 0) || b.id - a.id);
    base.wars = [...mainList, ...evList];
    base.counts = { total: base.wars.length, main: mainList.length, event: evList.length };
    if (cached.updatedAt) base.generatedAt = cached.updatedAt;
  }
  return base;
}

function fmtJstDate(ts: number): string {
  if (!ts || ts <= 0) return '';
  const d = new Date((ts + 9 * 3600) * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function syncStoryWarsFromAtlas(): Promise<{
  wars: StoryWarSummary[];
  addedCount: number;
}> {
  const [rawList, jpEvents] = await Promise.all([
    fetchAtlasJson('/export/CN/basic_war.json'),
    fetchAtlasJson('/export/JP/basic_event.json').catch(() => []),
  ]);

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
      startJp,
      startJpDate: fmtJstDate(startJp),
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
  const evList = parsed
    .filter((w) => w.category === 'event')
    .sort((a, b) => (b.startJp || 0) - (a.startJp || 0) || b.id - a.id);
  return {
    wars: [...mainList, ...evList],
    addedCount: Math.max(0, parsed.length - prevCount),
  };
}

/* ========================= 章节内剧情节目录加载 ========================= */

export async function loadWarDetail(
  warId: number,
  forceRefresh = false
): Promise<StoryWarDetail> {
  if (!forceRefresh) {
    const cached = await idbGet<StoryWarDetail>('war_details', warId);
    if (cached && Array.isArray(cached.entries)) {
      return cached;
    }
  }

  const raw = await fetchAtlasJson(`/nice/CN/war/${warId}`);
  const entries: StoryScriptEntry[] = [];
  const seenScriptIds = new Set<string>();

  for (const spot of raw?.spots || []) {
    const spotName = String(spot?.name || '').trim().replace(/\n/g, ' ');
    for (const q of spot?.quests || []) {
      const questName = String(q?.name || '').trim().replace(/\n/g, ' ');
      const phaseScripts = Array.isArray(q?.phaseScripts) ? q.phaseScripts : [];
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
            partLabel = idx === 0 ? '战斗前' : idx === scripts.length - 1 ? '战斗后' : `片段 ${idx + 1}`;
          } else if (phaseScripts.length > 1) {
            partLabel = `进度 ${phase}`;
          }

          entries.push({
            scriptId,
            scriptUrl,
            spotName: spotName || '剧情节点',
            questName: questName || `节 ${entries.length + 1}`,
            phase,
            partLabel,
          });
        });
      }
    }
  }

  const detail: StoryWarDetail = {
    warId,
    name: String(raw?.name || '').trim().replace(/\n/g, ' '),
    longName: String(raw?.longName || raw?.name || '').trim().replace(/\n/g, ' '),
    entries,
    fetchedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
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
  // 清除其余行内演出控制码（如 [f ...] [s ...] [wt ...] 等）
  text = text.replace(/\[[a-zA-Z0-9_]+(?:\s+[^\]]*)?\]/g, '');
  // 压缩多余空白
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

const SKIP_EFFECT_IMAGE_RE = /(cinema|text\d*|mask|frame|black|white|effect|line\d*|flash|fade|blur|sepia|noise|overlay|shadow|vignette)/i;

export function parseStoryScript(rawText: string): StoryBlock[] {
  const lines = rawText.split(/\r?\n/);
  const blocks: StoryBlock[] = [];
  let speaker = '';
  let buf: string[] = [];
  let lastBgId = '';
  let pendingChoices: { index: string; text: string }[] = [];

  const flushChoices = () => {
    if (pendingChoices.length > 0) {
      blocks.push({ type: 'choices', options: pendingChoices });
      pendingChoices = [];
    }
  };

  const flushText = () => {
    if (buf.length === 0) return;
    const cleaned = cleanInlineMarkup(buf.join(''));
    buf = [];
    if (!cleaned) return;
    flushChoices();
    if (speaker) {
      blocks.push({ type: 'dialogue', speaker, text: cleaned });
    } else {
      blocks.push({ type: 'narration', text: cleaned });
    }
  };

  for (const rawLine of lines) {
    const s = rawLine.trim();
    if (!s) continue;

    // 1. 场景背景切换：[scene 92601]
    const mBg = s.match(/^\[scene\s+(\d+)/);
    if (mBg) {
      const bgId = mBg[1];
      // 跳过纯黑(10000)、纯白(10001)或与当前重复的背景
      if (bgId !== '10000' && bgId !== '10001' && bgId !== lastBgId) {
        flushText();
        flushChoices();
        lastBgId = bgId;
        blocks.push({
          type: 'bg',
          id: bgId,
          url: `https://static.atlasacademy.io/CN/Back/back${bgId}.png`,
        });
      }
      continue;
    }

    // 2. 剧情插图 CG：[imageSet A cut044_erz 1]
    const mImg = s.match(/^\[imageSet\s+\S+\s+(\S+)/);
    if (mImg) {
      const imgName = mImg[1];
      if (!SKIP_EFFECT_IMAGE_RE.test(imgName)) {
        flushText();
        flushChoices();
        blocks.push({
          type: 'cg',
          name: imgName,
          url: `https://static.atlasacademy.io/CN/Image/${imgName}/${imgName}.png`,
        });
      }
      continue;
    }

    // 3. 说话人标记：＠玛修 或 ＠（清空说话人转为旁白）
    if (s.startsWith('＠')) {
      flushText();
      flushChoices();
      speaker = s.slice(1).trim();
      continue;
    }

    // 4. 分支选项：？1：选项内容
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

    // 5. 段落结束符
    if (s === '[k]' || s === '[k][messageOff]' || s === '[messageOff]') {
      flushText();
      continue;
    }

    // 6. 整行均为演出指令、脚本头或注释，直接剔除
    if ((s.startsWith('[') && s.endsWith(']')) || s.startsWith('＄') || s.startsWith('//')) {
      continue;
    }

    // 7. 对话/旁白正文
    if (s.includes('[k]')) {
      buf.push(s.replace(/\[k\]/g, ''));
      flushText();
    } else {
      buf.push(s);
    }
  }

  flushText();
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
    if (cached && Array.isArray(cached.blocks)) {
      return cached;
    }
  }

  const rawText = await fetchAtlasText(scriptUrl);
  const blocks = parseStoryScript(rawText);
  const parsed: ParsedStoryScript = {
    scriptId,
    blocks,
    fetchedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
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
