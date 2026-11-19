import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Sparkles,
  Flame,
  Scale,
  Calendar,
  Download,
  Check,
  RefreshCw,
  Image as ImageIcon,
  FileText,
  Clock,
  Play,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import {
  StoryWarCategory,
  StoryWarSummary,
  StoryWarDetail,
  StoryScriptEntry,
  ParsedStoryScript,
  WarReadProgress,
} from '../types';
import {
  loadWarDetail,
  loadStoryScript,
  getCachedScriptIdSet,
  cacheWarAllScripts,
  resolveStoryImageUrl,
  getAllWarProgress,
  saveWarProgress,
  prefetchSvtScriptMetas,
  getStoryImageCacheStats,
  clearStoryImageCache,
} from '../services/storyService';
import { useBackClose } from '../utils/backNavigation';
import { BackToTopButton } from './BackToTopButton';
import { StorySceneCard, CachedStoryImg } from './StorySceneCard';

interface StoryHubProps {
  wars: StoryWarSummary[];
  searchQuery: string;
  onScrollTop: () => void;
  resetSignal?: number;
}

const STORY_CATEGORIES: {
  id: StoryWarCategory;
  title: string;
  enSub: string;
  subtitle: string;
  bannerImg: string;
  fallbackBg: string;
  icon: React.ReactNode;
}[] = [
  {
    id: 'part1',
    title: '第1部 · 特异点',
    enSub: 'Observer on Timeless Temple',
    subtitle: '特异点F 冬木 ～ 终局特异点 所罗门',
    bannerImg: './assets/story/cat_part1.webp',
    fallbackBg: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
    icon: <Compass size={18} />,
  },
  {
    id: 'part15',
    title: '第1.5部 · 断章',
    enSub: 'Epic of Remnant',
    subtitle: '新宿 · 雅戈泰 · 下总国 · 塞勒姆',
    bannerImg: './assets/story/cat_part15.webp',
    fallbackBg: 'linear-gradient(135deg, #4c1d95, #7c3aed)',
    icon: <Flame size={18} />,
  },
  {
    id: 'part2',
    title: '第2部 · 异闻带',
    enSub: 'Cosmos in the Lostbelt',
    subtitle: '永久冻土帝国 ～ 黄金树海纪行',
    bannerImg: './assets/story/cat_part2.webp',
    fallbackBg: 'linear-gradient(135deg, #0c4a6e, #0891b2)',
    icon: <Sparkles size={18} />,
  },
  {
    id: 'ordeal_call',
    title: '奏章 · Ordeal Call',
    enSub: 'Ordeal Call',
    subtitle: '奏章Ⅰ ～ 奏章Ⅳ 最新主线',
    bannerImg: './assets/story/cat_ordeal_call.webp',
    fallbackBg: 'linear-gradient(135deg, #78350f, #b45309)',
    icon: <Scale size={18} />,
  },
  {
    id: 'event',
    title: '活动剧情',
    enSub: 'Limited-Time Events',
    subtitle: '历代大型活动、联动与限时活动剧情',
    bannerImg: './assets/story/cat_event.webp',
    fallbackBg: 'linear-gradient(135deg, #064e3b, #059669)',
    icon: <Calendar size={18} />,
  },
];

function getSpeakerTone(name: string): string {
  if (name.includes('玛修')) return 'tone-purple';
  if (name.includes('达·芬奇') || name.includes('达芬奇') || name.includes('福尔摩斯')) return 'tone-cyan';
  if (name.includes('戈尔德鲁夫') || name.includes('罗曼')) return 'tone-amber';
  if (name.includes('？？') || name.includes('???')) return 'tone-slate';
  return 'tone-blue';
}

/* ========================= 沉浸式剧情阅读器弹窗 ========================= */

interface StoryReaderModalProps {
  war: StoryWarSummary;
  entries: StoryScriptEntry[];
  entryIndex: number;
  initialScrollTop: number;
  onChangeIndex: (nextIdx: number) => void;
  onSaveProgress: (idx: number, entry: StoryScriptEntry, scrollTop: number) => void;
  onScriptCached: (scriptId: string) => void;
  onClose: () => void;
}

