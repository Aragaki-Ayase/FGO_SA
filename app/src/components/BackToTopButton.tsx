import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface BackToTopButtonProps {
  /** 需要监听和滚动回顶部的容器 ref */
  targetRef: React.RefObject<HTMLElement | null>;
  /** 滚动超过多少像素后显示按钮（默认 220px） */
  threshold?: number;
  /** 定位预设：main（主页面，避开底部导航栏）、modal（详情弹窗内）、drawer（筛选抽屉内，避开底部操作栏） */
  variant?: 'main' | 'modal' | 'drawer';
}

export const BackToTopButton: React.FC<BackToTopButtonProps> = ({
  targetRef,
  threshold = 220,
  variant = 'modal',
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const handleScroll = () => {
      setVisible(el.scrollTop > threshold);
    };

    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [targetRef, threshold]);

  const scrollToTop = () => {
    const el = targetRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      className={`back-to-top-btn back-to-top-${variant} ${visible ? 'visible' : ''}`}
      onClick={scrollToTop}
      aria-label="回到顶部"
      title="回到顶部"
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp size={20} />
    </button>
  );
};
