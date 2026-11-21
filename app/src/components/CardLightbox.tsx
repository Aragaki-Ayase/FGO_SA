import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { X, Download, ZoomIn, ZoomOut, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { AscensionArt } from '../types';
import { SmartImage } from './SmartImage';
import { useBackClose } from '../utils/backNavigation';

declare global {
  interface Window {
    MooncellNative?: {
      saveImage: (imageUrl: string, fileName: string, callbackId: string) => void;
    };
    __onNativeImageSaveResult?: (callbackId: string, ok: boolean, message: string) => void;
  }
}

const nativeSaveCallbacks = new Map<string, (res: { ok: boolean; message: string }) => void>();

function ensureNativeSaveCallbackBridge() {
  if (typeof window === 'undefined') return;
  if (!window.__onNativeImageSaveResult) {
    window.__onNativeImageSaveResult = (callbackId, ok, message) => {
      const cb = nativeSaveCallbacks.get(callbackId);
      if (cb) {
        nativeSaveCallbacks.delete(callbackId);
        cb({ ok, message });
      }
    };
  }
}

function saveImageViaAndroidNative(
  imageUrl: string,
  fileName: string
): Promise<{ ok: boolean; message: string }> {
  ensureNativeSaveCallbackBridge();
  return new Promise((resolve) => {
    const bridge = window.MooncellNative;
    if (!bridge || typeof bridge.saveImage !== 'function') {
      resolve({ ok: false, message: '原生下载通道未就绪' });
      return;
    }
    const cbId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timer = window.setTimeout(() => {
      if (nativeSaveCallbacks.has(cbId)) {
        nativeSaveCallbacks.delete(cbId);
        resolve({ ok: false, message: '下载超时，请稍后重试' });
      }
    }, 30000);
    nativeSaveCallbacks.set(cbId, (res) => {
      window.clearTimeout(timer);
      resolve(res);
    });
    bridge.saveImage(imageUrl, fileName, cbId);
  });
}

function toWebDownloadUrl(rawUrl: string): string {
  if (rawUrl.startsWith('https://media.fgo.wiki/')) {
    return rawUrl.replace('https://media.fgo.wiki', '/mooncell-media');
  }
  if (rawUrl.startsWith('https://static.atlasacademy.io/')) {
    return rawUrl.replace('https://static.atlasacademy.io', '/atlas-static');
  }
  return rawUrl;
}

interface CardLightboxProps {
  open: boolean;
  onClose: () => void;
  title: string;
  arts: AscensionArt[];
  initialIndex?: number;
}

export const CardLightbox: React.FC<CardLightboxProps> = ({
  open,
  onClose,
  title,
  arts,
  initialIndex = 0,
}) => {
  const [idx, setIdx] = useState(initialIndex);
  const [useHdOriginal, setUseHdOriginal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [downloadTip, setDownloadTip] = useState('');

  useBackClose(open && arts.length > 0, onClose);

  if (!open || arts.length === 0) return null;

  const safeIdx = Math.min(idx, arts.length - 1);
  const current = arts[safeIdx];

  const showTip = (msg: string) => {
    setDownloadTip(msg);
    window.setTimeout(() => {
      setDownloadTip((prev) => (prev === msg ? '' : prev));
    }, 3000);
  };

  const handleDownloadOriginal = async () => {
    if (!current.fullUrl || downloading) return;
    setDownloading(true);
    setDownloadTip('');
    const fileName = current.file || `${title}_${current.label}.png`;
    try {
      // 1) Android 原生 App：调用 MainActivity 原生桥接直接写入系统相册 Pictures/Mooncell图鉴/
      if (Capacitor.isNativePlatform() && window.MooncellNative?.saveImage) {
        const res = await saveImageViaAndroidNative(current.fullUrl, fileName);
        showTip(res.ok ? '已保存到手机相册' : res.message || '保存失败');
        return;
      }

      // 2) 电脑/手机网页端：优先通过 Vite 同源代理绕过 media.fgo.wiki 的 CORS 限制
      const candidates = Array.from(new Set([toWebDownloadUrl(current.fullUrl), current.fullUrl]));
      let blob: Blob | null = null;
      for (const u of candidates) {
        try {
          const resp = await fetch(u);
          if (!resp.ok) continue;
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('text/html')) continue;
          const b = await resp.blob();
          if (b && b.size > 0) {
            blob = b;
            break;
          }
        } catch {
          // 尝试下一个地址
        }
      }
      if (!blob) throw new Error('network error');

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      showTip('原图已开始下载');
    } catch {
      window.open(current.fullUrl, '_blank', 'noopener,noreferrer');
      showTip('已在新标签打开原图');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-header">
          <div className="lightbox-title">
            <strong>{title}</strong>
            <span className="lightbox-stage-badge">{current.label}</span>
            <span className={`lightbox-quality-tag ${useHdOriginal ? 'hd' : ''}`}>
              {useHdOriginal ? '原始高清大图' : '离线压缩缩略图'}
            </span>
          </div>
          <button type="button" className="btn-icon-close light" onClick={onClose}>
            <X size={22} />
          </button>
        </div>

        <div className="lightbox-stage">
          {arts.length > 1 && (
            <button
              type="button"
              className="lightbox-nav prev"
              onClick={() => {
                setIdx((prev) => (prev - 1 + arts.length) % arts.length);
                setZoom(1);
              }}
              aria-label="上一阶段"
            >
              <ChevronLeft size={26} />
            </button>
          )}

          <div
            className="lightbox-img-wrapper"
            style={{ transform: `scale(${zoom})` }}
            onDoubleClick={() => setZoom((z) => (z === 1 ? 1.8 : 1))}
          >
            {useHdOriginal ? (
              <SmartImage
                localSrc={current.fullUrl}
                remoteSrc={current.thumbRemote}
                fallbackSrc={current.thumbLocal}
                alt={`${title} - ${current.label}`}
                className="lightbox-img"
              />
            ) : (
              <SmartImage
                localSrc={current.thumbLocal}
                remoteSrc={current.thumbRemote}
                fallbackSrc={current.fullUrl}
                alt={`${title} - ${current.label}`}
                className="lightbox-img"
              />
            )}
          </div>

          {arts.length > 1 && (
            <button
              type="button"
              className="lightbox-nav next"
              onClick={() => {
                setIdx((prev) => (prev + 1) % arts.length);
                setZoom(1);
              }}
              aria-label="下一阶段"
            >
              <ChevronRight size={26} />
            </button>
          )}
        </div>

        {arts.length > 1 && (
          <div className="lightbox-pills">
            {arts.map((art, i) => (
              <button
                key={i}
                type="button"
                className={`lightbox-pill ${i === safeIdx ? 'active' : ''}`}
                onClick={() => {
                  setIdx(i);
                  setZoom(1);
                }}
              >
                {art.label}
              </button>
            ))}
          </div>
        )}

        <div className="lightbox-toolbar">
          <button
            type="button"
            className="lightbox-btn"
            onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}
          >
            <ZoomOut size={16} />
            <span>缩小</span>
          </button>
          <button
            type="button"
            className="lightbox-btn"
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
          >
            <ZoomIn size={16} />
            <span>放大</span>
          </button>
          <button
            type="button"
            className={`lightbox-btn ${useHdOriginal ? 'active' : ''}`}
            onClick={() => setUseHdOriginal((v) => !v)}
          >
            <Sparkles size={16} />
            <span>{useHdOriginal ? '切换缩略图' : '加载高清原图'}</span>
          </button>
          <button
            type="button"
            className="lightbox-btn primary"
            onClick={handleDownloadOriginal}
            disabled={downloading}
          >
            <Download size={16} />
            <span>
              {downloading ? '正在下载原图...' : downloadTip || '下载原始资源图片'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
