import { Capacitor } from '@capacitor/core';

const VOICE_CACHE_NAME = 'mooncell-voice-cache-v1';

let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let activeObjectUrl: string | null = null;

type PlayStateListener = (playingUrl: string | null, loadingUrl: string | null, errorMsg?: string) => void;
const listeners = new Set<PlayStateListener>();

function notify(playingUrl: string | null, loadingUrl: string | null, errorMsg?: string) {
  listeners.forEach((fn) => fn(playingUrl, loadingUrl, errorMsg));
}

export function subscribeVoicePlayer(fn: PlayStateListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function stopVoice(): void {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.src = '';
    } catch {
      // ignore
    }
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
  activeUrl = null;
  notify(null, null);
}

/**
 * Convert media.fgo.wiki URL into proxy URL in Vite web mode for CORS-free caching.
 */
function toFetchableUrl(url: string): string {
  if (!Capacitor.isNativePlatform() && url.startsWith('https://media.fgo.wiki/')) {
    return url.replace('https://media.fgo.wiki/', '/mooncell-media/');
  }
  return url;
}

export async function isVoiceCached(audioUrl: string): Promise<boolean> {
  if (typeof caches === 'undefined' || !audioUrl) return false;
  try {
    const cache = await caches.open(VOICE_CACHE_NAME);
    const match = await cache.match(audioUrl);
    return Boolean(match);
  } catch {
    return false;
  }
}

export async function getCachedVoiceUrls(urls: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (typeof caches === 'undefined' || urls.length === 0) return result;
  try {
    const cache = await caches.open(VOICE_CACHE_NAME);
    const checks = await Promise.all(
      urls.map(async (u) => {
        const hit = await cache.match(u);
        return hit ? u : null;
      })
    );
    for (const u of checks) {
      if (u) result.add(u);
    }
  } catch {
    // ignore
  }
  return result;
}

export async function cacheSingleVoice(audioUrl: string): Promise<boolean> {
  if (typeof caches === 'undefined' || !audioUrl) return false;
  try {
    const cache = await caches.open(VOICE_CACHE_NAME);
    const existing = await cache.match(audioUrl);
    if (existing) return true;

    const fetchUrl = toFetchableUrl(audioUrl);
    const resp = await fetch(fetchUrl);
    if (!resp.ok) return false;
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('text/html')) return false;
    await cache.put(audioUrl, resp.clone());
    return true;
  } catch {
    return false;
  }
}

/**
 * Play or toggle a voice line.
 * Checks local Cache Storage first (works offline), otherwise streams directly from Mooncell CDN
 * and silently caches in background for future offline playback.
 */
export async function togglePlayVoice(audioUrl: string): Promise<void> {
  if (!audioUrl) return;
  if (activeUrl === audioUrl) {
    stopVoice();
    return;
  }

  stopVoice();
  activeUrl = audioUrl;
  notify(null, audioUrl);

  let playSrc = audioUrl;

  // 1. Prefer offline cached audio blob if present
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(VOICE_CACHE_NAME);
      const cachedResp = await cache.match(audioUrl);
      if (cachedResp) {
        const blob = await cachedResp.blob();
        activeObjectUrl = URL.createObjectURL(blob);
        playSrc = activeObjectUrl;
      }
    } catch {
      // fallback to streaming
    }
  }

  // If another track started while awaiting cache, abort
  if (activeUrl !== audioUrl) return;

  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = playSrc;
  activeAudio = audio;

  audio.onplaying = () => {
    if (activeUrl === audioUrl) {
      notify(audioUrl, null);
    }
  };

  audio.onended = () => {
    if (activeUrl === audioUrl) {
      stopVoice();
    }
  };

  audio.onerror = () => {
    if (activeUrl === audioUrl) {
      stopVoice();
      notify(null, null, '音频加载失败（可能处于离线状态或站点暂缺该语音文件）');
    }
  };

  try {
    await audio.play();
    // Silently cache for offline use in background if it wasn't cached yet
    if (playSrc === audioUrl) {
      cacheSingleVoice(audioUrl).catch(() => {});
    }
  } catch {
    if (activeUrl === audioUrl) {
      stopVoice();
      notify(null, null, '无法播放该语音，请检查网络连接');
    }
  }
}

/**
 * Batch cache all voice files for a single Servant with progress reporting.
 */
export async function cacheServantVoices(
  urls: string[],
  onProgress: (done: number, total: number, okCount: number) => void
): Promise<{ ok: number; total: number }> {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  const total = uniqueUrls.length;
  let done = 0;
  let ok = 0;
  onProgress(0, total, 0);

  // Concurrency 4 to stay gentle on Mooncell CDN
  const queue = [...uniqueUrls];
  const worker = async () => {
    while (queue.length > 0) {
      const u = queue.shift();
      if (!u) break;
      const success = await cacheSingleVoice(u);
      done++;
      if (success) ok++;
      onProgress(done, total, ok);
    }
  };

  await Promise.all([worker(), worker(), worker(), worker()]);
  return { ok, total };
}
