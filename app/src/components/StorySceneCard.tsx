import React, { useEffect, useRef, useState } from 'react';
import { SvtScriptMeta } from '../types';
import {
  loadCachedStoryImage,
  loadSvtScriptMeta,
  resolveStoryImageUrl,
} from '../services/storyService';

// 从已缓存的本地 blob URL 读取自然宽度（0 网络开销）
const widthCache = new Map<string, number>();

function readNaturalWidth(blobUrl: string): Promise<number> {
  const cached = widthCache.get(blobUrl);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1024;
      widthCache.set(blobUrl, w);
      resolve(w);
    };
    img.onerror = () => resolve(1024);
    img.src = blobUrl;
  });
}

/**
 * 视口懒加载 Hook：元素进入屏幕上下 500px 预热范围后才触发图片加载，
 * 避免打开一节剧情时几十张大图同时并发堵死带宽。
 */
function useInViewport(ref: React.RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '500px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, inView]);

  return inView;
}

/* ========================= 通用持久化缓存剧情图片组件 ========================= */

export interface CachedStoryImgProps {
  url: string;
  fallbackUrl?: string;
  alt: string;
  className?: string;
  onClick?: (resolvedUrl: string) => void;
  onHide?: () => void;
}

export const CachedStoryImg: React.FC<CachedStoryImgProps> = ({
  url,
  fallbackUrl,
  alt,
  className,
  onClick,
  onHide,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inView = useInViewport(wrapRef);
  const [src, setSrc] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    setFailed(false);

    (async () => {
      let resolved = await loadCachedStoryImage(url);
      if (!resolved && fallbackUrl && fallbackUrl !== url) {
        resolved = await loadCachedStoryImage(fallbackUrl);
      }
      if (cancelled) return;
      if (resolved) {
        setSrc(resolved);
      } else {
        setFailed(true);
        onHide?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inView, url, fallbackUrl, onHide]);

  if (failed) return null;

  return (
    <div ref={wrapRef} className={className}>
      {src ? (
        <img
          src={src}
          alt={alt}
          decoding="async"
          onClick={() => onClick?.(src)}
          onError={() => {
            setFailed(true);
            onHide?.();
          }}
        />
      ) : (
        <div className="story-img-skeleton" />
      )}
    </div>
  );
};

/* ========================= Atlas Academy 风格合成场景卡 ========================= */

export interface StorySceneCardProps {
  bgUrl?: string;
  bgFallbackUrl?: string;
  charaId: string;
  figureUrl: string;
  face: number;
  name: string;
  fullScreen?: boolean;
  silhouette?: boolean;
  cameraFilter?: string;
  onPreview: (url: string, caption?: string) => void;
}

/**
 * 参考 Atlas Academy DB 的 Scene.tsx：
 * - 视口懒加载（IntersectionObserver），避免打开剧情时并发堵死带宽
 * - 仅下载一次 _merged.png（砍掉重复的 {id}.png 探测请求，流量减半）
 * - 背景与立绘全部走 IndexedDB 持久化缓存 + 并发去重，第二次加载本地秒开
 */
export const StorySceneCard: React.FC<StorySceneCardProps> = ({
  bgUrl,
  bgFallbackUrl,
  charaId,
  figureUrl,
  face,
  name,
  fullScreen = false,
  silhouette = false,
  cameraFilter,
  onPreview,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inView = useInViewport(containerRef);

  const [containerWidth, setContainerWidth] = useState<number>(360);
  const [scriptMeta, setScriptMeta] = useState<SvtScriptMeta | null>(null);
  const [figureWidth, setFigureWidth] = useState<number>(1024);
  const [cachedBgUrl, setCachedBgUrl] = useState<string>('');
  const [cachedFigureUrl, setCachedFigureUrl] = useState<string>('');
  const [figureFailed, setFigureFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  // 监听容器宽度以等比缩放舞台
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 进入视口预热区后才加载背景、立绘与 svtScript 坐标
  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    setLoading(true);
    setFigureFailed(false);

    const loadBg = async () => {
      if (!bgUrl) return '';
      let resolved = await loadCachedStoryImage(bgUrl);
      if (!resolved && bgFallbackUrl && bgFallbackUrl !== bgUrl) {
        resolved = await loadCachedStoryImage(bgFallbackUrl);
      }
      return resolved || '';
    };

    const loadFig = async () => {
      const resolved = await loadCachedStoryImage(figureUrl);
      if (!resolved) return { url: '', width: 1024 };
      const natW = await readNaturalWidth(resolved);
      return { url: resolved, width: natW };
    };

    Promise.all([loadBg(), loadFig(), loadSvtScriptMeta(charaId)]).then(([bg, fig, meta]) => {
      if (cancelled) return;
      setCachedBgUrl(bg);
      if (fig.url) {
        setCachedFigureUrl(fig.url);
        setFigureWidth(fig.width);
      } else {
        setFigureFailed(true);
      }
      if (meta) setScriptMeta(meta);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [inView, bgUrl, bgFallbackUrl, charaId, figureUrl]);

  if (!loading && figureFailed && !cachedBgUrl) return null;

  const resWidth = fullScreen ? 1344 : 1024;
  const resHeight = 576;
  const scale = containerWidth / resWidth;
  const stageHeight = Math.round(resHeight * scale);

  const bgHeight = 626;
  const bgTop = ((bgHeight - resHeight) / 2) * scale * -1;

  // FGO 标准人物主体高度均为 1024，宽度从已加载的 _merged.png 自身读取（省去一次大图下载）
  const figureHeight = 1024;
  const offsetX = scriptMeta?.offsetX ?? 0;
  const offsetY = scriptMeta?.offsetY ?? 0;

  const figureWrapperWidth = resWidth * scale;
  const figureWrapperLeft = offsetX * scale;
  const figureWrapperTop = -offsetY * scale;
  const figureLeft = ((resWidth - figureWidth) / 2 + offsetX) * scale;

  const extendData = scriptMeta?.extendData || {};
  const defaultFaceSize = 256;
  const faceSizeWidth = extendData.faceSizeRect
    ? extendData.faceSizeRect[0]
    : (extendData.faceSize ?? defaultFaceSize);
  const faceSizeHeight = extendData.faceSizeRect
    ? extendData.faceSizeRect[1]
    : (extendData.faceSize ?? defaultFaceSize);

  // 裁切掉底部表情差分网格，只保留人物主体
  const bodyClipHeight =
    faceSizeHeight === defaultFaceSize && figureHeight === 1024
      ? 768 * scale
      : figureHeight * scale;

  const filterList: string[] = [];
  if (silhouette) filterList.push('brightness(0)');
  if (cameraFilter === 'gray') filterList.push('grayscale(1)');
  const figureFilter = filterList.length > 0 ? filterList.join(' ') : 'none';
  const bgFilter = cameraFilter === 'gray' ? 'grayscale(1)' : 'none';

  let faceStyle: React.CSSProperties | null = null;
  if (cachedFigureUrl && !figureFailed && face > 0 && scriptMeta) {
    const faceIdx = face - 1;
    const facePortionPageWidth = 1024;
    const facePortionPageHeight = 1024;
    const perRow = Math.max(1, Math.floor(facePortionPageWidth / faceSizeWidth));
    const col = faceIdx % perRow;
    const row = Math.floor(faceIdx / perRow);
    const page = Math.floor(row / perRow);
    const rowInPage = row % perRow;
    const spriteX = col * faceSizeWidth;
    const spriteY =
      faceSizeHeight === defaultFaceSize && figureHeight === 1024
        ? 1024 - defaultFaceSize + defaultFaceSize * row
        : figureHeight + facePortionPageHeight * page + rowInPage * faceSizeHeight;

    faceStyle = {
      backgroundImage: `url("${cachedFigureUrl}")`,
      backgroundPositionX: spriteX * -1 * scale,
      backgroundPositionY: spriteY * -1 * scale,
      backgroundSize: scale * figureWidth,
      left: scriptMeta.faceX * scale + figureLeft,
      top: scriptMeta.faceY * scale,
      width: faceSizeWidth * scale,
      height: faceSizeHeight * scale,
      filter: figureFilter,
    };
  }

  return (
    <div className="story-aa-scene-box">
      <div
        ref={containerRef}
        className={`story-aa-stage ${loading ? 'is-loading' : ''}`}
        style={{ height: stageHeight }}
      >
        {cachedBgUrl && (
          <div
            className="story-aa-bg"
            style={{
              backgroundImage: `url("${cachedBgUrl}")`,
              backgroundPositionY: bgTop,
              backgroundSize: '100%',
              filter: bgFilter,
            }}
          />
        )}

        {cachedFigureUrl && !figureFailed && (
          <div
            className="story-aa-figure-wrapper"
            style={{
              left: figureWrapperLeft,
              top: figureWrapperTop,
              width: figureWrapperWidth,
            }}
          >
            <div
              className="story-aa-figure"
              style={{
                backgroundImage: `url("${cachedFigureUrl}")`,
                backgroundSize: scale * figureWidth,
                left: figureLeft,
                height: bodyClipHeight,
                filter: figureFilter,
              }}
            />
            {faceStyle && <div className="story-aa-face" style={faceStyle} />}
          </div>
        )}
      </div>

      <div className="story-aa-scene-links">
        {cachedBgUrl && (
          <button
            type="button"
            className="story-aa-link-btn"
            onClick={() => onPreview(cachedBgUrl, '剧情背景')}
          >
            [背景]
          </button>
        )}
        {!figureFailed && (
          <button
            type="button"
            className="story-aa-link-btn"
            onClick={async () => {
              const singleUrl = `https://static.atlasacademy.io/CN/CharaFigure/${charaId}/${charaId}.png`;
              const cached = await loadCachedStoryImage(singleUrl);
              onPreview(cached || resolveStoryImageUrl(singleUrl), name || '角色立绘');
            }}
          >
            [立绘]
          </button>
        )}
        {name && <span className="story-aa-scene-name">{name}</span>}
      </div>
    </div>
  );
};
