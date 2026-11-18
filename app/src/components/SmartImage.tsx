import React, { useState, useEffect } from 'react';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  localSrc?: string;
  remoteSrc?: string;
  fallbackSrc?: string;
}

export const SmartImage: React.FC<SmartImageProps> = ({
  localSrc,
  remoteSrc,
  fallbackSrc,
  alt = '',
  className = '',
  ...rest
}) => {
  const resolveLocal = (src?: string) => {
    if (!src) return '';
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return src;
    }
    return src.startsWith('/') ? `.${src}` : src;
  };

  const primary = resolveLocal(localSrc) || remoteSrc || fallbackSrc || '';
  const [currentSrc, setCurrentSrc] = useState<string>(primary);
  const [stage, setStage] = useState<number>(0);

  useEffect(() => {
    setCurrentSrc(resolveLocal(localSrc) || remoteSrc || fallbackSrc || '');
    setStage(0);
  }, [localSrc, remoteSrc, fallbackSrc]);

  const handleError = () => {
    if (stage === 0 && remoteSrc && currentSrc !== remoteSrc) {
      setStage(1);
      setCurrentSrc(remoteSrc);
    } else if (stage <= 1 && fallbackSrc && currentSrc !== fallbackSrc) {
      setStage(2);
      setCurrentSrc(fallbackSrc);
    } else if (stage <= 2) {
      setStage(3);
    }
  };

  if (stage === 3 || !currentSrc) {
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
