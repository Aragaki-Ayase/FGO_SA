import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  CatalogSummaryPayload,
  ExtrasCatalogPayload,
  EventsBannersPayload,
  EventSummary,
  BannerSummary,
  EventQuestConfigData,
  ServantDetail,
  CraftEssenceDetail,
  ServantSummary,
  CraftEssenceSummary,
  ServantStoriesPayload,
} from '../types';

const svtChunkCache = new Map<string, Record<string, ServantDetail>>();
const ceChunkCache = new Map<string, Record<string, CraftEssenceDetail>>();

const DB_NAME = 'mooncell_offline_overrides_v2';

function openOverrideDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('servants')) {
        db.createObjectStore('servants', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('ces')) {
        db.createObjectStore('ces', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('quest_configs')) {
        db.createObjectStore('quest_configs', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('data_blobs')) {
        db.createObjectStore('data_blobs', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  try {
    const db = await openOverrideDb();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openOverrideDb();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function idbPut<T>(storeName: string, val: T): Promise<void> {
  try {
    const db = await openOverrideDb();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(val);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore storage errors
  }
}

async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  try {
    const db = await openOverrideDb();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore storage errors
  }
}

const DATA_VERSION = '20261120v1';
const EVENTS_BANNERS_OVERRIDES_KEY = 'events_banners_overrides_v2';

const CLOUD_DATA_BASES = [
  'https://fastly.jsdelivr.net/gh/Aragaki-Ayase/FGO_SA@main/app/public/data',
  'https://gcore.jsdelivr.net/gh/Aragaki-Ayase/FGO_SA@main/app/public/data',
  'https://cdn.jsdelivr.net/gh/Aragaki-Ayase/FGO_SA@main/app/public/data',
  'https://ghfast.top/https://raw.githubusercontent.com/Aragaki-Ayase/FGO_SA/main/app/public/data',
  'https://raw.githubusercontent.com/Aragaki-Ayase/FGO_SA/main/app/public/data',
];

// 记录本轮竞速最快成功的云端线路，后续分片下载直接复用
let preferredCloudBase: string | null = null;

export interface CloudManifest {
  version: string;
  updatedAt: string;
  counts: Record<string, number>;
  files: Record<string, string>;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  connectTimeout = 5000,
  readTimeout = 10000
): Promise<T> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
      headers: { 'User-Agent': 'MooncellOfflineApp/1.0' },
      connectTimeout,
      readTimeout,
    });
    if (res.status === 200) {
      return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    }
    throw new Error(`HTTP ${res.status}`);
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), readTimeout);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 并发探测全部云端线路拉取 cloud_manifest.json（单线路 5s 超时）：
 * 从成功返回的线路中挑选 updatedAt 最新的清单（同为最新时优先最快线路），
 * 彻底避免 jsDelivr 对 @main 的 CDN 旧缓存抢先返回导致漏掉刚提交的更新。
 */
async function raceCloudManifest(): Promise<CloudManifest> {
  const bust = `t=${Date.now()}`;
  const tasks = CLOUD_DATA_BASES.map((base, idx) =>
    fetchJsonWithTimeout<CloudManifest>(`${base}/cloud_manifest.json?${bust}`, 5000, 6000).then(
      (manifest) => {
        if (!manifest || typeof manifest !== 'object' || !manifest.files) {
          throw new Error('invalid manifest');
        }
        return { base, manifest, idx, doneAt: Date.now() };
      }
    )
  );

  const settled = await Promise.allSettled(tasks);
  const successes = settled
    .filter(
      (r): r is PromiseFulfilledResult<{ base: string; manifest: CloudManifest; idx: number; doneAt: number }> =>
        r.status === 'fulfilled'
    )
    .map((r) => r.value);

  if (successes.length === 0) {
    throw new Error('全部云端线路均不可达');
  }

  // 先按 updatedAt 字符串降序选最新数据，再按响应完成时间升序选最快线路
  successes.sort((a, b) => {
    const cmp = String(b.manifest.updatedAt || '').localeCompare(String(a.manifest.updatedAt || ''));
    if (cmp !== 0) return cmp;
    return a.doneAt - b.doneAt;
  });

  const winner = successes[0];
  preferredCloudBase = winner.base;
  return winner.manifest;
}

async function fetchCloudJson<T>(relPath: string): Promise<T> {
  if (relPath === 'cloud_manifest.json') {
    return (await raceCloudManifest()) as unknown as T;
  }

  const bust = `t=${Date.now()}`;
  const orderedBases = preferredCloudBase
    ? [preferredCloudBase, ...CLOUD_DATA_BASES.filter((b) => b !== preferredCloudBase)]
    : CLOUD_DATA_BASES;

  let lastErr: any = null;
  for (const base of orderedBases) {
    const url = `${base}/${relPath}?${bust}`;
    try {
      const data = await fetchJsonWithTimeout<T>(url, 5000, 15000);
      preferredCloudBase = base;
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`拉取云端数据失败: ${relPath}`);
}

export async function loadExtrasCatalog(): Promise<ExtrasCatalogPayload> {
  const cached = await idbGet<{ key: string; data: ExtrasCatalogPayload }>(
    'data_blobs',
    'extras_catalog.json'
  );
  if (cached?.data) {
    return cached.data;
  }
  const resp = await fetch(`./data/extras_catalog.json?v=${DATA_VERSION}`);
  if (!resp.ok) {
    throw new Error('无法加载魔术礼装/灵衣/道具离线数据');
  }
  return await resp.json();
}

export async function loadServantStories(): Promise<ServantStoriesPayload> {
  const cached = await idbGet<{ key: string; data: ServantStoriesPayload }>(
    'data_blobs',
    'servant_stories.json'
  );
  if (cached?.data) {
    return cached.data;
  }
  const resp = await fetch(`./data/servant_stories.json?v=${DATA_VERSION}`);
  if (!resp.ok) {
    throw new Error('无法加载从者幕间物语与情人节剧情索引');
  }
  return await resp.json();
}

export async function loadEventsBanners(): Promise<EventsBannersPayload> {
  const cachedBlob = await idbGet<{ key: string; data: EventsBannersPayload }>(
    'data_blobs',
    'events_banners.json'
  );
  const cachedBanners = cachedBlob?.data?.banners;
  const isCorruptLuckybagBlob =
    Array.isArray(cachedBanners) &&
    cachedBanners.length > 10 &&
    cachedBanners.every((b) => b.luckybag);

  let base: EventsBannersPayload;
  if (cachedBlob?.data && !isCorruptLuckybagBlob) {
    base = structuredClone(cachedBlob.data);
  } else {
    const resp = await fetch(`./data/events_banners.json?v=${DATA_VERSION}`);
    if (!resp.ok) {
      throw new Error('无法加载活动一览与卡池一览离线数据');
    }
    base = await resp.json();
  }

  const cachedOverrides = await idbGet<{
    key: string;
    events?: EventSummary[];
    banners?: BannerSummary[];
    updatedAt?: string;
  }>('meta', EVENTS_BANNERS_OVERRIDES_KEY);

  if (cachedOverrides) {
    if (cachedOverrides.events && cachedOverrides.events.length > 0) {
      const evMap = new Map(base.events.map((e) => [e.title, e]));
      for (const e of cachedOverrides.events) {
        evMap.set(e.title, e);
      }
      base.events = Array.from(evMap.values()).sort(
        (a, b) => Math.max(b.startJp, b.startCn) - Math.max(a.startJp, a.startCn)
      );
      base.counts.events = base.events.length;
    }
    if (cachedOverrides.banners && cachedOverrides.banners.length > 0) {
      const bnMap = new Map(base.banners.map((b) => [b.title, b]));
      for (const b of cachedOverrides.banners) {
        bnMap.set(b.title, b);
      }
      base.banners = Array.from(bnMap.values()).sort(
        (a, b) => Math.max(b.startJp, b.startCn) - Math.max(a.startJp, a.startCn)
      );
      base.counts.banners = base.banners.length;
    }
    if (cachedOverrides.updatedAt) {
      base.generatedAt = cachedOverrides.updatedAt;
    }
  }

  return base;
}

function reverseAzraelTrials(
  rawHtml: string,
  sections: { index: string; line: string; anchor: string; level: string }[]
): {
  html: string;
  sections: { index: string; line: string; anchor: string; level: string }[];
} {
  // 在「地狱的试炼关卡」<h2> 之后，将各个 <h3> 试炼关卡块按倒序排列（最新关卡排在最前面）
  const firstH3Idx = rawHtml.search(/<h3\b/i);
  if (firstH3Idx === -1) {
    return { html: rawHtml, sections };
  }

  const prefix = rawHtml.slice(0, firstH3Idx);
  const rest = rawHtml.slice(firstH3Idx);

  // 分离末尾的注释与外层闭合 div
  let bodyPart = rest;
  let suffix = '';
  const tailMatch = rest.match(/(\s*<!--[\s\S]*?-->\s*<\/div>\s*)$/);
  if (tailMatch && tailMatch.index !== undefined) {
    bodyPart = rest.slice(0, tailMatch.index);
    suffix = rest.slice(tailMatch.index);
  }

  const h3Parts = bodyPart.split(/(?=<h3\b)/i).filter((chunk) => chunk.trim().length > 0);
  if (h3Parts.length <= 1) {
    return { html: rawHtml, sections };
  }

  h3Parts.reverse();
  const reversedHtml = prefix + h3Parts.join('\n') + suffix;

  // 同步倒序 sections 中的 level 3 试炼条目，使顶部胶囊导航也是最新在最前
  const lv3 = sections.filter((s) => Number(s.level) === 3).reverse();
  let lv3Cursor = 0;
  const newSections = sections.map((s) => {
    if (Number(s.level) === 3 && lv3Cursor < lv3.length) {
      return lv3[lv3Cursor++];
    }
    return s;
  });

  return { html: reversedHtml, sections: newSections };
}

function sanitizeWikiHtml(rawHtml: string): string {
  let html = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/src="\/\//g, 'src="https://')
    .replace(/srcset="[^"]*"/gi, '')
    // 移除原网页的折叠目录块 (#toc)
    .replace(/<div id="toc"[\s\S]*?<\/ul>\s*<\/div>/gi, '')
    // 移除亚兹拉尔之庙等页面顶部的「快速跳转」提示框（包含 nomobile 与 nodesktop 两个块）
    .replace(
      /<div class="(?:nomobile[^"]*|nodesktop[^"]*)"[^>]*>\s*<div[^>]*>[\s\S]*?<\/div>\s*<div[^>]*>\s*<big><b>快速跳转<\/b><\/big>[\s\S]*?<\/div>\s*<\/div>/gi,
      ''
    );

  // 将 <a href="..."> 转换为带 data-mc-page / data-mc-anchor 的安全内联节点，支持 App 内部点击跳转各子关卡配置
  html = html.replace(/<a\b([^>]*)>/gi, (_full, attrs: string) => {
    const hrefMatch = attrs.match(/\bhref="([^"]+)"/i);
    if (!hrefMatch) {
      return '<span class="mc-wiki-link-text">';
    }
    const rawHref = hrefMatch[1].trim();
    if (rawHref.startsWith('#')) {
      let anchor = rawHref.slice(1);
      try {
        anchor = decodeURIComponent(anchor);
      } catch {
        // ignore decode error
      }
      const safeAnchor = anchor.replace(/"/g, '&quot;');
      return `<span class="mc-wiki-link-text mc-wiki-nav-link" data-mc-anchor="${safeAnchor}">`;
    }
    if (rawHref.startsWith('/w/')) {
      const pathAndHash = rawHref.slice(3);
      const [rawPage, rawHash = ''] = pathAndHash.split('#');
      let page = rawPage;
      let anchor = rawHash;
      try {
        page = decodeURIComponent(rawPage).replace(/_/g, ' ').trim();
      } catch {
        page = rawPage.replace(/_/g, ' ').trim();
      }
      try {
        anchor = rawHash ? decodeURIComponent(rawHash).trim() : '';
      } catch {
        anchor = rawHash.trim();
      }
      // 排除文件/分类/特殊页面
      if (
        page &&
        !page.startsWith('文件:') &&
        !page.startsWith('File:') &&
        !page.startsWith('分类:') &&
        !page.startsWith('特殊:')
      ) {
        const safePage = page.replace(/"/g, '&quot;');
        const safeAnchor = anchor.replace(/"/g, '&quot;');
        return `<span class="mc-wiki-link-text mc-wiki-nav-link" data-mc-page="${safePage}" data-mc-anchor="${safeAnchor}">`;
      }
    }
    return '<span class="mc-wiki-link-text">';
  });

  return html.replace(/<\/a>/gi, '</span>');
}

/**
 * Load an event or main-story chapter's quest configuration (`{title}/关卡配置` or fallback `{title}`)
 * from IndexedDB cache or Mooncell action=parse API, then cache locally for offline viewing.
 */
export async function loadEventQuestConfig(
  eventTitle: string,
  forceRefresh = false
): Promise<EventQuestConfigData> {
  const cleanTitle = eventTitle.trim();
  const cacheKey = `v3:${cleanTitle}`;
  if (!forceRefresh) {
    const cached = await idbGet<{ key: string; data: EventQuestConfigData }>('quest_configs', cacheKey);
    if (cached?.data) {
      return cached.data;
    }
  }

  const candidates =
    cleanTitle.includes('/关卡配置') ||
    cleanTitle.includes('/从者任务') ||
    cleanTitle.startsWith('迦勒底之门/')
      ? [cleanTitle]
      : [`${cleanTitle}/关卡配置`, cleanTitle];

  for (let i = 0; i < candidates.length; i++) {
    const targetTitle = candidates[i];
    const qs =
      'action=parse&page=' +
      encodeURIComponent(targetTitle) +
      '&prop=text|sections|revid&disableeditsection=1&format=json&formatversion=2';
    try {
      const res = await fetchMooncellJson(qs);
      if (res?.parse?.text) {
        let cleanedHtml = sanitizeWikiHtml(res.parse.text);
        let sections = (res.parse.sections || []).map((s: any) => ({
          index: String(s.index || ''),
          line: String(s.line || '').replace(/<[^>]+>/g, ''),
          anchor: String(s.anchor || ''),
          level: String(s.level || '2'),
        }));

        if (cleanTitle.includes('亚兹拉尔之庙') || targetTitle.includes('亚兹拉尔之庙')) {
          const reversed = reverseAzraelTrials(cleanedHtml, sections);
          cleanedHtml = reversed.html;
          sections = reversed.sections;
        }

        const data: EventQuestConfigData = {
          pageTitle: res.parse.title || targetTitle,
          isSubpage: targetTitle.endsWith('/关卡配置'),
          sections,
          html: cleanedHtml,
          fetchedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
          revid: Number(res.parse.revid || 0),
        };
        await idbPut('quest_configs', { key: cacheKey, data });
        return data;
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error('未能获取到该关卡配置（可能处于离线状态或站点尚未建立对应页面）');
}

export async function loadCatalogSummary(): Promise<CatalogSummaryPayload> {
  const cachedBlob = await idbGet<{ key: string; data: CatalogSummaryPayload }>(
    'data_blobs',
    'catalog_summary.json'
  );
  let data: CatalogSummaryPayload;
  if (cachedBlob?.data) {
    data = structuredClone(cachedBlob.data);
  } else {
    const resp = await fetch(`./data/catalog_summary.json?v=${DATA_VERSION}`);
    if (!resp.ok) {
      throw new Error('无法加载离线图鉴索引');
    }
    data = await resp.json();
  }

  const extraSvts = await idbGetAll<ServantSummary>('servants');
  if (extraSvts.length > 0) {
    const map = new Map(data.servants.map((s) => [s.id, s]));
    for (const s of extraSvts) {
      map.set(s.id, s);
    }
    data.servants = Array.from(map.values()).sort((a, b) => b.id - a.id);
    data.counts.servant = data.servants.length;
  }

  const extraCes = await idbGetAll<CraftEssenceSummary>('ces');
  if (extraCes.length > 0) {
    const map = new Map(data.craftEssences.map((c) => [c.id, c]));
    for (const c of extraCes) {
      map.set(c.id, c);
    }
    data.craftEssences = Array.from(map.values()).sort((a, b) => b.id - a.id);
    data.counts.craftEssence = data.craftEssences.length;
  }

  return data;
}

export async function loadServantDetail(id: number): Promise<ServantDetail | null> {
  const override = await idbGet<ServantDetail>('servants', id);
  if (override && override.noblePhantasms) return override;

  const chunkStart = Math.floor((id - 1) / 50) * 50 + 1;
  const chunkEnd = chunkStart + 49;
  const key = `${chunkStart}_${chunkEnd}`;
  if (!svtChunkCache.has(key)) {
    const relPath = `servants/svt_${key}.json`;
    const cachedChunk = await idbGet<{ key: string; data: Record<string, ServantDetail> }>(
      'data_blobs',
      relPath
    );
    if (cachedChunk?.data) {
      svtChunkCache.set(key, cachedChunk.data);
    } else {
      const resp = await fetch(`./data/${relPath}?v=${DATA_VERSION}`);
      if (!resp.ok) return null;
      const json = await resp.json();
      svtChunkCache.set(key, json);
    }
  }
  const chunk = svtChunkCache.get(key);
  return chunk ? chunk[String(id)] || null : null;
}

export async function loadCraftEssenceDetail(id: number): Promise<CraftEssenceDetail | null> {
  const override = await idbGet<CraftEssenceDetail>('ces', id);
  if (override && override.cardFullUrl !== undefined) return override;

  const chunkStart = Math.floor((id - 1) / 200) * 200 + 1;
  const chunkEnd = chunkStart + 199;
  const key = `${chunkStart}_${chunkEnd}`;
  if (!ceChunkCache.has(key)) {
    const relPath = `ces/ce_${key}.json`;
    const cachedChunk = await idbGet<{ key: string; data: Record<string, CraftEssenceDetail> }>(
      'data_blobs',
      relPath
    );
    if (cachedChunk?.data) {
      ceChunkCache.set(key, cachedChunk.data);
    } else {
      const resp = await fetch(`./data/${relPath}?v=${DATA_VERSION}`);
      if (!resp.ok) return null;
      const json = await resp.json();
      ceChunkCache.set(key, json);
    }
  }
  const chunk = ceChunkCache.get(key);
  return chunk ? chunk[String(id)] || null : null;
}

/**
 * 方案 1：从 GitHub 云端自动构建的完整数据包增量拉取变化的 JSON 分片并持久化到本地 IndexedDB。
 * 覆盖：新英灵完整技能/宝具/羁绊/立绘、新概念礼装、新魔术礼装、新灵衣、新素材与掉落效率。
 */
export async function syncFromCloudManifest(
  onProgress?: (phase: string, percent: number) => void
): Promise<{
  updatedFiles: string[];
  catalogUpdated: boolean;
  extrasUpdated: boolean;
  eventsUpdated: boolean;
  servantStoriesUpdated: boolean;
}> {
  onProgress?.('正在检查云端完整数据包清单...', 12);
  const remoteManifest = await fetchCloudJson<CloudManifest>('cloud_manifest.json');
  if (!remoteManifest?.files) {
    return {
      updatedFiles: [],
      catalogUpdated: false,
      extrasUpdated: false,
      eventsUpdated: false,
      servantStoriesUpdated: false,
    };
  }

  // 合并 APK 内置基线哈希与本地已同步哈希
  let localHashes: Record<string, string> = {};
  try {
    const baseResp = await fetch(`./data/cloud_manifest.json?v=${DATA_VERSION}`);
    if (baseResp.ok) {
      const baseManifest: CloudManifest = await baseResp.json();
      localHashes = { ...(baseManifest.files || {}) };
    }
  } catch {
    // ignore if local manifest missing
  }
  const savedHashesObj = await idbGet<{ key: string; hashes?: Record<string, string> }>(
    'meta',
    'cloud_file_hashes'
  );
  if (savedHashesObj?.hashes) {
    localHashes = { ...localHashes, ...savedHashesObj.hashes };
  }

  const changedFiles = Object.entries(remoteManifest.files)
    .filter(([rel, hash]) => rel !== 'story_wars.json' && localHashes[rel] !== hash)
    .map(([rel]) => rel);

  if (changedFiles.length === 0) {
    return {
      updatedFiles: [],
      catalogUpdated: false,
      extrasUpdated: false,
      eventsUpdated: false,
      servantStoriesUpdated: false,
    };
  }

  const updatedFiles: string[] = [];
  let catalogUpdated = false;
  let extrasUpdated = false;
  let eventsUpdated = false;
  let servantStoriesUpdated = false;

  for (let i = 0; i < changedFiles.length; i++) {
    const rel = changedFiles[i];
    onProgress?.(
      `正在增量下载云端完整数据包 (${i + 1}/${changedFiles.length})...`,
      15 + Math.round(((i + 1) / changedFiles.length) * 35)
    );
    try {
      const payload = await fetchCloudJson<any>(rel);
      await idbPut('data_blobs', { key: rel, data: payload });
      localHashes[rel] = remoteManifest.files[rel];
      updatedFiles.push(rel);

      if (rel === 'catalog_summary.json') catalogUpdated = true;
      else if (rel === 'extras_catalog.json') extrasUpdated = true;
      else if (rel === 'events_banners.json') eventsUpdated = true;
      else if (rel === 'servant_stories.json') servantStoriesUpdated = true;
      else if (rel.startsWith('servants/')) svtChunkCache.clear();
      else if (rel.startsWith('ces/')) ceChunkCache.clear();
    } catch {
      // 单个分片失败跳过，下次点击更新会继续补齐
    }
  }

  if (updatedFiles.length > 0) {
    await idbPut('meta', {
      key: 'cloud_file_hashes',
      hashes: localHashes,
      version: remoteManifest.version,
      updatedAt: remoteManifest.updatedAt,
    });
  }

  return {
    updatedFiles,
    catalogUpdated,
    extrasUpdated,
    eventsUpdated,
    servantStoriesUpdated,
  };
}

export interface UpdateProgress {
  running: boolean;
  phase: string;
  current: number;
  total: number;
  updatedServants: number;
  updatedCes: number;
  updatedEvents?: number;
  updatedBanners?: number;
  updatedQuestConfigs?: number;
  lastUpdated?: string;
  error?: string;
}

/**
 * 批量检查本地已缓存的活动/主线关卡配置是否有远端页面修订更新（通过 revid 比对）。
 * 发现变更时：前 10 个主动热刷新，其余失效删除以在下次打开时重拉最新配置。
 */
async function syncCachedQuestConfigs(): Promise<{ checked: number; updated: number }> {
  const allCached = await idbGetAll<{ key: string; data: EventQuestConfigData }>('quest_configs');
  const validItems = allCached.filter(
    (item) => typeof item?.key === 'string' && item.key.startsWith('v3:') && item.data?.pageTitle
  );
  if (validItems.length === 0) {
    return { checked: 0, updated: 0 };
  }

  const latestRevMap = new Map<string, number>();
  const normMap = new Map<string, string>();
  const uniqueTitles = Array.from(new Set(validItems.map((it) => it.data.pageTitle)));

  for (let i = 0; i < uniqueTitles.length; i += 50) {
    const batch = uniqueTitles.slice(i, i + 50);
    const qs =
      `action=query&titles=${encodeURIComponent(batch.join('|'))}` +
      '&prop=revisions&rvprop=ids&format=json&formatversion=2';
    const res = await fetchMooncellJson(qs);
    for (const norm of res?.query?.normalized || []) {
      if (norm?.from && norm?.to) {
        normMap.set(String(norm.from), String(norm.to));
      }
    }
    for (const p of res?.query?.pages || []) {
      const revid = Number(p?.revisions?.[0]?.revid || 0);
      if (p?.title && revid > 0) {
        latestRevMap.set(String(p.title), revid);
      }
    }
  }

  const changedItems: { key: string; eventTitle: string }[] = [];
  for (const item of validItems) {
    const rawTitle = item.data.pageTitle;
    const resolvedTitle = normMap.get(rawTitle) || rawTitle;
    const latestRevid = latestRevMap.get(resolvedTitle) || latestRevMap.get(rawTitle) || 0;
    const localRevid = Number(item.data.revid || 0);
    if (!localRevid || (latestRevid > 0 && latestRevid !== localRevid)) {
      changedItems.push({
        key: item.key,
        eventTitle: item.key.slice(3),
      });
    }
  }

  let updatedCount = 0;
  for (let i = 0; i < changedItems.length; i++) {
    const { key, eventTitle } = changedItems[i];
    if (i < 10) {
      try {
        await loadEventQuestConfig(eventTitle, true);
        updatedCount++;
      } catch {
        // 主动刷新失败时保持现有缓存，避免离线丢数据
      }
    } else {
      await idbDelete('quest_configs', key);
      updatedCount++;
    }
  }

  return { checked: validItems.length, updated: updatedCount };
}

/** 轻量级纯 JS MD5（UTF-8），用于拼接 Mooncell media.fgo.wiki 静态图片地址 */
function md5Hex(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  const len = utf8.length;
  const wordsLen = (((len + 8) >>> 6) + 1) << 4;
  const words = new Uint32Array(wordsLen);
  for (let i = 0; i < len; i++) {
    words[i >>> 2] |= utf8[i] << ((i & 3) << 3);
  }
  words[len >>> 2] |= 0x80 << ((len & 3) << 3);
  words[wordsLen - 2] = (len << 3) >>> 0;
  words[wordsLen - 1] = (len >>> 29) >>> 0;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }

  for (let i = 0; i < wordsLen; i += 16) {
    let aa = a;
    let bb = b;
    let cc = c;
    let dd = d;
    for (let j = 0; j < 64; j++) {
      let f = 0;
      let g = 0;
      if (j < 16) {
        f = (bb & cc) | (~bb & dd);
        g = j;
      } else if (j < 32) {
        f = (dd & bb) | (~dd & cc);
        g = (5 * j + 1) & 15;
      } else if (j < 48) {
        f = bb ^ cc ^ dd;
        g = (3 * j + 5) & 15;
      } else {
        f = cc ^ (bb | ~dd);
        g = (7 * j) & 15;
      }
      const tmp = dd;
      dd = cc;
      cc = bb;
      const sum = (aa + f + k[j] + words[i + g]) >>> 0;
      bb = (bb + ((sum << s[j]) | (sum >>> (32 - s[j])))) >>> 0;
      aa = tmp;
    }
    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const toHex = (n: number) => {
    let out = '';
    for (let i = 0; i < 4; i++) {
      out += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    }
    return out;
  };
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

function buildMooncellMediaUrl(filename: string, thumbWidth?: number): string {
  let clean = (filename || '').trim().replace(/ /g, '_');
  if (!clean) return '';
  if (clean.startsWith('文件:') || clean.startsWith('File:')) {
    clean = clean.split(':').slice(1).join(':').trim();
  }
  if (!clean) return '';
  clean = clean[0].toUpperCase() + clean.slice(1);
  const h = md5Hex(clean);
  const q = encodeURIComponent(clean);
  if (thumbWidth) {
    return `https://media.fgo.wiki/thumb/${h[0]}/${h.slice(0, 2)}/${q}/${thumbWidth}px-${q}`;
  }
  return `https://media.fgo.wiki/${h[0]}/${h.slice(0, 2)}/${q}`;
}

function smwFirstStr(arr: any): string {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  const v = arr[0];
  if (v && typeof v === 'object') return String(v.fulltext || v.raw || '');
  return String(v || '');
}

function smwFirstTs(arr: any): number {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const v = arr[0];
  if (v && typeof v === 'object' && v.timestamp) {
    const n = parseInt(String(v.timestamp), 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function smwFirstBool(arr: any): boolean {
  const s = smwFirstStr(arr).trim().toLowerCase();
  return s === 't' || s === 'true' || s === '1' || s === 'yes' || s === '是';
}

function smwListTitles(arr: any): string[] {
  const out: string[] = [];
  if (!Array.isArray(arr)) return out;
  for (const v of arr) {
    const t = (v && typeof v === 'object' ? String(v.fulltext || '') : String(v || '')).trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function parseCatalogBlocks(rawText: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const blocks = rawText.split(/(?=^id=)/m);
  for (const block of blocks) {
    if (!block.startsWith('id=')) continue;
    const fields: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    if (fields.id) records.push(fields);
  }
  return records;
}

/**
 * Request Mooncell API bypassing browser CORS:
 * 1) On Android APK (Capacitor Native), uses CapacitorHttp native networking stack.
 * 2) On Web Dev/Preview, uses Vite server proxy `/mooncell-api`.
 */
async function fetchMooncellJson(queryString: string): Promise<any> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url: `https://fgo.wiki/api.php?${queryString}`,
      headers: {
        'User-Agent': 'MooncellOfflineApp/1.0',
      },
      connectTimeout: 6000,
      readTimeout: 12000,
    });
    if (res.status !== 200) {
      throw new Error(`Mooncell API HTTP ${res.status}`);
    }
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    // Web environment: use Vite proxy `/mooncell-api` to avoid CORS block
    const proxyResp = await fetch(`/mooncell-api?${queryString}`, { signal: controller.signal });
    const contentType = proxyResp.headers.get('content-type') || '';
    if (proxyResp.ok && contentType.includes('json')) {
      return await proxyResp.json();
    }

    // Fallback direct call
    const directResp = await fetch(`https://fgo.wiki/api.php?${queryString}&origin=*`, {
      signal: controller.signal,
    });
    if (!directResp.ok) {
      throw new Error(`连接 Mooncell 失败 (HTTP ${directResp.status})`);
    }
    return await directResp.json();
  } finally {
    window.clearTimeout(timer);
  }
}

export async function syncFromMooncell(
  currentServants: ServantSummary[],
  currentCes: CraftEssenceSummary[],
  onProgress: (p: UpdateProgress) => void,
  currentEvents: EventSummary[] = [],
  currentBanners: BannerSummary[] = []
): Promise<{
  newServants: ServantSummary[];
  newCes: CraftEssenceSummary[];
  syncedEvents: EventSummary[];
  syncedBanners: BannerSummary[];
  updatedQuestConfigs: number;
}> {
  let updatedServants = 0;
  let updatedCes = 0;
  let updatedEvents = 0;
  let updatedBanners = 0;
  let updatedQuestConfigs = 0;

  onProgress({
    running: true,
    phase: '正在连接 Mooncell 检查最新英灵与礼装图鉴索引...',
    current: 10,
    total: 100,
    updatedServants: 0,
    updatedCes: 0,
  });

  const qs =
    'action=query&titles=' +
    encodeURIComponent('英灵图鉴/数据|礼装图鉴/数据') +
    '&prop=revisions&rvprop=ids|timestamp|content&rvslots=main&format=json&formatversion=2';

  const data = await fetchMooncellJson(qs);
  const pages: any[] = data?.query?.pages || [];

  const svtExistingIds = new Set(currentServants.map((s) => s.id));
  const ceExistingIds = new Set(currentCes.map((c) => c.id));

  const missingSvtRecords: Record<string, string>[] = [];
  const missingCeRecords: Record<string, string>[] = [];
  let onlineSvtTotal = 0;
  let onlineCeTotal = 0;

  for (const p of pages) {
    const content = p?.revisions?.[0]?.slots?.main?.content || '';
    if (p.title === '英灵图鉴/数据') {
      const recs = parseCatalogBlocks(content);
      onlineSvtTotal = recs.length;
      for (const r of recs) {
        const num = parseInt(r.id, 10);
        if (num && !svtExistingIds.has(num)) {
          missingSvtRecords.push(r);
        }
      }
    } else if (p.title === '礼装图鉴/数据') {
      const recs = parseCatalogBlocks(content);
      onlineCeTotal = recs.length;
      for (const r of recs) {
        const num = parseInt(r.id, 10);
        if (num && !ceExistingIds.has(num)) {
          missingCeRecords.push(r);
        }
      }
    }
  }

  onProgress({
    running: true,
    phase: `云端索引读取成功（英灵 ${onlineSvtTotal} / 礼装 ${onlineCeTotal}），正在核对近期页面修订...`,
    current: 55,
    total: 100,
    updatedServants,
    updatedCes,
  });

  const rcQs =
    'action=query&list=recentchanges&rcnamespace=0&rclimit=20&rcprop=title|ids|timestamp&format=json&formatversion=2';
  try {
    await fetchMooncellJson(rcQs);
  } catch {
    // ignore optional recentchanges check
  }

  const totalWork = missingSvtRecords.length + missingCeRecords.length;
  let doneWork = 0;

  const addedSvts: ServantSummary[] = [];
  for (const r of missingSvtRecords) {
    doneWork++;
    const num = parseInt(r.id, 10);
    const title = r.name_link || r.name_cn || r.name || `Servant_${num}`;
    onProgress({
      running: true,
      phase: `正在同步新英灵 #${num} ${title}...`,
      current: 60 + Math.round((doneWork / Math.max(totalWork, 1)) * 35),
      total: 100,
      updatedServants,
      updatedCes,
    });

    const summary: ServantSummary = {
      id: num,
      svtId: '',
      title,
      nameCn: r.name_cn || title,
      nameJp: r.name_jp || '',
      nameEn: r.name_en || '',
      aliases: r.name_other || '',
      rarity: 5,
      className: 'Saber',
      rawClass: 'Saber',
      method: r.method || '期间限定',
      npColors: ['Buster'],
      npTypes: ['全体'],
      npKinds: [],
      traits: [],
      atkMax: 0,
      hpMax: 0,
      iconLocal: `/assets/icons/svt/Servant${String(num).padStart(3, '0')}.jpg`,
      iconRemote: `https://fgo.wiki/w/${encodeURIComponent(title)}`,
    };
    await idbPut('servants', summary);
    addedSvts.push(summary);
    updatedServants++;
  }

  const addedCes: CraftEssenceSummary[] = [];
  for (const r of missingCeRecords) {
    doneWork++;
    const num = parseInt(r.id, 10);
    const title = r.name_link || r.name || `CE_${num}`;
    onProgress({
      running: true,
      phase: `正在同步新礼装 #${num} ${title}...`,
      current: 60 + Math.round((doneWork / Math.max(totalWork, 1)) * 35),
      total: 100,
      updatedServants,
      updatedCes,
    });

    const summary: CraftEssenceSummary = {
      id: num,
      title,
      nameCn: r.name || title,
      nameJp: '',
      aliases: r.name_other || '',
      rarity: 4,
      category: '普通概念礼装',
      type: r.type || '普通概念礼装',
      cost: '9',
      hp: '100',
      atk: '100',
      des: r.des || '',
      desMax: r.des_max || '',
      effectTags: [],
      iconLocal: `/assets/icons/ce/礼装${String(num).padStart(3, '0')}.jpg`,
      iconRemote: '',
      skillIconLocal: '/assets/icons/skill/加攻.png',
      skillIconRemote: '',
    };
    await idbPut('ces', summary);
    addedCes.push(summary);
    updatedCes++;
  }

  const nowStr = new Date().toLocaleString('zh-CN', { hour12: false });

  // 同步最新活动一览（最近 60 条）与卡池一览（最近 80 条），覆盖并持久化至 IndexedDB
  const syncedEvents: EventSummary[] = [];
  const syncedBanners: BannerSummary[] = [];
  const existingEvMap = new Map(currentEvents.map((e) => [e.title, e]));
  const existingBnMap = new Map(currentBanners.map((b) => [b.title, b]));

  onProgress({
    running: true,
    phase: '正在同步最新活动与卡池排期...',
    current: 82,
    total: 100,
    updatedServants,
    updatedCes,
  });

  try {
    const evQuery =
      '[[分类:有活动信息的页面]][[EventType::Event||Campaign||Other]]' +
      '|?EventNameCN|?EventNameJP|?EventStartCN|?EventEndCN|?EventStartJP|?EventEndJP' +
      '|?EventImageCN|?EventImageJP|?EventType|?EventRecentServer' +
      '|sort=EventStartJP|order=desc|limit=60|offset=0';
    const evRes = await fetchMooncellJson(
      `action=ask&query=${encodeURIComponent(evQuery)}&format=json&formatversion=2`
    );
    const evResults = evRes?.query?.results;
    if (evResults && typeof evResults === 'object') {
      for (const [pageTitle, obj] of Object.entries<any>(evResults)) {
        const po = obj?.printouts || {};
        const startCn = smwFirstTs(po.EventStartCN);
        const endCn = smwFirstTs(po.EventEndCN);
        const startJp = smwFirstTs(po.EventStartJP);
        const endJp = smwFirstTs(po.EventEndJP);
        const imgFile = smwFirstStr(po.EventImageCN) || smwFirstStr(po.EventImageJP);
        const ev: EventSummary = {
          title: pageTitle,
          nameCn: smwFirstStr(po.EventNameCN) || pageTitle,
          nameJp: smwFirstStr(po.EventNameJP),
          startCn,
          endCn,
          startJp,
          endJp,
          type: smwFirstStr(po.EventType) || 'Event',
          server: smwFirstStr(po.EventRecentServer) || (startCn > 0 ? 'cn' : 'jp'),
          bannerThumb: imgFile ? buildMooncellMediaUrl(imgFile, 480) : '',
          bannerFull: imgFile ? buildMooncellMediaUrl(imgFile) : '',
        };
        syncedEvents.push(ev);
        const old = existingEvMap.get(pageTitle);
        if (!old || old.startCn !== ev.startCn || old.endCn !== ev.endCn || old.nameCn !== ev.nameCn) {
          updatedEvents++;
        }
      }
    }
  } catch {
    // 活动增量同步失败不阻断整体流程
  }

  onProgress({
    running: true,
    phase: '正在同步最新推荐召唤卡池...',
    current: 92,
    total: 100,
    updatedServants,
    updatedCes,
    updatedEvents,
  });

  try {
    const bnQuery =
      '[[SummonStartJP::+]]' +
      '|?SummonTitleCN|?SummonTitleJP|?SummonImage|?SummonImageCN|?SummonImageJP' +
      '|?SummonStartCN|?SummonEndCN|?SummonStartJP|?SummonEndJP' +
      '|?推荐召唤从者|?推荐召唤礼装|?SummonLuckybag' +
      '|sort=SummonStartJP|order=desc|limit=80|offset=0';
    const bnRes = await fetchMooncellJson(
      `action=ask&query=${encodeURIComponent(bnQuery)}&format=json&formatversion=2`
    );
    const bnResults = bnRes?.query?.results;
    if (bnResults && typeof bnResults === 'object') {
      for (const [pageTitle, obj] of Object.entries<any>(bnResults)) {
        const po = obj?.printouts || {};
        const imgFile =
          smwFirstStr(po.SummonImageCN) ||
          smwFirstStr(po.SummonImage) ||
          smwFirstStr(po.SummonImageJP);
        const bn: BannerSummary = {
          title: pageTitle,
          titleCn: smwFirstStr(po.SummonTitleCN) || pageTitle,
          titleJp: smwFirstStr(po.SummonTitleJP),
          startCn: smwFirstTs(po.SummonStartCN),
          endCn: smwFirstTs(po.SummonEndCN),
          startJp: smwFirstTs(po.SummonStartJP),
          endJp: smwFirstTs(po.SummonEndJP),
          bannerThumb: imgFile ? buildMooncellMediaUrl(imgFile, 480) : '',
          bannerFull: imgFile ? buildMooncellMediaUrl(imgFile) : '',
          servants: smwListTitles(po['推荐召唤从者']),
          ces: smwListTitles(po['推荐召唤礼装']),
          luckybag: smwFirstBool(po.SummonLuckybag),
        };
        syncedBanners.push(bn);
        const old = existingBnMap.get(pageTitle);
        if (
          !old ||
          old.startCn !== bn.startCn ||
          old.endCn !== bn.endCn ||
          old.servants.length !== bn.servants.length ||
          old.luckybag !== bn.luckybag
        ) {
          updatedBanners++;
        }
      }
    }
  } catch {
    // 卡池增量同步失败不阻断整体流程
  }

  // 与历史已保存的覆盖层合并后再持久化到 IndexedDB，保证多次更新累积不丢失
  if (syncedEvents.length > 0 || syncedBanners.length > 0) {
    const prev = await idbGet<{
      key: string;
      events?: EventSummary[];
      banners?: BannerSummary[];
    }>('meta', EVENTS_BANNERS_OVERRIDES_KEY);

    const mergedEvMap = new Map((prev?.events || []).map((e) => [e.title, e]));
    for (const e of syncedEvents) mergedEvMap.set(e.title, e);

    const mergedBnMap = new Map((prev?.banners || []).map((b) => [b.title, b]));
    for (const b of syncedBanners) mergedBnMap.set(b.title, b);

    await idbPut('meta', {
      key: EVENTS_BANNERS_OVERRIDES_KEY,
      events: Array.from(mergedEvMap.values()),
      banners: Array.from(mergedBnMap.values()),
      updatedAt: nowStr,
    });
  }

  await idbPut('meta', { key: 'lastUpdated', value: nowStr });

  onProgress({
    running: true,
    phase: '正在检查已缓存的关卡配置是否有变更...',
    current: 96,
    total: 100,
    updatedServants,
    updatedCes,
    updatedEvents,
    updatedBanners,
    updatedQuestConfigs,
  });

  try {
    const qcRes = await syncCachedQuestConfigs();
    updatedQuestConfigs = qcRes.updated;
  } catch {
    // 关卡配置修订检查失败不阻断整体流程
  }

  const deltaParts: string[] = [];
  if (updatedServants > 0) deltaParts.push(`英灵 +${updatedServants}`);
  if (updatedCes > 0) deltaParts.push(`礼装 +${updatedCes}`);
  if (updatedEvents > 0) deltaParts.push(`活动更新 ${updatedEvents}`);
  if (updatedBanners > 0) deltaParts.push(`卡池更新 ${updatedBanners}`);
  if (updatedQuestConfigs > 0) deltaParts.push(`关卡配置更新 ${updatedQuestConfigs}`);

  onProgress({
    running: false,
    phase:
      deltaParts.length === 0
        ? `同步成功：当前已是最新数据（英灵 ${onlineSvtTotal} · 礼装 ${onlineCeTotal} · 活动/卡池/关卡已核对）`
        : `同步完成：${deltaParts.join(' · ')}（已保存本地）`,
    current: 100,
    total: 100,
    updatedServants,
    updatedCes,
    updatedEvents,
    updatedBanners,
    updatedQuestConfigs,
    lastUpdated: nowStr,
  });

  return {
    newServants: addedSvts,
    newCes: addedCes,
    syncedEvents,
    syncedBanners,
    updatedQuestConfigs,
  };
}