const StoryReaderModal: React.FC<StoryReaderModalProps> = ({
  war,
  entries,
  entryIndex,
  initialScrollTop,
  onChangeIndex,
  onSaveProgress,
  onScriptCached,
  onClose,
}) => {
  const entry = entries[entryIndex];
  const [scriptData, setScriptData] = useState<ParsedStoryScript | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showImages, setShowImages] = useState(true);
  const [previewImg, setPreviewImg] = useState<{ url: string; caption?: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoredScrollForRef = useRef<string>('');
  const saveTimerRef = useRef<number | null>(null);

  useBackClose(true, onClose);
  useBackClose(Boolean(previewImg), () => setPreviewImg(null));

  const fetchScript = useCallback(
    async (force = false) => {
      if (!entry) return;
      setLoading(true);
      setError('');
      try {
        const data = await loadStoryScript(entry.scriptId, entry.scriptUrl, force);
        setScriptData(data);
        onScriptCached(entry.scriptId);
        // 一次性批量预拉取本节所有登场角色的 svtScript 坐标（已持久化到 IndexedDB）
        const charaIds = data.blocks
          .filter((b): b is Extract<typeof b, { type: 'scene' }> => b.type === 'scene')
          .map((b) => b.charaId);
        if (charaIds.length > 0) {
          void prefetchSvtScriptMetas(charaIds);
        }
      } catch (err: any) {
        setError(err?.message || '剧情脚本加载失败，请检查网络后重试');
      } finally {
        setLoading(false);
      }
    },
    [entry, onScriptCached]
  );

  useEffect(() => {
    fetchScript(false);
  }, [fetchScript]);

  // 内容加载完成后：若为续看，自动恢复到上次滚动位置；否则回到顶部并记录已读
  useEffect(() => {
    if (loading || !scriptData || !entry) return;
    const key = `${war.id}:${entry.scriptId}`;
    const el = scrollRef.current;
    if (el) {
      if (initialScrollTop > 0 && restoredScrollForRef.current !== key) {
        restoredScrollForRef.current = key;
        window.requestAnimationFrame(() => {
          el.scrollTo({ top: initialScrollTop, behavior: 'auto' });
        });
      } else {
        restoredScrollForRef.current = key;
        el.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
    onSaveProgress(entryIndex, entry, initialScrollTop > 0 ? initialScrollTop : 0);
  }, [loading, scriptData, entry, entryIndex, initialScrollTop, war.id, onSaveProgress]);

  // 滚动时防抖记忆精确进度
  const handleScroll = () => {
    if (!entry || !scrollRef.current) return;
    const top = scrollRef.current.scrollTop;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      onSaveProgress(entryIndex, entry, top);
    }, 350);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!entry) return null;

  const hasPrev = entryIndex > 0;
  const hasNext = entryIndex < entries.length - 1;

  return (
    <div className="story-fullscreen-page">
      <header className="story-page-header">
        <button type="button" className="story-page-back-btn" onClick={onClose} aria-label="返回">
          <ChevronLeft size={19} />
          <span>返回</span>
        </button>

        <div className="story-page-title-box">
          <div className="story-page-meta-row">
            <span className="story-page-step">
              {entry.chapterLabel || `第 ${entryIndex + 1} 节`}
            </span>
            {entry.partLabel && <span className="story-page-part">{entry.partLabel}</span>}
            <span className="story-page-seq">
              ({entryIndex + 1} / {entries.length})
            </span>
          </div>
          <h2 className="story-page-title">{entry.questName}</h2>
          <div className="story-page-sub">
            {war.name} · {entry.spotName}
          </div>
        </div>

        <div className="story-reader-header-actions">
          <button
            type="button"
            className={`story-page-action-btn ${showImages ? 'active' : ''}`}
            onClick={() => setShowImages((v) => !v)}
            title={showImages ? '点击切换为纯文本模式' : '点击显示场景背景与插图'}
          >
            {showImages ? <ImageIcon size={14} /> : <FileText size={14} />}
            <span>{showImages ? '图文' : '纯文'}</span>
          </button>
          <button
            type="button"
            className="story-page-icon-btn"
            onClick={() => fetchScript(true)}
            aria-label="刷新剧情"
            title="重新拉取本节剧情"
          >
            <RefreshCw size={15} className={loading ? 'spin-icon' : ''} />
          </button>
        </div>
      </header>

      <div
        className="detail-scroll-body story-reader-body"
        ref={scrollRef}
        onScroll={handleScroll}
      >
          {loading ? (
            <div className="detail-loading" style={{ minHeight: 240 }}>
              <div className="spinner" />
              <span>正在加载中文剧情脚本...</span>
            </div>
          ) : error ? (
            <div className="quest-error-box">
              <AlertCircle size={22} />
              <p>{error}</p>
              <button type="button" className="btn-primary-sm" onClick={() => fetchScript(true)}>
                重试加载
              </button>
            </div>
          ) : !scriptData || scriptData.blocks.length === 0 ? (
            <div className="mc-empty-hint">该节暂无可显示的剧情文本。</div>
          ) : (
            <div className="story-blocks-list">
              {scriptData.blocks.map((blk, i) => {
                if (blk.type === 'scene') {
                  if (!showImages) return null;
                  return (
                    <StorySceneCard
                      key={`scn-${i}`}
                      bgUrl={blk.bgUrl}
                      bgFallbackUrl={blk.bgFallbackUrl}
                      charaId={blk.charaId}
                      figureUrl={blk.figureUrl}
                      face={blk.face}
                      name={blk.name}
                      fullScreen={blk.fullScreen}
                      silhouette={blk.silhouette}
                      cameraFilter={blk.cameraFilter}
                      onPreview={(url, caption) => setPreviewImg({ url, caption })}
                    />
                  );
                }
                if (blk.type === 'bg') {
                  if (!showImages) return null;
                  return (
                    <CachedStoryImg
                      key={`bg-${i}`}
                      url={blk.url}
                      fallbackUrl={blk.fallbackUrl}
                      alt="剧情场景"
                      className="story-scene-card"
                      onClick={(resolvedUrl) =>
                        setPreviewImg({ url: resolvedUrl, caption: '剧情场景' })
                      }
                    />
                  );
                }
                if (blk.type === 'cg') {
                  if (!showImages) return null;
                  return (
                    <CachedStoryImg
                      key={`cg-${i}`}
                      url={blk.url}
                      alt={blk.name || '剧情插图'}
                      className="story-cg-card"
                      onClick={(resolvedUrl) =>
                        setPreviewImg({ url: resolvedUrl, caption: '剧情插图' })
                      }
                    />
                  );
                }
                if (blk.type === 'equip') {
                  if (!showImages) return null;
                  return (
                    <CachedStoryImg
                      key={`eq-${i}`}
                      url={blk.url}
                      alt="剧情礼装/道具"
                      className="story-equip-card"
                      onClick={(resolvedUrl) =>
                        setPreviewImg({ url: resolvedUrl, caption: '剧情道具 / 礼装' })
                      }
                    />
                  );
                }
                if (blk.type === 'chara') {
                  if (!showImages) return null;
                  return (
                    <div key={`chf-${i}`} className="story-chara-card">
                      <CachedStoryImg
                        url={blk.url}
                        alt={blk.name || '角色立绘'}
                        onClick={(resolvedUrl) =>
                          setPreviewImg({ url: resolvedUrl, caption: blk.name || '角色立绘' })
                        }
                      />
                      {blk.name && <span className="story-chara-caption">{blk.name}</span>}
                    </div>
                  );
                }
                if (blk.type === 'mark') {
                  if (!showImages) return null;
                  return (
                    <CachedStoryImg
                      key={`mk-${i}`}
                      url={blk.url}
                      alt={blk.name || '剧情标记'}
                      className="story-mark-card"
                    />
                  );
                }
                if (blk.type === 'narration') {
                  return (
                    <div key={`nar-${i}`} className="story-narration">
                      {blk.text}
                    </div>
                  );
                }
                if (blk.type === 'dialogue') {
                  return (
                    <div key={`dlg-${i}`} className="story-dialogue">
                      <div className="story-speaker-row">
                        <span className={`story-speaker-badge ${getSpeakerTone(blk.speaker)}`}>
                          {blk.speaker}
                        </span>
                      </div>
                      <div className="story-dialogue-text">{blk.text}</div>
                    </div>
                  );
                }
                return (
                  <div key={`ch-${i}`} className="story-choice-box">
                    <div className="story-choice-label">分支选项</div>
                    {blk.options.map((opt, oi) => (
                      <div key={oi} className="story-choice-item">
                        <span className="story-choice-num">{opt.index}</span>
                        <span>{opt.text}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="story-reader-footer">
          <button
            type="button"
            className="story-nav-btn"
            disabled={!hasPrev}
            onClick={() => hasPrev && onChangeIndex(entryIndex - 1)}
          >
            <ChevronLeft size={16} />
            <span>上一节</span>
          </button>
          <span className="story-nav-indicator">
            {entryIndex + 1} / {entries.length}
          </span>
          <button
            type="button"
            className="story-nav-btn primary"
            disabled={!hasNext}
            onClick={() => hasNext && onChangeIndex(entryIndex + 1)}
          >
            <span>下一节</span>
            <ChevronRight size={16} />
          </button>
        </footer>

        <BackToTopButton targetRef={scrollRef} variant="drawer" />

        {previewImg && (
          <div
            className="story-img-preview-backdrop"
            onClick={() => setPreviewImg(null)}
            role="dialog"
            aria-label="剧情图片放大预览"
          >
            <img src={previewImg.url} alt={previewImg.caption || '剧情图片'} />
            {previewImg.caption && (
              <div className="story-img-preview-caption">{previewImg.caption} · 点击任意处关闭</div>
            )}
          </div>
        )}
    </div>
  );
};

/* ========================= 具体章节官方横幅卡片（图2 样式） ========================= */

const StoryWarBannerCard: React.FC<{
  war: StoryWarSummary;
  index: number;
  progress?: WarReadProgress;
  onClick: () => void;
}> = ({ war, index, progress, onClick }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const bannerUrl = war.banner ? resolveStoryImageUrl(war.banner) : '';
  const showBanner = Boolean(bannerUrl) && !imgFailed;
  const eventDateLabel =
    war.category === 'event'
      ? war.startCnDate
        ? `国服实装：${war.startCnDate}`
        : war.startJpDate
          ? `日服实装：${war.startJpDate}（国服暂未实装）`
          : ''
      : '';

  if (!showBanner) {
    return (
      <button type="button" className="quest-option-row" onClick={onClick}>
        <span className="quest-option-index">{index + 1}</span>
        <div className="quest-option-text">
          <strong>{war.longName}</strong>
          {eventDateLabel && <small className="story-jp-date-hint">{eventDateLabel}</small>}
          {progress ? (
            <small className="story-prog-hint">
              已读 {progress.readScriptIds.length} 节 · 上次看到：{progress.lastTitle}
            </small>
          ) : !eventDateLabel ? (
            <small>{war.category === 'event' ? '活动剧情' : '主线剧情'}</small>
          ) : null}
        </div>
        <ChevronRight size={17} className="quest-option-arrow" />
      </button>
    );
  }

  return (
    <button type="button" className="story-war-banner-card" onClick={onClick}>
      <div className="story-war-banner-img-wrap">
        <img
          src={bannerUrl}
          alt={war.longName}
          className="story-war-banner-img"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      </div>
      <div className="story-war-banner-meta">
        <div className="story-war-banner-meta-text">
          <strong>{war.longName}</strong>
          <div className="story-war-banner-subrow">
            {eventDateLabel && <span className="story-jp-date-hint">{eventDateLabel}</span>}
            {progress && (
              <span className="story-prog-hint">
                已读 {progress.readScriptIds.length} 节 · 上次看到：{progress.lastTitle}
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={17} className="quest-option-arrow" />
      </div>
    </button>
  );
};

/* ========================= 剧情中心主组件 ========================= */

export const StoryHub: React.FC<StoryHubProps> = ({
  wars,
  searchQuery,
  onScrollTop,
  resetSignal = 0,
}) => {
  const [selectedCat, setSelectedCat] = useState<StoryWarCategory | null>(null);
  const [selectedWar, setSelectedWar] = useState<StoryWarSummary | null>(null);
  const [warDetail, setWarDetail] = useState<StoryWarDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const lastResetRef = useRef(resetSignal);

  useEffect(() => {
    if (resetSignal !== lastResetRef.current) {
      lastResetRef.current = resetSignal;
      setReaderState(null);
      setResumePrompt(null);
      setSelectedWar(null);
      setWarDetail(null);
      setDetailError('');
      setSelectedCat(null);
      onScrollTop();
    }
  }, [resetSignal, onScrollTop]);

  // 缓存状态与阅读进度记忆
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());
  const [progressMap, setProgressMap] = useState<Record<number, WarReadProgress>>(() =>
    getAllWarProgress()
  );

  // 续看询问弹窗
  const [resumePrompt, setResumePrompt] = useState<{
    war: StoryWarSummary;
    progress: WarReadProgress;
  } | null>(null);

  // 阅读器状态
  const [readerState, setReaderState] = useState<{
    entryIndex: number;
    initialScrollTop: number;
  } | null>(null);

  // 整章缓存进度
  const [cachingState, setCachingState] = useState<{
    running: boolean;
    done: number;
    total: number;
  }>({ running: false, done: 0, total: 0 });

  // 剧情图片本地持久化缓存统计与二次确认清理弹窗
  const [imgCacheStats, setImgCacheStats] = useState<{ count: number; totalBytes: number }>({
    count: 0,
    totalBytes: 0,
  });
  const [confirmClearImgCache, setConfirmClearImgCache] = useState(false);
  const [clearingImgCache, setClearingImgCache] = useState(false);

  const refreshImgCacheStats = useCallback(() => {
    getStoryImageCacheStats().then(setImgCacheStats);
  }, []);

  useEffect(() => {
    getCachedScriptIdSet().then(setCachedIds);
    refreshImgCacheStats();
  }, [refreshImgCacheStats]);

  // 从章节或分类返回首页时顺手刷新本地图片缓存占用统计
  useEffect(() => {
    if (!selectedCat && !selectedWar) {
      refreshImgCacheStats();
    }
  }, [selectedCat, selectedWar, refreshImgCacheStats]);

  const handleConfirmClearImgCache = async () => {
    if (clearingImgCache) return;
    setClearingImgCache(true);
    try {
      await clearStoryImageCache();
      setImgCacheStats({ count: 0, totalBytes: 0 });
      setConfirmClearImgCache(false);
    } finally {
      setClearingImgCache(false);
    }
  };

  // 分层返回导航：阅读器 -> 续看弹窗 -> 章节目录 -> 分类列表 -> 首页
  const closeWarDetail = useCallback(() => {
    setSelectedWar(null);
    setWarDetail(null);
    setDetailError('');
    setResumePrompt(null);
    onScrollTop();
  }, [onScrollTop]);

  const closeCategory = useCallback(() => {
    setSelectedCat(null);
    onScrollTop();
  }, [onScrollTop]);

  useBackClose(Boolean(selectedCat && !selectedWar), closeCategory);
  useBackClose(Boolean(selectedWar && !readerState && !resumePrompt), closeWarDetail);
  useBackClose(Boolean(resumePrompt), () => setResumePrompt(null));
  useBackClose(confirmClearImgCache, () => setConfirmClearImgCache(false));

  const fetchWar = useCallback(async (war: StoryWarSummary, force = false) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const detail = await loadWarDetail(war.id, force);
      setWarDetail(detail);
      return detail;
    } catch (err: any) {
      setDetailError(err?.message || '无法加载该章节的剧情节列表（请检查网络连接）');
      return null;
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleOpenWar = async (war: StoryWarSummary, autoResumeIfHasProgress = false) => {
    setSelectedWar(war);
    setWarDetail(null);
    setReaderState(null);
    onScrollTop();

    const prog = progressMap[war.id];
    const detail = await fetchWar(war, false);
    if (!detail || detail.entries.length === 0) return;

    if (prog && prog.lastScriptId) {
      if (autoResumeIfHasProgress) {
        const idx = detail.entries.findIndex((e) => e.scriptId === prog.lastScriptId);
        const targetIdx = idx >= 0 ? idx : Math.min(prog.lastEntryIndex, detail.entries.length - 1);
        setReaderState({
          entryIndex: Math.max(0, targetIdx),
          initialScrollTop: prog.lastScrollTop || 0,
        });
      } else {
        setResumePrompt({ war, progress: prog });
      }
    }
  };

  const handleConfirmResume = () => {
    if (!resumePrompt || !warDetail) {
      setResumePrompt(null);
      return;
    }
    const { progress } = resumePrompt;
    const idx = warDetail.entries.findIndex((e) => e.scriptId === progress.lastScriptId);
    const targetIdx = idx >= 0 ? idx : Math.min(progress.lastEntryIndex, warDetail.entries.length - 1);
    setResumePrompt(null);
    setReaderState({
      entryIndex: Math.max(0, targetIdx),
      initialScrollTop: progress.lastScrollTop || 0,
    });
  };

  const handleSaveProgress = useCallback(
    (idx: number, entry: StoryScriptEntry, scrollTop: number) => {
      if (!selectedWar) return;
      const next = saveWarProgress(
        selectedWar.id,
        idx,
        entry.scriptId,
        entry.questName,
        scrollTop
      );
      setProgressMap((prev) => ({ ...prev, [selectedWar.id]: next }));
    },
    [selectedWar]
  );

  const handleScriptCached = useCallback((scriptId: string) => {
    setCachedIds((prev) => {
      if (prev.has(scriptId)) return prev;
      const next = new Set(prev);
      next.add(scriptId);
      return next;
    });
  }, []);

  const handleCacheWholeWar = async () => {
    if (!warDetail || cachingState.running || warDetail.entries.length === 0) return;
    setCachingState({ running: true, done: 0, total: warDetail.entries.length });
    try {
      await cacheWarAllScripts(warDetail.entries, (done, total) => {
        setCachingState({ running: true, done, total });
      });
      const updatedSet = await getCachedScriptIdSet();
      setCachedIds(updatedSet);
    } finally {
      setCachingState({ running: false, done: 0, total: 0 });
    }
  };

  // 按分类统计数量
  const catCounts = useMemo(() => {
    const map: Record<StoryWarCategory, number> = {
      part1: 0,
      part15: 0,
      part2: 0,
      ordeal_call: 0,
      event: 0,
    };
    for (const w of wars) {
      if (map[w.category] !== undefined) map[w.category]++;
    }
    return map;
  }, [wars]);

  // 最近阅读的一章（用于首页快捷续看）
  const latestReadWar = useMemo(() => {
    const entries = Object.values(progressMap);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    const latest = entries[0];
    const war = wars.find((w) => w.id === latest.warId);
    if (!war) return null;
    return { war, progress: latest };
  }, [progressMap, wars]);

  // 搜索过滤
  const q = searchQuery.trim().toLowerCase();
  const visibleWars = useMemo(() => {
    if (q) {
      return wars.filter(
        (w) =>
          w.longName.toLowerCase().includes(q) ||
          w.name.toLowerCase().includes(q) ||
          String(w.id) === q
      );
    }
    if (!selectedCat) return [];
    return wars.filter((w) => w.category === selectedCat);
  }, [wars, selectedCat, q]);

  /* ==================== 视图 3：某章节的剧情节目录页 ==================== */
  if (selectedWar) {
    const warProg = progressMap[selectedWar.id];
    const readSet = new Set(warProg?.readScriptIds || []);
    const cachedInWar = warDetail
      ? warDetail.entries.filter((e) => cachedIds.has(e.scriptId)).length
      : 0;

    return (
      <div className="quest-hub-wrap">
        <div className="quest-sub-header">
          <button type="button" className="quest-back-btn" onClick={closeWarDetail}>
            <ChevronLeft size={18} />
            <span>返回</span>
          </button>
          <div className="quest-sub-title-box">
            <h3>{selectedWar.longName}</h3>
            <span>
              {warDetail
                ? `共 ${warDetail.entries.length} 节 · 已缓存 ${cachedInWar} 节`
                : '正在读取章节目录...'}
            </span>
          </div>
          <button
            type="button"
            className="btn-refresh-quest"
            onClick={() => fetchWar(selectedWar, true)}
            disabled={detailLoading}
          >
            <RefreshCw size={13} className={detailLoading ? 'spin-icon' : ''} />
            <span>刷新</span>
          </button>
        </div>

        {/* 章节操作条：上次进度快捷续看 + 一键缓存本章全部文本 */}
        {warDetail && warDetail.entries.length > 0 && (
          <div className="story-war-actions-bar">
            {warProg && (
              <button
                type="button"
                className="story-resume-inline-btn"
                onClick={() => {
                  const idx = warDetail.entries.findIndex((e) => e.scriptId === warProg.lastScriptId);
                  const targetIdx =
                    idx >= 0 ? idx : Math.min(warProg.lastEntryIndex, warDetail.entries.length - 1);
                  setReaderState({
                    entryIndex: Math.max(0, targetIdx),
                    initialScrollTop: warProg.lastScrollTop || 0,
                  });
                }}
              >
                <Play size={13} />
                <span>继续阅读：{warProg.lastTitle}</span>
              </button>
            )}
            <button
              type="button"
              className="story-cache-all-btn"
              onClick={handleCacheWholeWar}
              disabled={cachingState.running || cachedInWar === warDetail.entries.length}
            >
              {cachingState.running ? (
                <>
                  <RefreshCw size={13} className="spin-icon" />
                  <span>
                    缓存中 {cachingState.done}/{cachingState.total}
                  </span>
                </>
              ) : cachedInWar === warDetail.entries.length ? (
                <>
                  <Check size={13} />
                  <span>本章文本已全部离线缓存</span>
                </>
              ) : (
                <>
                  <Download size={13} />
                  <span>一键缓存本章文本</span>
                </>
              )}
            </button>
          </div>
        )}

        {detailLoading ? (
          <div className="detail-loading" style={{ minHeight: 200 }}>
            <div className="spinner" />
            <span>正在从 Atlas Academy CN 读取剧情节目录...</span>
          </div>
        ) : detailError ? (
          <div className="quest-error-box">
            <AlertCircle size={22} />
            <p>{detailError}</p>
            <button
              type="button"
              className="btn-primary-sm"
              onClick={() => fetchWar(selectedWar, true)}
            >
              重试加载
            </button>
          </div>
        ) : !warDetail || warDetail.entries.length === 0 ? (
          <div className="empty-state">
            <p>该篇章暂无可阅读的剧情脚本（可能为纯战斗或尚未实装国服文本）</p>
          </div>
        ) : (
          <div className="quest-option-list">
            {warDetail.entries.map((entry, idx) => {
              const isLast = warProg?.lastScriptId === entry.scriptId;
              const isRead = readSet.has(entry.scriptId);
              const isCached = cachedIds.has(entry.scriptId);
              return (
                <button
                  key={entry.scriptId}
                  type="button"
                  className={`quest-option-row ${isLast ? 'story-row-last' : ''}`}
                  onClick={() =>
                    setReaderState({
                      entryIndex: idx,
                      initialScrollTop: isLast ? warProg?.lastScrollTop || 0 : 0,
                    })
                  }
                >
                  <span className="quest-option-index">{idx + 1}</span>
                  <div className="quest-option-text">
                    <div className="story-entry-title-row">
                      {entry.chapterLabel && (
                        <span className="story-chapter-tag">{entry.chapterLabel}</span>
                      )}
                      <strong>{entry.questName}</strong>
                    </div>
                    <small>
                      {entry.spotName}
                      {entry.partLabel ? ` · ${entry.partLabel}` : ''}
                    </small>
                  </div>
                  <div className="story-row-badges">
                    {isLast && <span className="story-badge last">上次看到</span>}
                    {!isLast && isRead && <span className="story-badge read">已读</span>}
                    {isCached && <span className="story-badge cached">离线</span>}
                  </div>
                  <ChevronRight size={17} className="quest-option-arrow" />
                </button>
              );
            })}
          </div>
        )}

        {/* 重新打开已读章节时的续看选择弹窗 */}
        {resumePrompt && (
          <div className="modal-backdrop story-resume-backdrop" onClick={() => setResumePrompt(null)}>
            <div className="story-resume-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="story-resume-icon">
                <Clock size={22} />
              </div>
              <h4>继续上次观看进度？</h4>
              <p className="story-resume-desc">
                你在《{resumePrompt.war.name}》上次观看到：
                <br />
                <strong>
                  第 {resumePrompt.progress.lastEntryIndex + 1} 节 · {resumePrompt.progress.lastTitle}
                </strong>
              </p>
              <div className="story-resume-actions">
                <button
                  type="button"
                  className="btn-primary-sm story-resume-btn-main"
                  onClick={handleConfirmResume}
                >
                  <Play size={14} />
                  <span>继续上次进度</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary-sm"
                  onClick={() => setResumePrompt(null)}
                >
                  查看章节目录
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 沉浸式剧情阅读器 */}
        {readerState && warDetail && (
          <StoryReaderModal
            war={selectedWar}
            entries={warDetail.entries}
            entryIndex={readerState.entryIndex}
            initialScrollTop={readerState.initialScrollTop}
            onChangeIndex={(nextIdx) =>
              setReaderState({ entryIndex: nextIdx, initialScrollTop: 0 })
            }
            onSaveProgress={handleSaveProgress}
            onScriptCached={handleScriptCached}
            onClose={() => setReaderState(null)}
          />
        )}
      </div>
    );
  }

  /* ==================== 视图 2：分类下的章节列表（或全局搜索结果） ==================== */
  if (selectedCat || q) {
    const activeCatObj = STORY_CATEGORIES.find((c) => c.id === selectedCat);
    return (
      <div className="quest-hub-wrap">
        {!q && (
          <div className="quest-sub-header">
            <button type="button" className="quest-back-btn" onClick={closeCategory}>
              <ChevronLeft size={18} />
              <span>返回</span>
            </button>
            <div className="quest-sub-title-box">
              <h3>{activeCatObj?.title}</h3>
              <span>共 {visibleWars.length} 篇中文剧情</span>
            </div>
          </div>
        )}

        {visibleWars.length === 0 ? (
          <div className="empty-state">
            <p>没有匹配「{searchQuery}」的主线或活动剧情</p>
          </div>
        ) : (
          <div className="story-war-list">
            {visibleWars.map((w, idx) => (
              <StoryWarBannerCard
                key={w.id}
                war={w}
                index={idx}
                progress={progressMap[w.id]}
                onClick={() => handleOpenWar(w, false)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ==================== 视图 1：剧情中心分类首页 ==================== */
  return (
    <div className="quest-hub-wrap">
      {latestReadWar && (
        <button
          type="button"
          className="story-recent-banner"
          onClick={() => handleOpenWar(latestReadWar.war, true)}
        >
          <div className="story-recent-left">
            <span className="story-recent-tag">
              <Clock size={12} /> 最近阅读 · 点击继续
            </span>
            <strong>{latestReadWar.war.longName}</strong>
            <small>
              上次看到：第 {latestReadWar.progress.lastEntryIndex + 1} 节 ·{' '}
              {latestReadWar.progress.lastTitle}
            </small>
          </div>
          <div className="story-recent-play">
            <Play size={16} />
          </div>
        </button>
      )}

      <div className="story-cat-banner-list">
        {STORY_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className="story-cat-banner-card"
            style={{ background: cat.fallbackBg }}
            onClick={() => {
              setSelectedCat(cat.id);
              onScrollTop();
            }}
          >
            <img
              src={cat.bannerImg}
              alt={cat.title}
              className="story-cat-banner-img"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="story-cat-banner-scrim" />
            <div className="story-cat-banner-content">
              <div className="story-cat-banner-top">
                <span className="story-cat-banner-en">
                  {cat.icon}
                  <span>{cat.enSub}</span>
                </span>
                <span className="story-cat-banner-count">{catCounts[cat.id]} 篇</span>
              </div>
              <div className="story-cat-banner-bottom">
                <div className="story-cat-banner-titles">
                  <strong>{cat.title}</strong>
                  <p>{cat.subtitle}</p>
                </div>
                <span className="story-cat-banner-arrow">
                  <ChevronRight size={18} />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="story-cache-bar">
        <div className="story-cache-info">
          <ImageIcon size={14} />
          <span>
            剧情图片本地缓存：{imgCacheStats.count} 张（
            {(imgCacheStats.totalBytes / (1024 * 1024)).toFixed(1)} MB）
          </span>
        </div>
        <button
          type="button"
          className="story-cache-clear-btn"
          disabled={imgCacheStats.count === 0}
          onClick={() => setConfirmClearImgCache(true)}
        >
          <Trash2 size={13} />
          <span>清理图片缓存</span>
        </button>
      </div>

      <div className="story-hub-foot-note">
        <BookOpen size={14} />
        <span>中文剧情数据来自 Atlas Academy CN，读过的章节与图片自动离线缓存并记忆进度</span>
      </div>

      {/* 清理剧情图片缓存二次确认弹窗 */}
      {confirmClearImgCache && (
        <div
          className="modal-backdrop story-resume-backdrop"
          onClick={() => !clearingImgCache && setConfirmClearImgCache(false)}
        >
          <div className="story-resume-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="story-resume-icon story-danger-icon">
              <Trash2 size={22} />
            </div>
            <h4>确认清理剧情图片缓存？</h4>
            <p className="story-resume-desc">
              当前已缓存 <strong>{imgCacheStats.count}</strong> 张剧情图片（约{' '}
              <strong>{(imgCacheStats.totalBytes / (1024 * 1024)).toFixed(1)} MB</strong>）。
              <br />
              清理后再次查看剧情背景与立绘需重新联网加载，<strong>不会</strong>删除已缓存的剧情文本和阅读进度。
            </p>
            <div className="story-resume-actions">
              <button
                type="button"
                className="btn-secondary-sm"
                disabled={clearingImgCache}
                onClick={() => setConfirmClearImgCache(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="story-danger-confirm-btn"
                disabled={clearingImgCache}
                onClick={handleConfirmClearImgCache}
              >
                {clearingImgCache ? '清理中...' : '确认清理'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
