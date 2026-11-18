import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  ArrowUpDown,
  LayoutGrid,
  List,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Shield,
} from 'lucide-react';
import {
  CatalogSummaryPayload,
  ServantFilterState,
  ServantDetail,
  CraftEssenceDetail,
} from './types';
import {
  loadCatalogSummary,
  loadServantDetail,
  loadCraftEssenceDetail,
  syncFromMooncell,
  UpdateProgress,
} from './services/dataService';
import { SmartImage } from './components/SmartImage';
import { ServantFilterModal } from './components/ServantFilterModal';
import { ServantDetailModal } from './components/ServantDetailModal';
import { CeDetailModal } from './components/CeDetailModal';

const INITIAL_SERVANT_FILTERS: ServantFilterState = {
  rarities: [],
  classes: [],
  npColors: [],
  npTypes: [],
  npKinds: [],
  methods: [],
  traits: [],
  traitMatchMode: 'AND',
};

const QUICK_CLASSES = [
  'All',
  'Saber',
  'Archer',
  'Lancer',
  'Rider',
  'Caster',
  'Assassin',
  'Berserker',
  'Shielder',
  'Ruler',
  'Avenger',
  'MoonCancer',
  'Alterego',
  'Foreigner',
  'Pretender',
  'Beast',
];

const CE_CATEGORIES = [
  '全部',
  '普通概念礼装',
  '牵绊概念礼装',
  '纪念概念礼装',
  '情人节概念礼装',
  '魔力棱镜兑换概念礼装',
];

