import React, { useState, useEffect } from 'react';
import { loadCachedStoryImage } from '../services/storyService';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  localSrc?: string;
  remoteSrc?: string;
  fallbackSrc?: string;
}

function resolveLocalPath(src?: string): string {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('blob:')) {
    return src;
  }
  return src.startsWith('/') ? `.${src}` : src;
}

/**
 * 判断该图片是否属于已从 APK 剥离的按需缓存资源（礼装大卡面 cards/ce）：
 * 这类资源跳过本地静态 404 探测，直接走 IndexedDB 持久化缓存 + 远端按需拉取，
 * 首次加载 <1 秒，第二次本地秒开、断网可用。
 */
function isOnDemandCachedAsset(localSrc?: string): boolean {
  if (!localSrc) return false;
  return localSrc.includes('/assets/cards/ce/') || localSrc.startsWith('assets/cards/ce/');
}

export const SmartImage: React.FC<SmartImageProps> = ({
  localSrc,
  remoteSrc,
  fallbackSrc,
  alt = '',
  className = '',
  ...rest
}) => {
  const onDemand = isOnDemandCachedAsset(localSrc) && Boolean(remoteSrc);
  const initialPrimary = onDemand
    ? ''
    : resolveLocalPath(localSrc) || remoteSrc || resolveLocalPath(fallbackSrc) || '';

  const [currentSrc, setCurrentSrc] = useState<string>(initialPrimary);
  const [stage, setStage] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    if (onDemand && remoteSrc) {
      setStage(0);
      setCurrentSrc('');
      loadCachedStoryImage(remoteSrc).then((cachedBlobUrl) => {
        if (cancelled) return;
        if (cachedBlobUrl) {
          setCurrentSrc(cachedBlobUrl);
          setStage(1);
        } else {
          // 缓存拉取失败时回退到浏览器原生直连 remoteSrc 或 fallbackSrc
          setCurrentSrc(remoteSrc || resolveLocalPath(fallbackSrc) || '');
          setStage(1);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    setCurrentSrc(resolveLocalPath(localSrc) || remoteSrc || resolveLocalPath(fallbackSrc) || '');
    setStage(0);
    return () => {
      cancelled = true;
    };
  }, [localSrc, remoteSrc, fallbackSrc, onDemand]);

  const handleError = () => {
    const resolvedFallback = resolveLocalPath(fallbackSrc);
    if (stage === 0 && remoteSrc && currentSrc !== remoteSrc) {
      setStage(1);
      // 尝试顺手走持久化缓存拉取远端图
      loadCachedStoryImage(remoteSrc).then((blobUrl) => {
        setCurrentSrc(blobUrl || remoteSrc);
      });
    } else if (stage <= 1 && resolvedFallback && currentSrc !== resolvedFallback) {
      setStage(2);
      setCurrentSrc(resolvedFallback);
    } else if (stage <= 2) {
      setStage(3);
    }
  };

  if (stage === 3) {
    return (
      <div
        className={`smart-img-placeholder ${className}`}
        title={alt}
        style={rest.style}
      >
        <span>{alt.slice(0, 2) || 'FGO'}</span>
      </div>
    );
  }

  if (!currentSrc) {
    return (
      <div
        className={`smart-img-placeholder ${className}`}
        title={alt}
        style={rest.style}
      >
        <span>{alt.slice(0, 2) || '加载中'}</span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={handleError}
      {...rest}
    />
  );
};
