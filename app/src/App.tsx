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
  Wand2,
  Shirt,
  Package,
  MapPin,
  Swords,
  Ticket,
  BookOpen,
} from 'lucide-react';
import {
  CatalogSummaryPayload,
  ExtrasCatalogPayload,
  EventsBannersPayload,
  StoryWarsPayload,
  ServantFilterState,
  CeFilterState,
  ServantDetail,
  CraftEssenceDetail,
  MysticCode,
  CostumeItem,
  GameItem,
  EventSummary,
} from './types';
import {
  loadCatalogSummary,
  loadExtrasCatalog,
  loadEventsBanners,
  loadServantDetail,
  loadCraftEssenceDetail,
  syncFromMooncell,
  syncFromCloudManifest,
  UpdateProgress,
} from './services/dataService';
import { SmartImage } from './components/SmartImage';
import { ServantFilterModal } from './components/ServantFilterModal';
import { CeFilterModal } from './components/CeFilterModal';
import { ServantDetailModal } from './components/ServantDetailModal';
import { CeDetailModal } from './components/CeDetailModal';
import {
  MysticCodeDetailModal,
  CostumeDetailModal,
  ItemDetailModal,
} from './components/ExtrasModals';
import { EventDetailModal, BannerCard } from './components/EventsBannersView';
import { QuestConfigHub } from './components/QuestConfigHub';
import { StoryHub } from './components/StoryHub';
import { BackToTopButton } from './components/BackToTopButton';
import { loadStoryWars, syncStoryWarsFromAtlas } from './services/storyService';

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

