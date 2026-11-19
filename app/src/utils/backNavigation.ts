import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

interface LayerEntry {
  id: string;
  close: () => void;
}

declare global {
  interface Window {
    __fgoHandleAndroidBack?: () => 'handled' | 'exit';
  }
}

const activeLayers: LayerEntry[] = [];
let suppressPopCount = 0;
let listenerInstalled = false;

/**
 * 供 Android 原生 MainActivity.java 在拦截系统返回键 / 边缘侧滑手势时直接调用：
 * - 若前端返回栈中存在打开的页面/弹窗，弹出并关闭最顶层，返回 'handled'
 * - 若已回到根页面无层可退，返回 'exit' 交由系统退出 App
 */
function installAndroidBackBridge() {
  if (typeof window === 'undefined') return;
  window.__fgoHandleAndroidBack = () => {
    const top = activeLayers.pop();
    if (top) {
      top.close();
      return 'handled';
    }
    return 'exit';
  };
}

function ensureGlobalListeners() {
  if (listenerInstalled || typeof window === 'undefined') return;
  listenerInstalled = true;
  installAndroidBackBridge();

  const isNative = Capacitor.isNativePlatform();

  if (!isNative) {
    window.addEventListener('popstate', () => {
      if (suppressPopCount > 0) {
        suppressPopCount--;
        return;
      }
      const top = activeLayers.pop();
      if (top) {
        top.close();
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeLayers.length > 0) {
      e.preventDefault();
      if (isNative) {
        const top = activeLayers.pop();
        if (top) top.close();
      } else {
        window.history.back();
      }
    }
  });
}

// 模块加载时即注册原生返回桥接函数，确保首页侧滑也有确定返回值
installAndroidBackBridge();

/**
 * 将当前打开的子页面/弹窗/抽屉/大图查看器注册到返回栈：
 * - Android 原生端：由 MainActivity.java 直接调用 window.__fgoHandleAndroidBack() 逐层关闭，避免 WebView canGoBack() 失效
 * - Web 浏览器端：联动 history.pushState / popstate 与 Esc 键逐层关闭
 */
export function useBackClose(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    ensureGlobalListeners();

    const isNative = Capacitor.isNativePlatform();
    const id = `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const entry: LayerEntry = {
      id,
      close: () => onCloseRef.current(),
    };

    activeLayers.push(entry);
    if (!isNative) {
      window.history.pushState({ fgoModalLayer: id }, '');
    }

    return () => {
      const idx = activeLayers.findIndex((item) => item.id === id);
      if (idx !== -1) {
        // 由 UI 按钮主动关闭（而非返回手势关闭），从栈中移除；Web 端同步静默回退 history
        activeLayers.splice(idx, 1);
        if (!isNative) {
          suppressPopCount++;
          window.history.back();
        }
      }
    };
  }, [isOpen]);
}
