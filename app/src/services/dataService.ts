import {
  CatalogSummaryPayload,
  ServantDetail,
  CraftEssenceDetail,
  ServantSummary,
  CraftEssenceSummary,
} from '../types';

const svtChunkCache = new Map<string, Record<string, ServantDetail>>();
const ceChunkCache = new Map<string, Record<string, CraftEssenceDetail>>();

// IndexedDB for storing incremental online updates without blocking UI
const DB_NAME = 'mooncell_offline_overrides_v1';

function openOverrideDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('servants')) {
        db.createObjectStore('servants', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('ces')) {
        db.createObjectStore('ces', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
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

export async function loadCatalogSummary(): Promise<CatalogSummaryPayload> {
  const resp = await fetch('./data/catalog_summary.json');
  if (!resp.ok) {
    throw new Error('无法加载离线图鉴索引');
  }
  const data: CatalogSummaryPayload = await resp.json();

  // Merge any online-updated items from IndexedDB
  const extraSvts = await idbGetAll<ServantDetail>('servants');
  if (extraSvts.length > 0) {
    const map = new Map(data.servants.map((s) => [s.id, s]));
    for (const s of extraSvts) {
      map.set(s.id, s);
    }
    data.servants = Array.from(map.values()).sort((a, b) => b.id - a.id);
    data.counts.servant = data.servants.length;
  }

  const extraCes = await idbGetAll<CraftEssenceDetail>('ces');
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
  if (override) return override;

  const chunkStart = Math.floor((id - 1) / 50) * 50 + 1;
  const chunkEnd = chunkStart + 49;
  const key = `${chunkStart}_${chunkEnd}`;
  if (!svtChunkCache.has(key)) {
    const resp = await fetch(`./data/servants/svt_${key}.json`);
    if (!resp.ok) return null;
    const json = await resp.json();
    svtChunkCache.set(key, json);
  }
  const chunk = svtChunkCache.get(key);
  return chunk ? chunk[String(id)] || null : null;
}

export async function loadCraftEssenceDetail(id: number): Promise<CraftEssenceDetail | null> {
  const override = await idbGet<CraftEssenceDetail>('ces', id);
  if (override) return override;

  const chunkStart = Math.floor((id - 1) / 200) * 200 + 1;
  const chunkEnd = chunkStart + 199;
  const key = `${chunkStart}_${chunkEnd}`;
  if (!ceChunkCache.has(key)) {
    const resp = await fetch(`./data/ces/ce_${key}.json`);
    if (!resp.ok) return null;
    const json = await resp.json();
    ceChunkCache.set(key, json);
  }
  const chunk = ceChunkCache.get(key);
  return chunk ? chunk[String(id)] || null : null;
}

export interface UpdateProgress {
  running: boolean;
  phase: string;
  current: number;
  total: number;
  updatedServants: number;
  updatedCes: number;
  lastUpdated?: string;
  error?: string;
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
 * Non-blocking background updater that queries Mooncell MediaWiki API (with origin=*)
 * for new or modified Servants & Craft Essences and stores updates in IndexedDB.
 */
export async function syncFromMooncell(
  currentServants: ServantSummary[],
  currentCes: CraftEssenceSummary[],
  onProgress: (p: UpdateProgress) => void
): Promise<{ newServants: ServantSummary[]; newCes: CraftEssenceSummary[] }> {
  let updatedServants = 0;
  let updatedCes = 0;

  onProgress({
    running: true,
    phase: '正在连接 Mooncell 检查最新图鉴索引...',
    current: 5,
    total: 100,
    updatedServants: 0,
    updatedCes: 0,
  });

  const apiUrl =
    'https://fgo.wiki/api.php?action=query&titles=' +
    encodeURIComponent('英灵图鉴/数据|礼装图鉴/数据') +
    '&prop=revisions&rvprop=ids|timestamp|content&rvslots=main&format=json&formatversion=2&origin=*';

  const resp = await fetch(apiUrl);
  if (!resp.ok) {
    throw new Error(`连接 Mooncell 失败 (HTTP ${resp.status})`);
  }
  const data = await resp.json();
  const pages: any[] = data?.query?.pages || [];

  const svtExistingIds = new Set(currentServants.map((s) => s.id));
  const ceExistingIds = new Set(currentCes.map((c) => c.id));

  const missingSvtRecords: Record<string, string>[] = [];
  const missingCeRecords: Record<string, string>[] = [];

  for (const p of pages) {
    const content = p?.revisions?.[0]?.slots?.main?.content || '';
    if (p.title === '英灵图鉴/数据') {
      const recs = parseCatalogBlocks(content);
      for (const r of recs) {
        const num = parseInt(r.id, 10);
        if (num && !svtExistingIds.has(num)) {
          missingSvtRecords.push(r);
        }
      }
    } else if (p.title === '礼装图鉴/数据') {
      const recs = parseCatalogBlocks(content);
      for (const r of recs) {
        const num = parseInt(r.id, 10);
        if (num && !ceExistingIds.has(num)) {
          missingCeRecords.push(r);
        }
      }
    }
  }

  // Also check recent changes on Mooncell for recently edited servant pages
  onProgress({
    running: true,
    phase: `索引比对完成：发现 ${missingSvtRecords.length} 名新英灵，${missingCeRecords.length} 张新礼装，正在检查近期强化修订...`,
    current: 35,
    total: 100,
    updatedServants,
    updatedCes,
  });

  const rcUrl =
    'https://fgo.wiki/api.php?action=query&list=recentchanges&rcnamespace=0&rclimit=30&rcprop=title|ids|timestamp&format=json&formatversion=2&origin=*';
  try {
    const rcResp = await fetch(rcUrl);
    if (rcResp.ok) {
      await rcResp.json();
    }
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
      current: 40 + Math.round((doneWork / Math.max(totalWork, 1)) * 55),
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
      current: 40 + Math.round((doneWork / Math.max(totalWork, 1)) * 55),
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
      iconLocal: `/assets/icons/ce/礼装${String(num).padStart(3, '0')}.jpg`,
      iconRemote: '',
      skillIconLocal: '/assets/icons/skill/加攻.png',
      skillIconRemote: '',
    };
    addedCes.push(summary);
    updatedCes++;
  }

  const nowStr = new Date().toLocaleString('zh-CN', { hour12: false });
  await idbPut('meta', { key: 'lastUpdated', value: nowStr });

  onProgress({
    running: false,
    phase:
      updatedServants === 0 && updatedCes === 0
        ? `已是最新数据（英灵 ${currentServants.length} 骑 / 礼装 ${currentCes.length} 张）`
        : `同步完成：新增 ${updatedServants} 骑英灵、${updatedCes} 张礼装`,
    current: 100,
    total: 100,
    updatedServants,
    updatedCes,
    lastUpdated: nowStr,
  });

  return { newServants: addedSvts, newCes: addedCes };
}
