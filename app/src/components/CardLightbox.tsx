import React, { useState } from 'react';
import { X, Download, ZoomIn, ZoomOut, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { AscensionArt } from '../types';
import { SmartImage } from './SmartImage';
import { useBackClose } from '../utils/backNavigation';

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

  useBackClose(open && arts.length > 0, onClose);

  if (!open || arts.length === 0) return null;

  const safeIdx = Math.min(idx, arts.length - 1);
  const current = arts[safeIdx];

  const handleDownloadOriginal = async () => {
    if (!current.fullUrl || downloading) return;
    setDownloading(true);
    try {
      const resp = await fetch(current.fullUrl, { mode: 'cors' });
      if (!resp.ok) throw new Error('network error');
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = current.file || `${title}_${current.label}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      // Fallback: open original image URL in new tab / system downloader
      window.open(current.fullUrl, '_blank', 'noopener,noreferrer');
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
            <span>{downloading ? '正在下载原图...' : '下载原始资源图片'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