const INITIAL_CE_FILTERS: CeFilterState = {
  rarities: [],
  categories: [],
  statTypes: [],
  effectTags: [],
  tagMatchMode: 'AND',
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

const QUICK_CE_TAGS = [
  '初始NP',
  'Buster性能提升',
  'Arts性能提升',
  'Quick性能提升',
  '宝具威力提升',
  '暴击威力提升',
  'NP获得量提升',
  '每回合获得暴击星',
  '无敌贯通',
  '牵绊点数加成',
  'QP获得量加成',
];

const ITEM_CATEGORIES = [
  '全部',
  '铜素材',
  '银素材',
  '金素材',
  '职阶技能石',
  '职阶棋子',
  '特殊素材',
  '一般道具',
];

export const App: React.FC = () => {
  const [catalog, setCatalog] = useState<CatalogSummaryPayload | null>(null);
  const [extras, setExtras] = useState<ExtrasCatalogPayload | null>(null);
  const [eventsBanners, setEventsBanners] = useState<EventsBannersPayload | null>(null);
  const [storyWars, setStoryWars] = useState<StoryWarsPayload | null>(null);
  const [initError, setInitError] = useState<string>('');
  const [mainTab, setMainTab] = useState<
    'servant' | 'ce' | 'mc' | 'costume' | 'item' | 'event' | 'banner' | 'story'
  >('servant');
  const [tabResetTick, setTabResetTick] = useState(0);

  const handleBottomTabClick = (
    tab: 'servant' | 'ce' | 'mc' | 'costume' | 'item' | 'event' | 'banner' | 'story'
  ) => {
    setMainTab(tab);
    setSearchQuery('');
    setFilterModalOpen(false);
    setCeFilterModalOpen(false);
    setSelectedSvt(null);
    setSelectedCe(null);
    setSelectedMc(null);
    setSelectedCostume(null);
    setSelectedItem(null);
    setSelectedEvent(null);
    setTabResetTick((t) => t + 1);
    catalogMainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Search, sort & layout mode
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'id_desc' | 'id_asc' | 'atk_desc' | 'hp_desc' | 'rarity_desc'>('id_desc');
  const [viewMode, setViewMode] = useState<'grid' | 'card'>('grid');

  // Servant Filters
  const [svtFilters, setSvtFilters] = useState<ServantFilterState>(INITIAL_SERVANT_FILTERS);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // CE Filters
  const [ceFilters, setCeFilters] = useState<CeFilterState>(INITIAL_CE_FILTERS);
  const [ceFilterModalOpen, setCeFilterModalOpen] = useState(false);

  // Item Filters
  const [itemCategory, setItemCategory] = useState<string>('全部');
  const [itemDropsOnly, setItemDropsOnly] = useState<boolean>(false);

  // Event & Banner Filters
  const [eventFilter, setEventFilter] = useState<'all' | 'live' | 'future' | 'Event' | 'Campaign'>('all');
  const [bannerFilter, setBannerFilter] = useState<'all' | 'cn_live' | 'jp_live' | 'future' | 'lucky'>('all');

  // Infinite scroll pagination
  const [visibleLimit, setVisibleLimit] = useState(96);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const catalogMainRef = useRef<HTMLElement | null>(null);
  const autoSyncedRef = useRef(false);

  // Detail Modals
  const [selectedSvt, setSelectedSvt] = useState<ServantDetail | null>(null);
  const [svtLoading, setSvtLoading] = useState(false);
  const [selectedCe, setSelectedCe] = useState<CraftEssenceDetail | null>(null);
  const [ceLoading, setCeLoading] = useState(false);
  const [selectedMc, setSelectedMc] = useState<MysticCode | null>(null);
  const [selectedCostume, setSelectedCostume] = useState<CostumeItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<GameItem | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);

  // Non-blocking background update state
  const [updateState, setUpdateState] = useState<UpdateProgress | null>(null);
  const [updateToastVisible, setUpdateToastVisible] = useState(false);
  const [updateToastFading, setUpdateToastFading] = useState(false);

  const showToast = () => {
    setUpdateToastFading(false);
    setUpdateToastVisible(true);
  };

  const dismissToastSmoothly = () => {
    setUpdateToastFading(true);
    window.setTimeout(() => {
      setUpdateToastVisible(false);
      setUpdateToastFading(false);
    }, 450);
  };

  // 更新完成或出错后渐变式淡出隐藏提示框（成功 3.2 秒后开始淡出，异常 4.7 秒后开始淡出）
  useEffect(() => {
    if (!updateToastVisible || !updateState || updateState.running) return;
    const delay = updateState.error ? 4700 : 3200;
    const fadeTimer = window.setTimeout(() => {
      setUpdateToastFading(true);
    }, delay);
    const hideTimer = window.setTimeout(() => {
      setUpdateToastVisible(false);
      setUpdateToastFading(false);
    }, delay + 450);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [updateToastVisible, updateState]);

  useEffect(() => {
    loadCatalogSummary()
      .then((data) => setCatalog(data))
      .catch((err) => setInitError(err.message || '加载离线数据失败'));
    loadExtrasCatalog()
      .then((data) => setExtras(data))
      .catch(() => {});
    loadEventsBanners()
      .then((data) => setEventsBanners(data))
      .catch(() => {});
    loadStoryWars()
      .then((data) => setStoryWars(data))
      .catch(() => {});
  }, []);

  // Reset pagination & scroll position to top when switching tabs or filters
  useEffect(() => {
    setVisibleLimit(96);
    if (catalogMainRef.current) {
      catalogMainRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [mainTab, searchQuery, sortBy, svtFilters, ceFilters, itemCategory, itemDropsOnly, eventFilter, bannerFilter]);

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
          c.des.toLowerCase().includes(q) ||
          (c.effectTags || []).some((t) => t.toLowerCase().includes(q));
        if (!matchId && !matchText) return false;
      }
      if (ceFilters.rarities.length > 0 && !ceFilters.rarities.includes(c.rarity)) {
        return false;
      }
      if (ceFilters.categories.length > 0 && !ceFilters.categories.includes(c.category)) {
        return false;
      }
      if (
        ceFilters.statTypes.length > 0 &&
        (!c.statType || !ceFilters.statTypes.includes(c.statType))
      ) {
        return false;
      }
      if (ceFilters.effectTags.length > 0) {
        const cTags = c.effectTags || [];
        if (ceFilters.tagMatchMode === 'AND') {
          if (!ceFilters.effectTags.every((t) => cTags.includes(t))) return false;
        } else {
          if (!ceFilters.effectTags.some((t) => cTags.includes(t))) return false;
        }
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'id_asc') return a.id - b.id;
      if (sortBy === 'rarity_desc') return b.rarity - a.rarity || b.id - a.id;
      return b.id - a.id;
    });
  }, [catalog, searchQuery, ceFilters, sortBy]);

  // Filtered Mystic Codes
  const filteredMysticCodes = useMemo(() => {
    if (!extras) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return extras.mysticCodes;
    return extras.mysticCodes.filter(
      (mc) =>
        mc.nameCn.toLowerCase().includes(q) ||
        mc.nameJp.toLowerCase().includes(q) ||
        mc.descCn.toLowerCase().includes(q) ||
        mc.skills.some(
          (sk) =>
            sk.nameCn.toLowerCase().includes(q) ||
            sk.effects.some((ef) => ef.text.toLowerCase().includes(q))
        )
    );
  }, [extras, searchQuery]);

  // Filtered Costumes
  const filteredCostumes = useMemo(() => {
    if (!extras) return [];
    const q = searchQuery.trim().toLowerCase();
    const list = !q
      ? extras.costumes
      : extras.costumes.filter(
          (c) =>
            String(c.id) === q.replace(/^#/, '') ||
            c.nameCn.toLowerCase().includes(q) ||
            c.nameJp.toLowerCase().includes(q) ||
            c.servant.toLowerCase().includes(q) ||
            c.obtain.toLowerCase().includes(q)
        );
    return [...list].sort((a, b) => (sortBy === 'id_asc' ? a.id - b.id : b.id - a.id));
  }, [extras, searchQuery, sortBy]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    if (!extras) return [];
    const q = searchQuery.trim().toLowerCase();
    return extras.items.filter((it) => {
      if (itemCategory !== '全部' && it.categoryGroup !== itemCategory) return false;
      if (itemDropsOnly && it.dropCount === 0) return false;
      if (q) {
        const matchText =
          it.nameCn.toLowerCase().includes(q) ||
          it.nameJp.toLowerCase().includes(q) ||
          it.nameEn.toLowerCase().includes(q) ||
          it.categoryGroup.toLowerCase().includes(q) ||
          it.dropQuests.some(
            (dq) =>
              dq.questCn.toLowerCase().includes(q) ||
              dq.chapter.toLowerCase().includes(q) ||
              dq.location.toLowerCase().includes(q)
          );
        if (!matchText) return false;
      }
      return true;
    });
  }, [extras, searchQuery, itemCategory, itemDropsOnly]);

  const handleOpenItemByName = (name: string) => {
    if (!extras) return;
    const found = extras.items.find(
      (it) => it.nameCn === name || it.nameJp === name || it.nameCn.includes(name)
    );
    if (found) {
      setSelectedItem(found);
    }
  };

  const servantByTitle = useMemo(() => {
    const map = new Map<string, typeof filteredServants[number]>();
    if (!catalog) return map;
    for (const s of catalog.servants) {
      map.set(s.title, s);
      if (!map.has(s.nameCn)) map.set(s.nameCn, s);
    }
    return map;
  }, [catalog]);

  const ceByTitle = useMemo(() => {
    const map = new Map<string, typeof filteredCes[number]>();
    if (!catalog) return map;
    for (const c of catalog.craftEssences) {
      map.set(c.title, c);
      if (!map.has(c.nameCn)) map.set(c.nameCn, c);
    }
    return map;
  }, [catalog]);

  const filteredEvents = useMemo(() => {
    if (!eventsBanners) return [];
    const q = searchQuery.trim().toLowerCase();
    const nowSec = Math.floor(Date.now() / 1000);
    return eventsBanners.events.filter((ev) => {
      if (eventFilter === 'live') {
        const cnLive = ev.startCn > 0 && ev.startCn <= nowSec && ev.endCn >= nowSec;
        const jpLive = ev.startJp > 0 && ev.startJp <= nowSec && ev.endJp >= nowSec;
        if (!cnLive && !jpLive) return false;
      } else if (eventFilter === 'future') {
        if (!(ev.startCn === 0 && ev.startJp > 0) && !(ev.startCn > nowSec)) return false;
      } else if (eventFilter === 'Event' || eventFilter === 'Campaign') {
        if (ev.type !== eventFilter) return false;
      }
      if (q) {
        if (
          !ev.nameCn.toLowerCase().includes(q) &&
          !ev.nameJp.toLowerCase().includes(q) &&
          !ev.title.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [eventsBanners, searchQuery, eventFilter]);

  const filteredBanners = useMemo(() => {
    if (!eventsBanners) return [];
    const q = searchQuery.trim().toLowerCase();
    const nowSec = Math.floor(Date.now() / 1000);
    return eventsBanners.banners.filter((b) => {
      if (bannerFilter === 'cn_live') {
        if (!(b.startCn > 0 && b.startCn <= nowSec && b.endCn >= nowSec)) return false;
      } else if (bannerFilter === 'jp_live') {
        if (!(b.startJp > 0 && b.startJp <= nowSec && b.endJp >= nowSec)) return false;
      } else if (bannerFilter === 'future') {
        if (!(b.startCn === 0 && b.startJp > 0) && !(b.startCn > nowSec)) return false;
      } else if (bannerFilter === 'lucky') {
        if (!b.luckybag) return false;
      }
      if (q) {
        const matchName =
          b.titleCn.toLowerCase().includes(q) ||
          b.titleJp.toLowerCase().includes(q) ||
          b.servants.some((s) => s.toLowerCase().includes(q)) ||
          b.ces.some((c) => c.toLowerCase().includes(q));
        if (!matchName) return false;
      }
      return true;
    });
  }, [eventsBanners, searchQuery, bannerFilter]);

  // IntersectionObserver for smooth infinite scroll
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) return;
    const totalCount =
      mainTab === 'servant'
        ? filteredServants.length
        : mainTab === 'ce'
        ? filteredCes.length
        : mainTab === 'costume'
        ? filteredCostumes.length
        : mainTab === 'item'
        ? filteredItems.length
        : mainTab === 'event'
        ? filteredEvents.length
        : mainTab === 'banner'
        ? filteredBanners.length
        : filteredMysticCodes.length;
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
  }, [
    visibleLimit,
    mainTab,
    filteredServants.length,
    filteredCes.length,
    filteredCostumes.length,
    filteredItems.length,
    filteredEvents.length,
    filteredBanners.length,
    filteredMysticCodes.length,
  ]);

  const activeSvtFilterCount =
    svtFilters.rarities.length +
    svtFilters.classes.length +
    svtFilters.npColors.length +
    svtFilters.npTypes.length +
    svtFilters.npKinds.length +
    svtFilters.methods.length +
    svtFilters.traits.length;

  const activeCeFilterCount =
    ceFilters.rarities.length +
    ceFilters.categories.length +
    ceFilters.statTypes.length +
    ceFilters.effectTags.length;

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

  const runOnlineSync = async (isAuto: boolean) => {
    if (!catalog || updateState?.running) {
      if (!isAuto) showToast();
      return;
    }
    if (!isAuto) {
      showToast();
    }
    try {
      let latestCatalog = catalog;
      let latestEventsBanners = eventsBanners;
      let cloudUpdatedCount = 0;

      // 通道 1（方案 1）：优先增量同步 GitHub 云端自动生成的完整数据包
      // 覆盖新英灵完整技能/宝具/羁绊、新礼装、新魔术礼装、新灵衣、新素材掉落
      try {
        const cloudRes = await syncFromCloudManifest((phase, percent) => {
          setUpdateState({
            running: true,
            phase,
            current: percent,
            total: 100,
            updatedServants: 0,
            updatedCes: 0,
          });
        });
        cloudUpdatedCount = cloudRes.updatedFiles.length;
        if (cloudRes.catalogUpdated) {
          const freshCat = await loadCatalogSummary();
          latestCatalog = freshCat;
          setCatalog(freshCat);
        }
        if (cloudRes.extrasUpdated) {
          const freshExtras = await loadExtrasCatalog();
          setExtras(freshExtras);
        }
        if (cloudRes.eventsUpdated) {
          const freshEv = await loadEventsBanners();
          latestEventsBanners = freshEv;
          setEventsBanners(freshEv);
        }
      } catch {
        // 云端通道异常时不影响直连源站通道
      }

      // 通道 2：直连 Mooncell 核对最新索引、活动与卡池排期
      const res = await syncFromMooncell(
        latestCatalog.servants,
        latestCatalog.craftEssences,
        (prog) => {
          if (!prog.running && cloudUpdatedCount > 0) {
            setUpdateState({
              ...prog,
              phase: `同步完成：已增量更新 ${cloudUpdatedCount} 个云端完整数据包（英灵/礼装/魔术礼装/灵衣/素材已保存本地）`,
            });
          } else {
            setUpdateState(prog);
          }
        },
        latestEventsBanners?.events || [],
        latestEventsBanners?.banners || []
      );
      let hasAnyUpdate = cloudUpdatedCount > 0;
      if (res.newServants.length > 0 || res.newCes.length > 0) {
        hasAnyUpdate = true;
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
      if (res.syncedEvents.length > 0 || res.syncedBanners.length > 0) {
        setEventsBanners((prev) => {
          if (!prev) return prev;
          const evMap = new Map(prev.events.map((e) => [e.title, e]));
          for (const e of res.syncedEvents) evMap.set(e.title, e);
          const nextEvents = Array.from(evMap.values()).sort(
            (a, b) => Math.max(b.startJp, b.startCn) - Math.max(a.startJp, a.startCn)
          );

          const bnMap = new Map(prev.banners.map((b) => [b.title, b]));
          for (const b of res.syncedBanners) bnMap.set(b.title, b);
          const nextBanners = Array.from(bnMap.values()).sort(
            (a, b) => Math.max(b.startJp, b.startCn) - Math.max(a.startJp, a.startCn)
          );

          return {
            ...prev,
            generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
            counts: { events: nextEvents.length, banners: nextBanners.length },
            events: nextEvents,
            banners: nextBanners,
          };
        });
      }
      // 顺带同步 Atlas Academy CN 最新剧情篇章目录（失败不影响整体同步）
      syncStoryWarsFromAtlas()
        .then((storyRes) => {
          if (storyRes.wars.length > 0) {
            setStoryWars({
              generatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
              counts: {
                total: storyRes.wars.length,
                main: storyRes.wars.filter((w) => w.category !== 'event').length,
                event: storyRes.wars.filter((w) => w.category === 'event').length,
              },
              wars: storyRes.wars,
            });
          }
        })
        .catch(() => {});
      if (hasAnyUpdate || isAuto) {
        // 有更新或自动更新完成时，弹出提示后渐变消失
        showToast();
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
      if (!isAuto) {
        showToast();
      }
    }
  };

  const handleTriggerOnlineUpdate = () => runOnlineSync(false);

  // 每次打开 App 初始化完成后，自动在后台向 Mooncell 执行一次非阻塞更新检查
  useEffect(() => {
    if (!catalog || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    runOnlineSync(true);
  }, [catalog]);

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
            <span>{updateState?.running ? `更新中 ${updateState.current}%` : '更新数据'}</span>
          </button>
        </div>
      </header>

      {/* Non-blocking Floating Update Status Banner (Smooth Fade Out) */}
      {updateToastVisible && updateState && (
        <div
          className={`nonblocking-update-toast ${updateToastFading ? 'toast-fading' : ''}`}
          role="status"
          aria-live="polite"
        >
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
              onClick={dismissToastSmoothly}
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
                : mainTab === 'ce'
                ? '搜索概念礼装名称 / 效果标签(如:初始NP、Buster、暴击) / 编号...'
                : mainTab === 'mc'
                ? '搜索魔术礼装名称 / 御主技能(如:换人、充能、减冷却)...'
                : mainTab === 'costume'
                ? '搜索灵衣名称 / 所属从者(如:玛修、阿尔托莉雅) / 编号...'
                : mainTab === 'item'
                ? '搜索素材道具名称 / 掉落关卡或章节(如:凶骨、冬木、八连双晶)...'
                : mainTab === 'event'
                ? '搜索活动名称 / 活动年份或关键词(如:泳装、唠唠叨叨、圣诞)...'
                : mainTab === 'story'
                ? '搜索主线章节或活动剧情名称(如:奥林波斯、奏章、唠唠叨叨)...'
                : '搜索卡池名称 / UP从者名(如:阿尔托莉雅、摩根) / UP礼装名...'
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
              className={`btn-toolbar ${activeSvtFilterCount > 0 ? 'active' : ''}`}
              onClick={() => setFilterModalOpen(true)}
            >
              <Filter size={16} />
              <span>筛选</span>
              {activeSvtFilterCount > 0 && (
                <span className="filter-count-pill">{activeSvtFilterCount}</span>
              )}
            </button>
          )}
          {mainTab === 'ce' && (
            <button
              type="button"
              className={`btn-toolbar ${activeCeFilterCount > 0 ? 'active' : ''}`}
              onClick={() => setCeFilterModalOpen(true)}
            >
              <Filter size={16} />
              <span>礼装筛选</span>
              {activeCeFilterCount > 0 && (
                <span className="filter-count-pill">{activeCeFilterCount}</span>
              )}
            </button>
          )}

          {(mainTab === 'servant' || mainTab === 'ce' || mainTab === 'costume') && (
            <div className="sort-select-wrap">
              <ArrowUpDown size={14} />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="排序方式"
              >
                <option value="id_desc">按编号 倒序</option>
                <option value="id_asc">按编号 正序</option>
                {(mainTab === 'servant' || mainTab === 'ce') && (
                  <option value="rarity_desc">按星级 降序</option>
                )}
                {mainTab === 'servant' && <option value="atk_desc">满级ATK 降序</option>}
                {mainTab === 'servant' && <option value="hp_desc">满级HP 降序</option>}
              </select>
            </div>
          )}

          {(mainTab === 'servant' || mainTab === 'ce') && (
            <button
              type="button"
              className="btn-toolbar icon-only"
              onClick={() => setViewMode((m) => (m === 'grid' ? 'card' : 'grid'))}
              title={viewMode === 'grid' ? '切换为详细图文列表' : '切换为紧凑缩略图网格'}
            >
              {viewMode === 'grid' ? <List size={17} /> : <LayoutGrid size={17} />}
            </button>
          )}
        </div>
      </div>

      {/* Sub-bar: Quick Class Switcher (Servant Tab) or Quick Category/Tag Bar (CE Tab) */}
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

          {activeSvtFilterCount > 0 && (
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
      ) : mainTab === 'ce' ? (
        <div className="quick-bar-wrap">
          <div className="ce-filter-row">
            <div className="ce-pills-scroll">
              <button
                type="button"
                className={`filter-chip filter-chip-sm ${
                  activeCeFilterCount > 0 ? 'active' : ''
                }`}
                style={{
                  borderColor: '#2563eb',
                  color: activeCeFilterCount > 0 ? '#ffffff' : '#1d4ed8',
                  background: activeCeFilterCount > 0 ? '#2563eb' : '#eff6ff',
                  fontWeight: 800,
                }}
                onClick={() => setCeFilterModalOpen(true)}
              >
                <Filter size={13} />
                <span>全部筛选(星级/标签/种类)</span>
              </button>
              <span className="divider-v" />
              {CE_CATEGORIES.map((cat) => {
                const isAll = cat === '全部';
                const active = isAll
                  ? ceFilters.categories.length === 0
                  : ceFilters.categories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`filter-chip filter-chip-sm ${active ? 'active' : ''}`}
                    onClick={() => {
                      if (isAll) {
                        setCeFilters((f) => ({ ...f, categories: [] }));
                      } else {
                        setCeFilters((f) => ({
                          ...f,
                          categories:
                            f.categories.length === 1 && f.categories[0] === cat ? [] : [cat],
                        }));
                      }
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
              <span className="divider-v" />
              {[5, 4, 3, 2, 1].map((star) => {
                const active = ceFilters.rarities.includes(star);
                return (
                  <button
                    key={star}
                    type="button"
                    className={`filter-chip filter-chip-sm ${
                      active ? 'active rarity-chip' : ''
                    }`}
                    onClick={() =>
                      setCeFilters((f) => ({
                        ...f,
                        rarities: f.rarities.includes(star)
                          ? f.rarities.filter((r) => r !== star)
                          : [...f.rarities, star],
                      }))
                    }
                  >
                    {star}★
                  </button>
                );
              })}
              <span className="divider-v" />
              {QUICK_CE_TAGS.map((tag) => {
                const active = ceFilters.effectTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`filter-chip filter-chip-sm ${active ? 'active' : ''}`}
                    onClick={() =>
                      setCeFilters((f) => ({
                        ...f,
                        effectTags: f.effectTags.includes(tag)
                          ? f.effectTags.filter((t) => t !== tag)
                          : [...f.effectTags, tag],
                      }))
                    }
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {activeCeFilterCount > 0 && (
            <div className="active-filters-bar">
              <span className="af-label">已选礼装条件 ({filteredCes.length}张)：</span>
              {ceFilters.rarities.map((r) => (
                <span
                  key={`cer-${r}`}
                  className="af-pill"
                  onClick={() =>
                    setCeFilters((f) => ({
                      ...f,
                      rarities: f.rarities.filter((x) => x !== r),
                    }))
                  }
                >
                  {r}★ ×
                </span>
              ))}
              {ceFilters.categories.map((c) => (
                <span
                  key={`cec-${c}`}
                  className="af-pill"
                  onClick={() =>
                    setCeFilters((f) => ({
                      ...f,
                      categories: f.categories.filter((x) => x !== c),
                    }))
                  }
                >
                  {c} ×
                </span>
              ))}
              {ceFilters.statTypes.map((st) => (
                <span
                  key={`cest-${st}`}
                  className="af-pill"
                  onClick={() =>
                    setCeFilters((f) => ({
                      ...f,
                      statTypes: f.statTypes.filter((x) => x !== st),
                    }))
                  }
                >
                  {st} ×
                </span>
              ))}
              {ceFilters.effectTags.map((t) => (
                <span
                  key={`cet-${t}`}
                  className="af-pill trait"
                  onClick={() =>
                    setCeFilters((f) => ({
                      ...f,
                      effectTags: f.effectTags.filter((x) => x !== t),
                    }))
                  }
                >
                  效果:{t} ×
                </span>
              ))}
              <button
                type="button"
                className="af-reset-link"
                onClick={() => setCeFilters(INITIAL_CE_FILTERS)}
              >
                清空全部
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Main Catalog Scroll Content */}
      {mainTab === 'item' && (
        <div className="quick-bar-wrap">
          <div className="ce-pills-scroll">
            {ITEM_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`filter-chip filter-chip-sm ${itemCategory === cat ? 'active' : ''}`}
                onClick={() => setItemCategory(cat)}
              >
                {cat}
              </button>
            ))}
            <span className="divider-v" />
            <button
              type="button"
              className={`filter-chip filter-chip-sm ${itemDropsOnly ? 'active rarity-chip' : ''}`}
              onClick={() => setItemDropsOnly((v) => !v)}
            >
              仅看可刷取素材
            </button>
          </div>
        </div>
      )}
      {mainTab === 'banner' && (
        <div className="quick-bar-wrap">
          <div className="ce-pills-scroll">
            {(
              [
                { k: 'all', l: '全部卡池' },
                { k: 'cn_live', l: '国服当前卡池' },
                { k: 'jp_live', l: '日服当前卡池' },
                { k: 'future', l: '国服未来视卡池' },
                { k: 'lucky', l: '福袋召唤' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.k}
                type="button"
                className={`filter-chip filter-chip-sm ${bannerFilter === opt.k ? 'active' : ''}`}
                onClick={() => setBannerFilter(opt.k)}
              >
                {opt.l}
              </button>
            ))}
          </div>
        </div>
      )}
      <main className="catalog-main" ref={catalogMainRef}>
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
        ) : mainTab === 'ce' ? (
          filteredCes.length === 0 ? (
          <div className="empty-state">
            <p>未找到符合条件的概念礼装</p>
            <button
              type="button"
              className="btn-toolbar active"
              onClick={() => {
                setCeFilters(INITIAL_CE_FILTERS);
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
                      {ce.effectTags && ce.effectTags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {ce.effectTags.slice(0, 4).map((tg) => (
                            <span
                              key={tg}
                              style={{
                                fontSize: 10.5,
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                padding: '1px 5px',
                                borderRadius: 4,
                              }}
                            >
                              {tg}
                            </span>
                          ))}
                        </div>
                      )}
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
          )
        ) : mainTab === 'mc' ? (
          filteredMysticCodes.length === 0 ? (
            <div className="empty-state">
              <p>未找到符合条件的魔术礼装</p>
              <button
                type="button"
                className="btn-toolbar active"
                onClick={() => setSearchQuery('')}
              >
                清空搜索
              </button>
            </div>
          ) : (
            <div className="mc-catalog-grid">
              {filteredMysticCodes.map((mc) => (
                <button
                  key={mc.id}
                  type="button"
                  className="mc-catalog-card"
                  onClick={() => setSelectedMc(mc)}
                >
                  <div className="mc-card-thumb-wrap">
                    <SmartImage
                      localSrc={mc.arts[0]?.thumbLocal}
                      remoteSrc={mc.arts[0]?.thumbRemote}
                      fallbackSrc={mc.arts[0]?.fullUrl}
                      alt={mc.nameCn}
                      className="mc-card-thumb"
                    />
                  </div>
                  <div className="mc-card-info">
                    <div className="mc-card-title-row">
                      <span className="fgo-row-no">#{mc.id}</span>
                      <strong>{mc.nameCn}</strong>
                    </div>
                    <div className="mc-card-skills-preview">
                      {mc.skills.map((sk, si) => (
                        <div key={si} className="mc-mini-skill">
                          <SmartImage
                            localSrc={sk.iconLocal}
                            remoteSrc={sk.iconRemote}
                            alt={sk.icon}
                            className="mc-mini-skill-ico"
                          />
                          <span>{sk.nameCn}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : mainTab === 'costume' ? (
          filteredCostumes.length === 0 ? (
            <div className="empty-state">
              <p>未找到符合条件的灵衣</p>
              <button
                type="button"
                className="btn-toolbar active"
                onClick={() => setSearchQuery('')}
              >
                清空搜索
              </button>
            </div>
          ) : (
            <>
              <div className="thumb-grid costume-thumb-grid">
                {filteredCostumes.slice(0, visibleLimit).map((cos) => (
                  <button
                    key={`${cos.id}_${cos.nameCn}`}
                    type="button"
                    className="fgo-thumb-item"
                    onClick={() => setSelectedCostume(cos)}
                  >
                    <div className="fgo-thumb-frame">
                      <SmartImage
                        localSrc={cos.iconLocal || cos.artThumbLocal}
                        remoteSrc={cos.iconRemote || cos.artThumbRemote}
                        fallbackSrc={cos.artFullUrl}
                        alt={cos.nameCn}
                        className="fgo-framed-img"
                      />
                      <span className="fgo-thumb-no">#{cos.id}</span>
                    </div>
                    <div className="fgo-thumb-caption">{cos.nameCn}</div>
                    <div className="costume-svt-sub">{cos.servant}</div>
                  </button>
                ))}
              </div>
              {visibleLimit < filteredCostumes.length && (
                <div ref={loadMoreRef} className="load-more-sentinel">
                  正在加载更多灵衣 ({visibleLimit} / {filteredCostumes.length})...
                </div>
              )}
            </>
          )
        ) : mainTab === 'item' ? (
          filteredItems.length === 0 ? (
          <div className="empty-state">
            <p>未找到符合条件的道具或素材</p>
            <button
              type="button"
              className="btn-toolbar active"
              onClick={() => {
                setItemCategory('全部');
                setItemDropsOnly(false);
                setSearchQuery('');
              }}
            >
              重置道具筛选
            </button>
          </div>
        ) : (
          <div className="item-catalog-grid">
            {filteredItems.slice(0, visibleLimit).map((it) => (
              <button
                key={`${it.id}_${it.nameCn}`}
                type="button"
                className="item-catalog-card"
                onClick={() => setSelectedItem(it)}
              >
                <SmartImage
                  localSrc={it.iconLocal}
                  remoteSrc={it.iconRemote}
                  fallbackSrc={it.iconFallback}
                  alt={it.nameCn}
                  className="item-card-icon"
                />
                <div className="item-card-body">
                  <div className="fgo-row-top">
                    <strong className="fgo-row-title">{it.nameCn}</strong>
                    <span className={`item-cat-tag cat-${it.categoryGroup}`}>{it.categoryGroup}</span>
                  </div>
                  {it.bestQuest ? (
                    <div className="item-best-drop-bar">
                      <MapPin size={12} />
                      <span className="item-best-quest-name">
                        最优：{it.bestQuest.location} · {it.bestQuest.questCn}
                      </span>
                      <strong className="item-best-ap">{it.bestQuest.apPerDrop} AP/个</strong>
                      <span className="item-best-rate">({it.bestQuest.dropRate})</span>
                    </div>
                  ) : (
                    <div className="item-no-drop-hint">{it.descCn || '暂无自由关卡掉落'}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
          )
        ) : mainTab === 'event' ? (
          <QuestConfigHub
            events={filteredEvents}
            searchQuery={searchQuery}
            eventFilter={eventFilter}
            onChangeEventFilter={setEventFilter}
            onOpenEventDetail={(ev) => setSelectedEvent(ev)}
            onScrollTop={() => {
              catalogMainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
            }}
            resetSignal={tabResetTick}
          />
        ) : mainTab === 'story' ? (
          <StoryHub
            wars={storyWars?.wars || []}
            searchQuery={searchQuery}
            onScrollTop={() => {
              catalogMainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
            }}
            resetSignal={tabResetTick}
          />
        ) : filteredBanners.length === 0 ? (
          <div className="empty-state">
            <p>未找到符合条件的推荐召唤卡池</p>
            <button
              type="button"
              className="btn-toolbar active"
              onClick={() => {
                setBannerFilter('all');
                setSearchQuery('');
              }}
            >
              重置卡池筛选
            </button>
          </div>
        ) : (
          <>
            <div className="banner-list-grid">
              {filteredBanners.slice(0, visibleLimit).map((b) => (
                <BannerCard
                  key={b.title}
                  banner={b}
                  servantByTitle={servantByTitle}
                  ceByTitle={ceByTitle}
                  onOpenServant={handleOpenServant}
                  onOpenCe={handleOpenCe}
                />
              ))}
            </div>
            {visibleLimit < filteredBanners.length && (
              <div ref={loadMoreRef} className="load-more-sentinel">
                正在加载更多卡池 ({visibleLimit} / {filteredBanners.length})...
              </div>
            )}
          </>
        )}
      </main>

      <BackToTopButton targetRef={catalogMainRef} variant="main" />

      {/* Bottom Mobile Navigation Bar (8 Tabs, Fixed Full Width) */}
      <nav className="app-bottom-nav nav-7tabs">
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'servant' ? 'active' : ''}`}
          onClick={() => handleBottomTabClick('servant')}
        >
          <Shield size={17} />
          <span>英灵</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'ce' ? 'active' : ''}`}
          onClick={() => handleBottomTabClick('ce')}
        >
          <Sparkles size={17} />
          <span>礼装</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'event' ? 'active' : ''}`}
          onClick={() => handleBottomTabClick('event')}
        >
          <Swords size={17} />
          <span>关卡配置</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'story' ? 'active' : ''}`}
          onClick={() => handleBottomTabClick('story')}
        >
          <BookOpen size={17} />
          <span>剧情</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'banner' ? 'active' : ''}`}
          onClick={() => handleBottomTabClick('banner')}
        >
          <Ticket size={17} />
          <span>卡池</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'item' ? 'active' : ''}`}
          onClick={() => handleBottomTabClick('item')}
        >
          <Package size={17} />
          <span>道具</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'mc' ? 'active' : ''}`}
          onClick={() => handleBottomTabClick('mc')}
        >
          <Wand2 size={17} />
          <span>魔术礼装</span>
        </button>
        <button
          type="button"
          className={`bottom-nav-item ${mainTab === 'costume' ? 'active' : ''}`}
          onClick={() => handleBottomTabClick('costume')}
        >
          <Shirt size={17} />
          <span>灵衣</span>
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
        matchedServants={filteredServants}
        onSelectServant={handleOpenServant}
      />

      {/* Filter Drawer for Craft Essences */}
      <CeFilterModal
        open={ceFilterModalOpen}
        onClose={() => setCeFilterModalOpen(false)}
        filters={ceFilters}
        onChange={setCeFilters}
        onReset={() => setCeFilters(INITIAL_CE_FILTERS)}
        effectGroups={catalog?.ceEffectGroups || []}
        matchedCes={filteredCes}
        onSelectCe={handleOpenCe}
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
        onOpenItemByName={handleOpenItemByName}
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
        onSelectEffectTag={(tag) => {
          setMainTab('ce');
          setCeFilters((prev) => ({
            ...prev,
            effectTags: prev.effectTags.includes(tag)
              ? prev.effectTags
              : [...prev.effectTags, tag],
          }));
        }}
      />

      {/* Mystic Code Detail Sheet */}
      <MysticCodeDetailModal
        mc={selectedMc}
        onClose={() => setSelectedMc(null)}
      />

      {/* Costume Detail Sheet */}
      <CostumeDetailModal
        costume={selectedCostume}
        onClose={() => setSelectedCostume(null)}
        onJumpToServantByTitle={(title) => {
          setSelectedCostume(null);
          handleJumpToServantByTitle(title);
        }}
        onOpenItemByName={handleOpenItemByName}
      />

      {/* Item & Drop Efficiency Detail Sheet */}
      <ItemDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onJumpToItemByName={handleOpenItemByName}
      />

      {/* Event Detail & Quest Config Sheet */}
      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        allBanners={eventsBanners?.banners || []}
        servantByTitle={servantByTitle}
        ceByTitle={ceByTitle}
        onOpenServant={handleOpenServant}
        onOpenCe={handleOpenCe}
      />
    </div>
  );
};