export const App: React.FC = () => {
  const [catalog, setCatalog] = useState<CatalogSummaryPayload | null>(null);
  const [initError, setInitError] = useState<string>('');
  const [mainTab, setMainTab] = useState<'servant' | 'ce'>('servant');

  // Search, sort & layout mode
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'id_desc' | 'id_asc' | 'atk_desc' | 'hp_desc' | 'rarity_desc'>('id_desc');
  const [viewMode, setViewMode] = useState<'grid' | 'card'>('grid');

  // Servant Filters
  const [svtFilters, setSvtFilters] = useState<ServantFilterState>(INITIAL_SERVANT_FILTERS);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // CE Filters
  const [ceRarityFilter, setCeRarityFilter] = useState<number | null>(null);
  const [ceCategoryFilter, setCeCategoryFilter] = useState<string>('全部');

  // Infinite scroll pagination
  const [visibleLimit, setVisibleLimit] = useState(96);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Detail Modals
  const [selectedSvt, setSelectedSvt] = useState<ServantDetail | null>(null);
  const [svtLoading, setSvtLoading] = useState(false);
  const [selectedCe, setSelectedCe] = useState<CraftEssenceDetail | null>(null);
  const [ceLoading, setCeLoading] = useState(false);

  // Non-blocking background update state
  const [updateState, setUpdateState] = useState<UpdateProgress | null>(null);
  const [updateToastVisible, setUpdateToastVisible] = useState(false);

  useEffect(() => {
    loadCatalogSummary()
      .then((data) => setCatalog(data))
      .catch((err) => setInitError(err.message || '加载离线数据失败'));
  }, []);

  // Reset pagination when filters/tab/search change
  useEffect(() => {
    setVisibleLimit(96);
  }, [mainTab, searchQuery, sortBy, svtFilters, ceRarityFilter, ceCategoryFilter]);

  // Filtered & sorted Servants
  const filteredServants = useMemo(() => {
    if (!catalog) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = catalog.servants.filter((s) => {
      if (q) {
        const matchId = String(s.id) === q.replace(/^#/, '');
        const matchText =
          s.nameCn.toLowerCase().includes(q) ||
          s.nameJp.toLowerCase().includes(q) ||
          s.nameEn.toLowerCase().includes(q) ||
          s.aliases.toLowerCase().includes(q) ||
          s.className.toLowerCase().includes(q);
        if (!matchId && !matchText) return false;
      }
      if (svtFilters.rarities.length > 0 && !svtFilters.rarities.includes(s.rarity)) {
        return false;
      }
      if (svtFilters.classes.length > 0 && !svtFilters.classes.includes(s.className)) {
        return false;
      }
      if (
        svtFilters.npColors.length > 0 &&
        !s.npColors.some((c) => svtFilters.npColors.includes(c))
      ) {
        return false;
      }
      if (
        svtFilters.npTypes.length > 0 &&
        !s.npTypes.some((t) => svtFilters.npTypes.includes(t))
      ) {
        return false;
      }
      if (
        svtFilters.npKinds.length > 0 &&
        !s.npKinds.some((k) => svtFilters.npKinds.includes(k))
      ) {
        return false;
      }
      if (svtFilters.methods.length > 0 && !svtFilters.methods.includes(s.method)) {
        return false;
      }
      if (svtFilters.traits.length > 0) {
        if (svtFilters.traitMatchMode === 'AND') {
          if (!svtFilters.traits.every((t) => s.traits.includes(t))) return false;
        } else {
          if (!svtFilters.traits.some((t) => s.traits.includes(t))) return false;
        }
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'id_asc') return a.id - b.id;
      if (sortBy === 'atk_desc') return b.atkMax - a.atkMax || b.id - a.id;
      if (sortBy === 'hp_desc') return b.hpMax - a.hpMax || b.id - a.id;
      if (sortBy === 'rarity_desc') return b.rarity - a.rarity || b.id - a.id;
      return b.id - a.id;
    });
  }, [catalog, searchQuery, svtFilters, sortBy]);

  // Filtered & sorted Craft Essences
  const filteredCes = useMemo(() => {
    if (!catalog) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = catalog.craftEssences.filter((c) => {
      if (q) {
        const matchId = String(c.id) === q.replace(/^#/, '');
        const matchText =
          c.nameCn.toLowerCase().includes(q) ||
          c.nameJp.toLowerCase().includes(q) ||
          c.aliases.toLowerCase().includes(q) ||
          c.des.toLowerCase().includes(q);
        if (!matchId && !matchText) return false;
      }
      if (ceRarityFilter !== null && c.rarity !== ceRarityFilter) {
        return false;
      }
      if (ceCategoryFilter !== '全部' && c.category !== ceCategoryFilter) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'id_asc') return a.id - b.id;
      if (sortBy === 'rarity_desc') return b.rarity - a.rarity || b.id - a.id;
      return b.id - a.id;
    });
  }, [catalog, searchQuery, ceRarityFilter, ceCategoryFilter, sortBy]);

  // IntersectionObserver for smooth infinite scroll
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const totalCount = mainTab === 'servant' ? filteredServants.length : filteredCes.length;
    if (visibleLimit >= totalCount) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleLimit((prev) => prev + 96);
        }
      },
      { rootMargin: '320px' }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [visibleLimit, mainTab, filteredServants.length, filteredCes.length]);

  const activeFilterCount =
    svtFilters.rarities.length +
    svtFilters.classes.length +
    svtFilters.npColors.length +
    svtFilters.npTypes.length +
    svtFilters.npKinds.length +
    svtFilters.methods.length +
    svtFilters.traits.length;

  const handleOpenServant = async (id: number) => {
    setSvtLoading(true);
    setSelectedSvt(null);
    try {
      const detail = await loadServantDetail(id);
      setSelectedSvt(detail);
    } finally {
      setSvtLoading(false);
    }
  };

  const handleOpenCe = async (id: number) => {
    setCeLoading(true);
    setSelectedCe(null);
    try {
      const detail = await loadCraftEssenceDetail(id);
      setSelectedCe(detail);
    } finally {
      setCeLoading(false);
    }
  };

  const handleJumpToServantByTitle = (title: string) => {
    if (!catalog) return;
    const target = catalog.servants.find(
      (s) => s.title === title || s.nameCn === title
    );
    if (target) {
      setSelectedCe(null);
      handleOpenServant(target.id);
    }
  };

  const handleTriggerOnlineUpdate = async () => {
    if (!catalog || updateState?.running) {
      setUpdateToastVisible(true);
      return;
    }
    setUpdateToastVisible(true);
    try {
      const res = await syncFromMooncell(
        catalog.servants,
        catalog.craftEssences,
        (prog) => setUpdateState(prog)
      );
      if (res.newServants.length > 0 || res.newCes.length > 0) {
        setCatalog((prev) => {
          if (!prev) return prev;
          const nextSvts = [...res.newServants, ...prev.servants].sort((a, b) => b.id - a.id);
          const nextCes = [...res.newCes, ...prev.craftEssences].sort((a, b) => b.id - a.id);
          return {
            ...prev,
            counts: { servant: nextSvts.length, craftEssence: nextCes.length },
            servants: nextSvts,
            craftEssences: nextCes,
          };
        });
      }
    } catch (err: any) {
      setUpdateState({
        running: false,
        phase: '同步未完成（当前处于离线模式或网络受限，本地离线图鉴可正常使用）',
        current: 100,
        total: 100,
        updatedServants: 0,
        updatedCes: 0,
        error: err?.message || '网络请求异常',
      });
    }
  };

  if (initError) {
    return (
      <div className="app-error-screen">
        <AlertCircle size={40} />
        <h2>离线数据加载失败</h2>
        <p>{initError}</p>
      </div>
    );
  }

  return (
    <div className="fgo-app-shell">
      {/* Top App Bar */}
      <header className="app-topbar">
        <div className="brand-area">
          <div className="brand-logo">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="brand-title">Mooncell 迦勒底图鉴</h1>
            <span className="brand-subtitle">
              英灵 {catalog?.counts.servant || 487} · 概念礼装 {catalog?.counts.craftEssence || 2719}
            </span>
          </div>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className={`btn-update ${updateState?.running ? 'updating' : ''}`}
            onClick={handleTriggerOnlineUpdate}
            title="从 Mooncell 网站后台检查并更新数据，更新期间不影响浏览"
          >
            <RefreshCw size={15} className={updateState?.running ? 'spin-icon' : ''} />
            <span>{updateState?.running ? `更新中 ${updateState.current}%` : '从网站更新数据'}</span>
          </button>
        </div>
      </header>

      {/* Non-blocking Floating Update Status Banner */}
      {updateToastVisible && updateState && (
        <div className="nonblocking-update-toast" role="status" aria-live="polite">
          <div className="update-toast-main">
            {updateState.running ? (
              <RefreshCw size={16} className="spin-icon text-accent" />
            ) : updateState.error ? (
              <AlertCircle size={16} className="text-warn" />
            ) : (
              <CheckCircle2 size={16} className="text-success" />
            )}
            <div className="update-toast-text">
              <div className="update-phase">{updateState.phase}</div>
              {updateState.running && (
                <div className="update-progress-track">
                  <div
                    className="update-progress-fill"
                    style={{ width: `${updateState.current}%` }}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => setUpdateToastVisible(false)}
              title="后台继续运行 / 隐藏提示"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Search & Controls Toolbar */}
      <div className="search-toolbar">
        <div className="search-input-box">
          <Search size={17} className="search-icon" />
          <input
            type="text"
            placeholder={
              mainTab === 'servant'
                ? '搜索英灵名称 / 外号(如:呆毛、水千利休) / 日文 / 编号...'
                : '搜索概念礼装名称 / 技能效果(如:充能、暴击、无敌贯通) / 编号...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="清空搜索"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="toolbar-right-btns">
          {mainTab === 'servant' && (
            <button
              type="button"
              className={`btn-toolbar ${activeFilterCount > 0 ? 'active' : ''}`}
              onClick={() => setFilterModalOpen(true)}
            >
              <Filter size={16} />
              <span>筛选</span>
              {activeFilterCount > 0 && (
                <span className="filter-count-pill">{activeFilterCount}</span>
              )}
            </button>
          )}

          <div className="sort-select-wrap">
            <ArrowUpDown size={14} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="排序方式"
            >
              <option value="id_desc">按编号 倒序</option>
              <option value="id_asc">按编号 正序</option>
              <option value="rarity_desc">按星级 降序</option>
              {mainTab === 'servant' && <option value="atk_desc">满级ATK 降序</option>}
              {mainTab === 'servant' && <option value="hp_desc">满级HP 降序</option>}
            </select>
          </div>

          <button
            type="button"
            className="btn-toolbar icon-only"
            onClick={() => setViewMode((m) => (m === 'grid' ? 'card' : 'grid'))}
            title={viewMode === 'grid' ? '切换为详细图文列表' : '切换为紧凑缩略图网格'}
          >
            {viewMode === 'grid' ? <List size={17} /> : <LayoutGrid size={17} />}
          </button>
        </div>
      </div>

      {/* Sub-bar: Quick Class Switcher (Servant Tab) or Quick Category Bar (CE Tab) */}
      {mainTab === 'servant' ? (
        <div className="quick-bar-wrap">
          <div className="quick-class-scroll">
            {QUICK_CLASSES.map((cls) => {
              const isAll = cls === 'All';
              const active = isAll
                ? svtFilters.classes.length === 0
                : svtFilters.classes.includes(cls);
              return (
                <button
                  key={cls}
                  type="button"
                  className={`q-class-item ${active ? 'active' : ''}`}
                  onClick={() => {
                    if (isAll) {
                      setSvtFilters((f) => ({ ...f, classes: [] }));
                    } else {
                      setSvtFilters((f) => ({
                        ...f,
                        classes: f.classes.length === 1 && f.classes[0] === cls ? [] : [cls],
                      }));
                    }
                  }}
                >
                  <SmartImage
                    localSrc={`/assets/icons/ui/金卡${cls}.png`}
                    alt={cls}
                    className="q-class-img"
                  />
                  <span>{isAll ? '全部' : cls}</span>
                </button>
              );
            })}
          </div>

          {/* Active filter pills bar */}
          {activeFilterCount > 0 && (
            <div className="active-filters-bar">
              <span className="af-label">已选条件 ({filteredServants.length}骑)：</span>
              {svtFilters.rarities.map((r) => (
                <span
                  key={`r-${r}`}
                  className="af-pill"
                  onClick={() =>
                    setSvtFilters((f) => ({
                      ...f,
                      rarities: f.rarities.filter((x) => x !== r),
                    }))
                  }
                >
                  {r}★ ×
                </span>
              ))}
              {svtFilters.classes.map((c) => (
                <span
                  key={`c-${c}`}
                  className="af-pill"
                  onClick={() =>
                    setSvtFilters((f) => ({
                      ...f,
                      classes: f.classes.filter((x) => x !== c),
                    }))
                  }
                >
                  {c} ×
                </span>
              ))}
              {svtFilters.npColors.map((c) => (
                <span
                  key={`npc-${c}`}
                  className="af-pill"
                  onClick={() =>
                    setSvtFilters((f) => ({
                      ...f,
                      npColors: f.npColors.filter((x) => x !== c),
                    }))
                  }
                >
                  {c}宝具 ×
                </span>
              ))}
              {svtFilters.npTypes.map((t) => (
                <span
                  key={`npt-${t}`}
                  className="af-pill"
                  onClick={() =>
                    setSvtFilters((f) => ({
                      ...f,
                      npTypes: f.npTypes.filter((x) => x !== t),
                    }))
                  }
                >
                  {t} ×
                </span>
              ))}
              {svtFilters.npKinds.map((k) => (
                <span
                  key={`npk-${k}`}
                  className="af-pill"
                  onClick={() =>
                    setSvtFilters((f) => ({
                      ...f,
                      npKinds: f.npKinds.filter((x) => x !== k),
                    }))
                  }
                >
                  {k} ×
                </span>
              ))}
              {svtFilters.methods.map((m) => (
                <span
                  key={`m-${m}`}
                  className="af-pill"
                  onClick={() =>
                    setSvtFilters((f) => ({
                      ...f,
                      methods: f.methods.filter((x) => x !== m),
                    }))
                  }
                >
                  {m} ×
                </span>
              ))}
              {svtFilters.traits.map((t) => (
                <span
                  key={`t-${t}`}
                  className="af-pill trait"
                  onClick={() =>
                    setSvtFilters((f) => ({
                      ...f,
                      traits: f.traits.filter((x) => x !== t),
                    }))
                  }
                >
                  特性:{t} ×
                </span>
              ))}
              <button
                type="button"
                className="af-reset-link"
                onClick={() => setSvtFilters(INITIAL_SERVANT_FILTERS)}
              >
                清空全部
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="quick-bar-wrap">
          <div className="ce-filter-row">
            <div className="ce-pills-scroll">
              {CE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`filter-chip filter-chip-sm ${
                    ceCategoryFilter === cat ? 'active' : ''
                  }`}
                  onClick={() => setCeCategoryFilter(cat)}
                >
                  {cat}
                </button>
              ))}
              <span className="divider-v" />
              {[5, 4, 3, 2, 1].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`filter-chip filter-chip-sm ${
                    ceRarityFilter === star ? 'active rarity-chip' : ''
                  }`}
                  onClick={() => setCeRarityFilter((prev) => (prev === star ? null : star))}
                >
                  {star}★
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Catalog Scroll Content */}
      <main className="catalog-main">
        {!catalog ? (
          <div className="detail-loading">
            <div className="spinner" />
            <span>正在初始化迦勒底离线资料库...</span>
          </div>
        ) : mainTab === 'servant' ? (
          filteredServants.length === 0 ? (
            <div className="empty-state">
              <p>未找到符合当前筛选条件的英灵</p>
              <button
                type="button"
                className="btn-toolbar active"
                onClick={() => {
                  setSvtFilters(INITIAL_SERVANT_FILTERS);
                  setSearchQuery('');
                }}
              >
                重置所有筛选条件
              </button>
            </div>
          ) : (
            <>
              <div
                className={
                  viewMode === 'grid' ? 'thumb-grid servant-thumb-grid' : 'card-list-grid'
                }
              >
                {filteredServants.slice(0, visibleLimit).map((svt) =>
                  viewMode === 'grid' ? (
                    /* 图1样式：英灵官方带框头像缩略图 */
                    <button
                      key={svt.id}
                      type="button"
                      className="fgo-thumb-item"
                      onClick={() => handleOpenServant(svt.id)}
                    >
                      <div className="fgo-thumb-frame">
                        <SmartImage
                          localSrc={svt.iconLocal}
                          remoteSrc={svt.iconRemote}
                          alt={svt.nameCn}
                          className="fgo-framed-img"
                        />
                        <span className="fgo-thumb-no">#{svt.id}</span>
                      </div>
                      <div className="fgo-thumb-caption">{svt.nameCn}</div>
                    </button>
                  ) : (
                    <button
                      key={svt.id}
                      type="button"
                      className="fgo-rich-row"
                      onClick={() => handleOpenServant(svt.id)}
                    >
                      <SmartImage
                        localSrc={svt.iconLocal}
                        remoteSrc={svt.iconRemote}
                        alt={svt.nameCn}
                        className="fgo-row-thumb"
                      />
                      <div className="fgo-row-body">
                        <div className="fgo-row-top">
                          <span className="fgo-row-no">No.{svt.id}</span>
                          <strong className="fgo-row-title">{svt.nameCn}</strong>
                          <span className="fgo-row-method">{svt.method}</span>
                        </div>
                        <div className="fgo-row-sub">
                          <span>{svt.className}</span>
                          <span>·</span>
                          <span>{svt.npColors.join('/')}</span>
                          <span>·</span>
                          <span>{svt.npTypes.join('/')}宝具</span>
                        </div>
                        <div className="fgo-row-stats">
                          <span>ATK {svt.atkMax || '—'}</span>
                          <span>HP {svt.hpMax || '—'}</span>
                        </div>
                      </div>
                    </button>
                  )
                )}
              </div>
              {visibleLimit < filteredServants.length && (
                <div ref={loadMoreRef} className="load-more-sentinel">
                  正在加载更多英灵 ({visibleLimit} / {filteredServants.length})...
                </div>
              )}
            </>
          )
        ) : filteredCes.length === 0 ? (
          <div className="empty-state">
            <p>未找到符合条件的概念礼装</p>
            <button
              type="button"
              className="btn-toolbar active"
              onClick={() => {
                setCeRarityFilter(null);
                setCeCategoryFilter('全部');
                setSearchQuery('');
              }}
            >
              重置礼装筛选
            </button>
          </div>
        ) : (
          <>
            <div className={viewMode === 'grid' ? 'thumb-grid ce-thumb-grid' : 'card-list-grid'}>
              {filteredCes.slice(0, visibleLimit).map((ce) =>
                viewMode === 'grid' ? (
                  /* 图2样式：概念礼装官方带框缩略图 */
                  <button
                    key={ce.id}
                    type="button"
                    className="fgo-thumb-item"
                    onClick={() => handleOpenCe(ce.id)}
                  >
                    <div className="fgo-thumb-frame">
                      <SmartImage
                        localSrc={ce.iconLocal}
                        remoteSrc={ce.iconRemote}
                        alt={ce.nameCn}
                        className="fgo-framed-img"
                      />
                      <span className="fgo-thumb-no">#{ce.id}</span>
                    </div>
                    <div className="fgo-thumb-caption">{ce.nameCn}</div>
                  </button>
                ) : (
                  <button
                    key={ce.id}
                    type="button"
                    className="fgo-rich-row"
                    onClick={() => handleOpenCe(ce.id)}
                  >
                    <SmartImage
                      localSrc={ce.iconLocal}
                      remoteSrc={ce.iconRemote}
                      alt={ce.nameCn}
                      className="fgo-row-thumb"
                    />
                    <div className="fgo-row-body">
                      <div className="fgo-row-top">
                        <span className="fgo-row-no">No.{ce.id}</span>
                        <strong className="fgo-row-title">{ce.nameCn}</strong>
                        <span className="fgo-row-method">{ce.category}</span>
                      </div>
                      <div className="fgo-row-ce-desc">{ce.desMax || ce.des}</div>
                      <div className="fgo-row-stats">
                        <span>ATK {ce.atk}</span>
                        <span>HP {ce.hp}</span>
                        <span>COST {ce.cost}</span>
                      </div>
                    </div>
                  </button>
                )
              )}
            </div>
            {visibleLimit < filteredCes.length && (
              <div ref={loadMoreRef} className="load-more-sentinel">
                正在加载更多概念礼装 ({visibleLimit} / {filteredCes.length})...
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom Mobile Navigation Bar */}
      <nav className="app-bottom-nav">
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'servant' ? 'active' : ''}`}
          onClick={() => setMainTab('servant')}
        >
          <Shield size={20} />
          <span>英灵图鉴</span>
          <small className="nav-badge">{filteredServants.length}</small>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'ce' ? 'active' : ''}`}
          onClick={() => setMainTab('ce')}
        >
          <Sparkles size={20} />
          <span>礼装图鉴</span>
          <small className="nav-badge">{filteredCes.length}</small>
        </button>
      </nav>

      {/* Filter Drawer for Servants */}
      <ServantFilterModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        filters={svtFilters}
        onChange={setSvtFilters}
        onReset={() => setSvtFilters(INITIAL_SERVANT_FILTERS)}
        traitGroups={catalog?.traitGroups || []}
        matchedCount={filteredServants.length}
      />

      {/* Servant Detail Sheet */}
      <ServantDetailModal
        servant={selectedSvt}
        loading={svtLoading}
        onClose={() => {
          setSelectedSvt(null);
          setSvtLoading(false);
        }}
        onSelectTrait={(trait) => {
          setMainTab('servant');
          setSvtFilters((prev) => ({
            ...prev,
            traits: prev.traits.includes(trait) ? prev.traits : [...prev.traits, trait],
          }));
        }}
        onOpenBondCe={(ceId) => {
          setSelectedSvt(null);
          handleOpenCe(ceId);
        }}
      />

      {/* Craft Essence Detail Sheet */}
      <CeDetailModal
        ce={selectedCe}
        loading={ceLoading}
        onClose={() => {
          setSelectedCe(null);
          setCeLoading(false);
        }}
        onJumpToServantByTitle={handleJumpToServantByTitle}
      />
    </div>
  );
};
