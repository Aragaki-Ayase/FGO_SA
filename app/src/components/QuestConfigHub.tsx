import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Swords,
  DoorOpen,
  BookOpen,
  Crown,
  Flame,
  ScrollText,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { EventSummary, EventQuestConfigData } from '../types';
import { loadEventQuestConfig } from '../services/dataService';
import { SmartImage } from './SmartImage';
import { useBackClose } from '../utils/backNavigation';

type CategoryKey =
  | 'events'
  | 'chaldea_gate'
  | 'main_story'
  | 'grand_battle'
  | 'azrael'
  | 'main_interlude';

interface SubItem {
  label: string;
  sub?: string;
  pageTitle: string;
  keywords?: string;
}

interface QuestPageStackEntry {
  label: string;
  pageTitle: string;
  anchor?: string;
}

// 参照 Mooncell「迦勒底之门」页面配置整理的完整常驻/周期关卡入口
const CHALDEA_GATE_ITEMS: SubItem[] = [
  {
    label: '每日任务（种火 / 修炼场 / 宝物库）',
    sub: '搜集种火、七职阶修炼场、打开宝物库之门全难度配置',
    pageTitle: '迦勒底之门/每日任务',
    keywords: '种火 修炼场 宝物库 qp 狗粮 日常',
  },
  {
    label: '进阶关卡',
    sub: '第1弹 ～ 最新弹全进阶挑战关卡配置与掉落礼装',
    pageTitle: '迦勒底之门/进阶关卡',
    keywords: '进阶 试炼 礼装',
  },
  {
    label: '强化任务（按弹数一览）',
    sub: '从者技能与宝具强化关卡总览（点击表内从者可查看具体敌方配置）',
    pageTitle: '迦勒底之门/强化任务',
    keywords: '强化 技能本 宝具本 从者强化',
  },
  {
    label: '强化任务（按职阶排序）',
    sub: '按职阶分类检索各从者强化关卡（点击可跳转对应从者任务配置）',
    pageTitle: '迦勒底之门/强化任务/按职阶排序',
    keywords: '强化 职阶 技能本 宝具本',
  },
  {
    label: '幕间物语（关卡一览）',
    sub: '各从者幕间物语关卡总览（点击表内链接可查看敌方配置）',
    pageTitle: '迦勒底之门/幕间物语',
    keywords: '幕间 幕间物语 从者任务',
  },
  {
    label: '魔术礼装任务',
    sub: '迦勒底战斗服、阿特拉斯院、极地服等 16 套御主装备获取关卡',
    pageTitle: '迦勒底之门/魔术礼装任务',
    keywords: '御主装备 衣服 战斗服 换人服',
  },
  {
    label: '纪念任务',
    sub: '周年庆、剧场版、动画播放等历届纪念关卡配置',
    pageTitle: '迦勒底之门/纪念任务',
    keywords: '周年 纪念 回忆关卡',
  },
  {
    label: '体验任务',
    sub: '斯卡哈、达·芬奇、宫本武藏、福尔摩斯等从者体验本配置',
    pageTitle: '迦勒底之门/体验任务',
    keywords: '体验本 试用',
  },
  {
    label: '测试关卡',
    sub: '周年及各职阶伤害测试关卡配置',
    pageTitle: '迦勒底之门/测试关卡',
    keywords: '测试 木桩 职阶测试',
  },
  {
    label: '商店兑换：监狱塔内复仇鬼的哭泣',
    sub: '稀有魔力棱镜兑换常驻活动关卡配置',
    pageTitle: '监狱塔内复仇鬼的哭泣(兑换)/关卡配置',
    keywords: '监狱塔 岩窟王 商店兑换',
  },
  {
    label: '商店兑换：从漫画了解合众国开拓史',
    sub: 'All The States\'Men! 常驻兑换活动关卡配置',
    pageTitle: "复刻：All The States'Men! ～从漫画了解合众国开拓史～(再复刻)/关卡配置",
    keywords: '班扬 漫画 合众国 商店兑换',
  },
  {
    label: '迦勒底之门总览页',
    sub: 'Mooncell 原总览页（点击页面内图片与文字链接可直接跳转对应关卡）',
    pageTitle: '迦勒底之门',
    keywords: '迦勒底之门 总览',
  },
];

const MAIN_STORY_PARTS: { id: string; title: string; subtitle: string; chapters: SubItem[] }[] = [
  {
    id: 'part1',
    title: '1／Observer on Timeless Temple',
    subtitle: '特异点 F ～ 终局特异点（共 9 章）',
    chapters: [
      { label: '特异点F 燃烧污染都市 冬木', pageTitle: '特异点F 燃烧污染都市 冬木' },
      { label: '第一特异点 邪龙百年战争 奥尔良', pageTitle: '第一特异点 邪龙百年战争 奥尔良' },
      { label: '第二特异点 永续疯狂帝国 七丘之城', pageTitle: '第二特异点 永续疯狂帝国 七丘之城' },
      { label: '第三特异点 封锁终局四海 俄刻阿诺斯', pageTitle: '第三特异点 封锁终局四海 俄刻阿诺斯' },
      { label: '第四特异点 死界魔雾都市 伦敦', pageTitle: '第四特异点 死界魔雾都市 伦敦' },
      { label: '第五特异点 北美神话大战 合众为一', pageTitle: '第五特异点 北美神话大战 合众为一' },
      { label: '第六特异点 神圣圆桌领域 卡美洛', pageTitle: '第六特异点 神圣圆桌领域 卡美洛' },
      { label: '第七特异点 绝对魔兽战线 巴比伦尼亚', pageTitle: '第七特异点 绝对魔兽战线 巴比伦尼亚' },
      { label: '终局特异点 冠位时间神殿 所罗门', pageTitle: '终局特异点 冠位时间神殿 所罗门' },
    ],
  },
  {
    id: 'part1_5',
    title: '1.5／断章：残存诗篇',
    subtitle: 'Epic of Remnant · 亚种特异点 Ⅰ ～ Ⅳ',
    chapters: [
      { label: '亚种特异点Ⅰ 恶性隔绝魔境 新宿', pageTitle: '亚种特异点Ⅰ 恶性隔绝魔境 新宿' },
      { label: '亚种特异点Ⅱ 传承地底世界 雅戈泰', pageTitle: '亚种特异点Ⅱ 传承地底世界 雅戈泰' },
      { label: '亚种特异点Ⅲ 尸山血河舞台 下总国', pageTitle: '亚种特异点Ⅲ 尸山血河舞台 下总国' },
      { label: '亚种特异点Ⅳ 禁忌降临庭园 塞勒姆', pageTitle: '亚种特异点Ⅳ 禁忌降临庭园 塞勒姆' },
    ],
  },
  {
    id: 'part2',
    title: '2／异闻带宇宙',
    subtitle: 'Cosmos in the Lostbelt · No.1 ～ No.7',
    chapters: [
      { label: 'Lostbelt No.1 永久冻土帝国 阿纳斯塔西娅', pageTitle: 'Lostbelt No.1 永久冻土帝国 阿纳斯塔西娅' },
      { label: 'Lostbelt No.2 无间冰焰世纪 诸神黄昏', pageTitle: 'Lostbelt No.2 无间冰焰世纪 诸神黄昏' },
      { label: 'Lostbelt No.3 人智统合真国 SIN', pageTitle: 'Lostbelt No.3 人智统合真国 SIN' },
      { label: 'Lostbelt No.4 创世灭亡轮回 由伽·刹多罗', pageTitle: 'Lostbelt No.4 创世灭亡轮回 由伽·刹多罗' },
      { label: 'Lostbelt No.5 神代巨神海洋 亚特兰蒂斯', pageTitle: 'Lostbelt No.5 神代巨神海洋 亚特兰蒂斯' },
      { label: 'Lostbelt No.5 星间都市山脉 奥林波斯', pageTitle: 'Lostbelt No.5 星间都市山脉 奥林波斯' },
      { label: '地狱界曼荼罗 平安京', pageTitle: '地狱界曼荼罗 平安京' },
      { label: 'Lostbelt No.6 妖精圆桌领域 阿瓦隆·勒·菲', pageTitle: 'Lostbelt No.6 妖精圆桌领域 阿瓦隆·勒·菲' },
      { label: 'Lostbelt No.6 阿瓦隆·勒·菲（后篇）', pageTitle: 'Lostbelt No.6 妖精圆桌领域 阿瓦隆·勒·菲(后篇)' },
      { label: '非灵长生存圈 通古斯卡·圣域', pageTitle: '非灵长生存圈 通古斯卡·圣域(主线)' },
      { label: '死想显现界域 Traum', pageTitle: '死想显现界域 Traum' },
      { label: 'Lostbelt No.7 黄金树海纪行 纳维·米克特兰', pageTitle: 'Lostbelt No.7 黄金树海纪行 纳维·米克特兰' },
      { label: 'Lostbelt No.7 纳维·米克特兰（后篇）', pageTitle: 'Lostbelt No.7 黄金树海纪行 纳维·米克特兰(后篇)' },
    ],
  },
  {
    id: 'ordeal_call',
    title: '2／奏章／Ordeal Call',
    subtitle: '奏章序幕 · 奏章 Ⅰ ～ Ⅳ',
    chapters: [
      { label: '奏章序幕', pageTitle: '奏章序幕' },
      { label: '奏章Ⅰ 虚数罗针内界 平面之月', pageTitle: '奏章Ⅰ 虚数罗针内界 平面之月' },
      { label: '奏章Ⅱ 不可逆废弃孔 伊底', pageTitle: '奏章Ⅱ 不可逆废弃孔 伊底' },
      { label: '奏章Ⅲ 新灵长后继战 原型肇始', pageTitle: '奏章Ⅲ 新灵长后继战 原型肇始' },
      { label: '奏章Ⅳ 人类裁决法庭 三位一体·梅塔特洛尼俄斯', pageTitle: '奏章Ⅳ 人类裁决法庭 三位一体·梅塔特洛尼俄斯' },
    ],
  },
  {
    id: 'part2_final',
    title: '2／终章',
    subtitle: '异闻带宇宙 终章序与终章关卡',
    chapters: [
      { label: '终章 序', pageTitle: '终章_序' },
      { label: '终章', pageTitle: '终章' },
    ],
  },
  {
    id: 'after_time',
    title: '？？？／one second after time',
    subtitle: '命运三女神篇 · Aftertime',
    chapters: [
      { label: 'Aftertime 序章（？？？）', pageTitle: '？？？' },
      { label: '命运三女神篇 乡愁永巡刻盘 过去的迦勒底', pageTitle: '命运三女神篇_乡愁永巡刻盘_过去的迦勒底' },
    ],
  },
];

const GRAND_BATTLE_ITEMS: SubItem[] = [
  { label: '冠位戴冠战：Saber', sub: '剑阶冠位战', pageTitle: '冠位戴冠战：Saber' },
  { label: '冠位戴冠战：Berserker', sub: '狂阶冠位战', pageTitle: '冠位戴冠战：Berserker' },
  { label: '冠位戴冠战：Lancer', sub: '枪阶冠位战', pageTitle: '冠位戴冠战：Lancer' },
  { label: '冠位戴冠战：Extra', sub: '特殊职阶冠位战', pageTitle: '冠位戴冠战：Extra' },
  { label: '冠位戴冠战：Rider', sub: '骑阶冠位战', pageTitle: '冠位戴冠战：Rider' },
  { label: '冠位戴冠战：Assassin', sub: '杀阶冠位战', pageTitle: '冠位戴冠战：Assassin' },
  { label: '冠位戴冠战：Archer', sub: '弓阶冠位战', pageTitle: '冠位戴冠战：Archer' },
  { label: '冠位戴冠战：Caster', sub: '术阶冠位战', pageTitle: '冠位戴冠战：Caster' },
];

const MAIN_INTERLUDE_ITEMS: SubItem[] = [
  { label: '深海电脑乐土 SE.RA.PH', pageTitle: '主线物语 深海电脑乐土 SE.RA.PH' },
  { label: '冥界的圣诞快乐', pageTitle: '主线物语 冥界的圣诞快乐' },
  { label: '地狱界曼荼罗 平安京', pageTitle: '地狱界曼荼罗 平安京' },
  { label: '非灵长生存圈 通古斯卡·圣域', pageTitle: '主线物语 非灵长生存圈 通古斯卡·圣域' },
  { label: '死想显现界域 Traum', pageTitle: '死想显现界域 Traum' },
  { label: '德川回天迷宫 大奥', pageTitle: '主线物语 德川回天迷宫 大奥' },
  { label: '虚数大海战', pageTitle: '主线物语 虚数大海战' },
  { label: 'BB主办☆名流夏日体验！', pageTitle: '主线物语 BB主办☆名流夏日体验！' },
];

interface SearchableStaticQuest extends SubItem {
  groupLabel: string;
}

// 汇总全部非活动类关卡，供上方搜索框统一检索
const ALL_STATIC_QUESTS: SearchableStaticQuest[] = [
  ...CHALDEA_GATE_ITEMS.map((item) => ({ ...item, groupLabel: '迦勒底之门' })),
  ...MAIN_STORY_PARTS.flatMap((part) =>
    part.chapters.map((chap) => ({
      ...chap,
      sub: part.title,
      groupLabel: '主线剧情',
      keywords: `${part.title} ${part.subtitle}`,
    }))
  ),
  ...GRAND_BATTLE_ITEMS.map((item) => ({ ...item, groupLabel: '冠位戴冠战' })),
  {
    label: '亚兹拉尔之庙（地狱的试炼）',
    sub: '地狱的试炼专属挑战关卡（最新关卡排在最前）',
    pageTitle: '亚兹拉尔之庙',
    groupLabel: '亚兹拉尔之庙',
    keywords: '地狱 试炼 亚兹拉尔 天魔轰临 埃癸斯 妖精乱舞 暴徒',
  },
  ...MAIN_INTERLUDE_ITEMS.map((item) => ({ ...item, groupLabel: '主线物语' })),
];

/**
 * 判断 Mooncell 页面内被点击的站内链接是否属于可直接在关卡配置中打开的目标
 */
function isNavigableQuestWikiPage(pageTitle: string): boolean {
  const t = pageTitle.trim();
  if (!t) return false;
  if (
    t.startsWith('迦勒底之门') ||
    t.includes('/关卡配置') ||
    t.includes('/从者任务') ||
    t.startsWith('主线物语') ||
    t.startsWith('冠位戴冠战') ||
    t.includes('亚兹拉尔之庙')
  ) {
    return true;
  }
  return ALL_STATIC_QUESTS.some((q) => q.pageTitle === t || q.label === t);
}

interface QuestConfigHubProps {
  events: EventSummary[];
  searchQuery: string;
  eventFilter: 'all' | 'live' | 'future' | 'Event' | 'Campaign';
  onChangeEventFilter: (next: 'all' | 'live' | 'future' | 'Event' | 'Campaign') => void;
  onOpenEventDetail: (ev: EventSummary) => void;
  onScrollTop: () => void;
  resetSignal?: number;
}

export const QuestConfigHub: React.FC<QuestConfigHubProps> = ({
  events,
  searchQuery,
  eventFilter,
  onChangeEventFilter,
  onOpenEventDetail,
  onScrollTop,
  resetSignal = 0,
}) => {
  // 下钻导航状态：
  // Level 0: activeCat = null & questPageStack 空（6 大分类首页 / 全局搜索结果）
  // Level 1: activeCat = 'events' | 'chaldea_gate' | 'main_story' | 'grand_battle' | 'main_interlude'
  // Level 2: activeStoryPartId（主线剧情某一部）
  // Level 3+: questPageStack（支持页内点击跳转子关卡的页面栈）
  const [activeCat, setActiveCat] = useState<CategoryKey | null>(null);
  const [activeStoryPartId, setActiveStoryPartId] = useState<string | null>(null);
  const [questPageStack, setQuestPageStack] = useState<QuestPageStackEntry[]>([]);

  const activeQuestPage =
    questPageStack.length > 0 ? questPageStack[questPageStack.length - 1] : null;

  const [questData, setQuestData] = useState<EventQuestConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const lastResetRef = useRef(resetSignal);

  useEffect(() => {
    if (resetSignal !== lastResetRef.current) {
      lastResetRef.current = resetSignal;
      setQuestPageStack([]);
      setActiveStoryPartId(null);
      setActiveCat(null);
      setQuestData(null);
      setError('');
      onScrollTop();
    }
  }, [resetSignal, onScrollTop]);

  const fetchAndShowQuestPage = useCallback(
    async (entry: QuestPageStackEntry, force = false) => {
      setLoading(true);
      setError('');
      onScrollTop();
      try {
        const data = await loadEventQuestConfig(entry.pageTitle, force);
        setQuestData(data);
      } catch (err: any) {
        setError(err?.message || '加载关卡配置失败');
        setQuestData(null);
      } finally {
        setLoading(false);
      }
    },
    [onScrollTop]
  );

  const openQuestPage = useCallback(
    (label: string, pageTitle: string, anchor?: string, pushToStack = false) => {
      const nextEntry: QuestPageStackEntry = { label, pageTitle, anchor };
      setQuestPageStack((prev) => (pushToStack ? [...prev, nextEntry] : [nextEntry]));
      void fetchAndShowQuestPage(nextEntry, false);
    },
    [fetchAndShowQuestPage]
  );

  // 左上角返回按钮与系统返回手势共用同一套状态回退函数，彻底避免 window.history.back() 失效问题
  const handleBackFromQuestPage = useCallback(() => {
    setQuestPageStack((prev) => {
      if (prev.length > 1) {
        const nextStack = prev.slice(0, -1);
        const target = nextStack[nextStack.length - 1];
        void fetchAndShowQuestPage(target, false);
        return nextStack;
      }
      // 退出最后一层详情页：若来自首页直达的「亚兹拉尔之庙」，同步清空 activeCat
      setQuestData(null);
      setError('');
      if (activeCat === 'azrael') {
        setActiveCat(null);
      }
      onScrollTop();
      return [];
    });
  }, [activeCat, fetchAndShowQuestPage, onScrollTop]);

  const handleBackFromStoryPart = useCallback(() => {
    setQuestPageStack([]);
    setActiveStoryPartId(null);
    onScrollTop();
  }, [onScrollTop]);

  const handleBackFromCategory = useCallback(() => {
    setQuestPageStack([]);
    setActiveStoryPartId(null);
    setActiveCat(null);
    onScrollTop();
  }, [onScrollTop]);

  // 每一层下钻均注册至系统返回栈，按安卓返回键 / 边缘侧滑手势逐级返回上一级
  useBackClose(Boolean(activeCat && !activeStoryPartId && questPageStack.length === 0), handleBackFromCategory);
  useBackClose(Boolean(activeStoryPartId && questPageStack.length === 0), handleBackFromStoryPart);
  useBackClose(questPageStack.length > 0, handleBackFromQuestPage);

  useEffect(() => {
    onScrollTop();
  }, [activeCat, activeStoryPartId, questPageStack.length, onScrollTop]);

  const scrollToSection = useCallback((anchor: string) => {
    if (!anchor) return;
    const container = pageContainerRef.current;
    let el: HTMLElement | null = document.getElementById(anchor);
    if (!el && container) {
      try {
        el = container.querySelector(`[id="${CSS.escape(anchor)}"]`);
      } catch {
        // ignore invalid CSS selector
      }
    }
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // 页面加载完成且带有目标锚点（如 #强化任务1）时自动平滑滚动定位
  useEffect(() => {
    if (!loading && questData && activeQuestPage?.anchor) {
      const targetAnchor = activeQuestPage.anchor;
      const timer = window.setTimeout(() => scrollToSection(targetAnchor), 120);
      return () => window.clearTimeout(timer);
    }
  }, [loading, questData, activeQuestPage?.anchor, scrollToSection]);

  // 全局搜索：同时检索全部常规/主线/迦勒底之门/特殊关卡与活动关卡
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const matchedStaticQuests = useMemo(() => {
    if (!trimmedQuery) return [];
    const tokens = trimmedQuery.split(/\s+/).filter(Boolean);
    return ALL_STATIC_QUESTS.filter((item) => {
      const hay = `${item.groupLabel} ${item.label} ${item.sub || ''} ${item.pageTitle} ${item.keywords || ''}`.toLowerCase();
      return tokens.every((tk) => hay.includes(tk));
    });
  }, [trimmedQuery]);

  // -------------------- Level 3+: 具体关卡配置详情页 --------------------
  if (activeQuestPage) {
    const rawSections = (questData?.sections || []).filter(
      (s) =>
        s.line &&
        !s.line.includes('注释') &&
        !s.line.includes('链接') &&
        !s.line.includes('参考')
    );
    const lv2Sections = rawSections.filter((s) => Number(s.level) === 2);
    const lv3Sections = rawSections.filter((s) => Number(s.level) === 3);
    // 若只有 1 个二级总标题（如亚兹拉尔之庙的「地狱的试炼关卡」）且存在三级具体关卡，优先展示三级关卡胶囊方便直达
    const tocSections = lv2Sections.length <= 1 && lv3Sections.length > 0 ? lv3Sections : lv2Sections;

    const handleWikiContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const navEl = target.closest('[data-mc-page], [data-mc-anchor]') as HTMLElement | null;
      if (!navEl) return;

      const targetPage = (navEl.getAttribute('data-mc-page') || '').trim();
      const targetAnchor = (navEl.getAttribute('data-mc-anchor') || '').trim();

      if (targetPage) {
        e.preventDefault();
        if (isNavigableQuestWikiPage(targetPage)) {
          const displayLabel = targetAnchor
            ? `${targetPage.replace(/\/(关卡配置|从者任务)$/, '')} · ${targetAnchor}`
            : targetPage.replace(/\/关卡配置$/, '');
          openQuestPage(displayLabel, targetPage, targetAnchor || undefined, true);
        }
        return;
      }

      if (targetAnchor) {
        e.preventDefault();
        scrollToSection(targetAnchor);
      }
    };

    return (
      <div className="quest-drill-view" ref={pageContainerRef}>
        <div className="quest-drill-topbar">
          <button
            type="button"
            className="quest-back-btn"
            onClick={handleBackFromQuestPage}
          >
            <ChevronLeft size={18} />
            <span>{questPageStack.length > 1 ? '返回上一页' : '返回上一级'}</span>
          </button>
          <strong className="quest-drill-title">{activeQuestPage.label}</strong>
          <button
            type="button"
            className="btn-lang-switch"
            onClick={() => void fetchAndShowQuestPage(activeQuestPage, true)}
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'spin-icon' : ''} /> 刷新
          </button>
        </div>

        <div className="detail-tab-pane">
          {loading ? (
            <div className="detail-loading">
              <div className="spinner" />
              <span>正在拉取「{activeQuestPage.label}」关卡配置并离线缓存...</span>
            </div>
          ) : error ? (
            <div className="empty-state">
              <AlertCircle size={32} />
              <p>{error}</p>
            </div>
          ) : questData ? (
            <>
              {tocSections.length > 0 && (
                <div className="quest-toc-bar">
                  {tocSections.map((sec) => (
                    <button
                      key={sec.index + sec.anchor}
                      type="button"
                      className="quest-toc-pill"
                      onClick={() => scrollToSection(sec.anchor)}
                    >
                      {sec.line}
                    </button>
                  ))}
                </div>
              )}
              <div
                className="mc-wiki-rendered-html"
                onClick={handleWikiContainerClick}
                dangerouslySetInnerHTML={{ __html: questData.html }}
              />
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // -------------------- 全局搜索结果视图（搜索框有输入且未在具体配置页时，支持搜索全部关卡） --------------------
  if (trimmedQuery && activeCat !== 'events') {
    const nowSec = Math.floor(Date.now() / 1000);
    const fmtD = (ts: number) => {
      if (!ts) return '';
      const d = new Date(ts * 1000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
    };

    const totalFound = matchedStaticQuests.length + events.length;

    return (
      <div className="quest-drill-view">
        <div className="quest-search-summary-bar">
          <span>
            全站关卡搜索 “{searchQuery.trim()}”：共匹配 <strong>{totalFound}</strong> 项
          </span>
        </div>

        {totalFound === 0 ? (
          <div className="empty-state">
            <p>未找到与「{searchQuery.trim()}」匹配的关卡配置</p>
          </div>
        ) : (
          <>
            {matchedStaticQuests.length > 0 && (
              <div className="quest-search-group">
                <div className="quest-search-group-title">
                  主线 / 迦勒底之门 / 特殊挑战（{matchedStaticQuests.length}）
                </div>
                <div className="quest-option-list">
                  {matchedStaticQuests.map((item, idx) => (
                    <button
                      key={`${item.groupLabel}-${item.pageTitle}-${idx}`}
                      type="button"
                      className="quest-option-row"
                      onClick={() => openQuestPage(item.label, item.pageTitle)}
                    >
                      <span className="quest-search-cat-pill">{item.groupLabel}</span>
                      <div className="quest-option-text">
                        <strong>{item.label}</strong>
                        {item.sub && <small>{item.sub}</small>}
                      </div>
                      <ChevronRight size={18} className="quest-option-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {events.length > 0 && (
              <div className="quest-search-group">
                <div className="quest-search-group-title">
                  活动关卡（{events.length}）
                </div>
                <div className="event-catalog-grid">
                  {events.slice(0, 80).map((ev) => {
                    const cnLive = ev.startCn > 0 && ev.startCn <= nowSec && ev.endCn >= nowSec;
                    const jpLive = ev.startJp > 0 && ev.startJp <= nowSec && ev.endJp >= nowSec;
                    const isFuture = (ev.startCn === 0 && ev.startJp > 0) || ev.startCn > nowSec;
                    const statusLabel = cnLive
                      ? '国服进行中'
                      : jpLive
                      ? '日服进行中'
                      : isFuture
                      ? '国服未来视'
                      : '已结束';
                    const statusCls = cnLive
                      ? 'status-cn-live'
                      : jpLive
                      ? 'status-jp-live'
                      : isFuture
                      ? 'status-future'
                      : 'status-ended';
                    return (
                      <button
                        key={ev.title}
                        type="button"
                        className="event-catalog-card"
                        onClick={() => onOpenEventDetail(ev)}
                      >
                        {ev.bannerThumb && (
                          <SmartImage
                            localSrc={ev.bannerThumb}
                            remoteSrc={ev.bannerFull}
                            alt={ev.nameCn}
                            className="event-card-banner"
                          />
                        )}
                        <div className="event-card-body">
                          <div className="banner-badges-row">
                            <span className={`event-status-badge ${statusCls}`}>{statusLabel}</span>
                            <span className="event-type-tag">
                              {ev.type === 'Event' ? '大型活动' : '纪念活动'}
                            </span>
                            <span className="event-quest-hint">查关卡配置 →</span>
                          </div>
                          <strong className="event-card-title">{ev.nameCn}</strong>
                          <div className="event-card-dates">
                            {ev.startCn > 0 && (
                              <span>
                                国服：{fmtD(ev.startCn)} ～ {fmtD(ev.endCn)}
                              </span>
                            )}
                            {ev.startJp > 0 && (
                              <span>
                                日服：{fmtD(ev.startJp)} ～ {fmtD(ev.endJp)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // -------------------- Level 2: 主线剧情 -> 某一部下的章节选项列表 --------------------
  if (activeCat === 'main_story' && activeStoryPartId) {
    const part = MAIN_STORY_PARTS.find((p) => p.id === activeStoryPartId);
    if (part) {
      return (
        <div className="quest-drill-view">
          <div className="quest-drill-topbar">
            <button
              type="button"
              className="quest-back-btn"
              onClick={handleBackFromStoryPart}
            >
              <ChevronLeft size={18} />
              <span>返回主线分部</span>
            </button>
            <strong className="quest-drill-title">{part.title}</strong>
          </div>

          <div className="quest-option-list">
            {part.chapters.map((chap, idx) => (
              <button
                key={chap.pageTitle}
                type="button"
                className="quest-option-row"
                onClick={() => openQuestPage(chap.label, chap.pageTitle)}
              >
                <span className="quest-option-index">{idx + 1}</span>
                <div className="quest-option-text">
                  <strong>{chap.label}</strong>
                  <small>点击查看主线 / 自由关卡配置</small>
                </div>
                <ChevronRight size={18} className="quest-option-arrow" />
              </button>
            ))}
          </div>
        </div>
      );
    }
  }

  // -------------------- Level 1: 各大分类子选项页 --------------------
  if (activeCat === 'main_story') {
    return (
      <div className="quest-drill-view">
        <div className="quest-drill-topbar">
          <button type="button" className="quest-back-btn" onClick={handleBackFromCategory}>
            <ChevronLeft size={18} />
            <span>返回关卡配置</span>
          </button>
          <strong className="quest-drill-title">主线剧情（请选择分部）</strong>
        </div>

        <div className="quest-option-list">
          {MAIN_STORY_PARTS.map((part, idx) => (
            <button
              key={part.id}
              type="button"
              className="quest-option-row"
              onClick={() => setActiveStoryPartId(part.id)}
            >
              <span className="quest-option-index">{idx + 1}</span>
              <div className="quest-option-text">
                <strong>{part.title}</strong>
                <small>{part.subtitle}</small>
              </div>
              <ChevronRight size={18} className="quest-option-arrow" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (
    activeCat === 'chaldea_gate' ||
    activeCat === 'grand_battle' ||
    activeCat === 'main_interlude'
  ) {
    const cfg =
      activeCat === 'chaldea_gate'
        ? { title: '迦勒底之门（各关卡配置）', items: CHALDEA_GATE_ITEMS }
        : activeCat === 'grand_battle'
        ? { title: '冠位戴冠战', items: GRAND_BATTLE_ITEMS }
        : { title: '主线物语（Main Interlude）', items: MAIN_INTERLUDE_ITEMS };

    return (
      <div className="quest-drill-view">
        <div className="quest-drill-topbar">
          <button type="button" className="quest-back-btn" onClick={handleBackFromCategory}>
            <ChevronLeft size={18} />
            <span>返回关卡配置</span>
          </button>
          <strong className="quest-drill-title">{cfg.title}</strong>
        </div>

        <div className="quest-option-list">
          {cfg.items.map((item, idx) => (
            <button
              key={item.pageTitle}
              type="button"
              className="quest-option-row"
              onClick={() => openQuestPage(item.label, item.pageTitle)}
            >
              <span className="quest-option-index">{idx + 1}</span>
              <div className="quest-option-text">
                <strong>{item.label}</strong>
                {item.sub && <small>{item.sub}</small>}
              </div>
              <ChevronRight size={18} className="quest-option-arrow" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (activeCat === 'events') {
    const nowSec = Math.floor(Date.now() / 1000);
    const fmtD = (ts: number) => {
      if (!ts) return '';
      const d = new Date(ts * 1000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
    };

    return (
      <div className="quest-drill-view">
        <div className="quest-drill-topbar">
          <button type="button" className="quest-back-btn" onClick={handleBackFromCategory}>
            <ChevronLeft size={18} />
            <span>返回关卡配置</span>
          </button>
          <strong className="quest-drill-title">活动关卡（共 {events.length} 项）</strong>
        </div>

        <div className="ce-pills-scroll" style={{ padding: '4px 0 10px' }}>
          {(
            [
              { k: 'all', l: '全部活动' },
              { k: 'live', l: '国/日服进行中' },
              { k: 'future', l: '国服未来视' },
              { k: 'Event', l: '大型活动' },
              { k: 'Campaign', l: '纪念活动' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.k}
              type="button"
              className={`filter-chip filter-chip-sm ${eventFilter === opt.k ? 'active' : ''}`}
              onClick={() => onChangeEventFilter(opt.k)}
            >
              {opt.l}
            </button>
          ))}
        </div>

        {events.length === 0 ? (
          <div className="empty-state">
            <p>未找到符合条件的活动</p>
          </div>
        ) : (
          <div className="event-catalog-grid">
            {events.slice(0, 120).map((ev) => {
              const cnLive = ev.startCn > 0 && ev.startCn <= nowSec && ev.endCn >= nowSec;
              const jpLive = ev.startJp > 0 && ev.startJp <= nowSec && ev.endJp >= nowSec;
              const isFuture = (ev.startCn === 0 && ev.startJp > 0) || ev.startCn > nowSec;
              const statusLabel = cnLive
                ? '国服进行中'
                : jpLive
                ? '日服进行中'
                : isFuture
                ? '国服未来视'
                : '已结束';
              const statusCls = cnLive
                ? 'status-cn-live'
                : jpLive
                ? 'status-jp-live'
                : isFuture
                ? 'status-future'
                : 'status-ended';
              return (
                <button
                  key={ev.title}
                  type="button"
                  className="event-catalog-card"
                  onClick={() => onOpenEventDetail(ev)}
                >
                  {ev.bannerThumb && (
                    <SmartImage
                      localSrc={ev.bannerThumb}
                      remoteSrc={ev.bannerFull}
                      alt={ev.nameCn}
                      className="event-card-banner"
                    />
                  )}
                  <div className="event-card-body">
                    <div className="banner-badges-row">
                      <span className={`event-status-badge ${statusCls}`}>{statusLabel}</span>
                      <span className="event-type-tag">
                        {ev.type === 'Event' ? '大型活动' : '纪念活动'}
                      </span>
                      <span className="event-quest-hint">查关卡配置 →</span>
                    </div>
                    <strong className="event-card-title">{ev.nameCn}</strong>
                    <div className="event-card-dates">
                      {ev.startCn > 0 && (
                        <span>
                          国服：{fmtD(ev.startCn)} ～ {fmtD(ev.endCn)}
                        </span>
                      )}
                      {ev.startJp > 0 && (
                        <span>
                          日服：{fmtD(ev.startJp)} ～ {fmtD(ev.endJp)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // -------------------- Level 0: 关卡配置首页（6 大分类） --------------------
  const hubCards: {
    key: CategoryKey;
    title: string;
    desc: string;
    badge: string;
    accent: string;
    icon: React.ReactNode;
    directPage?: string;
  }[] = [
    {
      key: 'events',
      title: '活动关卡',
      desc: '国服 / 日服进行中、未来视及历届限时活动与高难配置',
      badge: `${events.length} 个活动`,
      accent: 'hub-blue',
      icon: <Swords size={22} />,
    },
    {
      key: 'chaldea_gate',
      title: '迦勒底之门',
      desc: '每日任务、进阶关卡、强化任务、幕间物语、魔术礼装与纪念本',
      badge: `${CHALDEA_GATE_ITEMS.length} 类配置`,
      accent: 'hub-teal',
      icon: <DoorOpen size={22} />,
    },
    {
      key: 'main_story',
      title: '主线剧情',
      desc: '第1部特异点 · 第1.5部断章 · 第2部异闻带 · 奏章 · 终章',
      badge: '6 大篇章',
      accent: 'hub-indigo',
      icon: <BookOpen size={22} />,
    },
    {
      key: 'grand_battle',
      title: '冠位戴冠战',
      desc: 'Saber / Berserker / Lancer / Extra 等八大职阶冠位战',
      badge: '8 职阶',
      accent: 'hub-amber',
      icon: <Crown size={22} />,
    },
    {
      key: 'azrael',
      title: '亚兹拉尔之庙',
      desc: '地狱之试炼 · 最新挑战关卡优先展示',
      badge: '特殊挑战',
      accent: 'hub-rose',
      icon: <Flame size={22} />,
      directPage: '亚兹拉尔之庙',
    },
    {
      key: 'main_interlude',
      title: '主线物语',
      desc: 'SE.RA.PH · 冥界圣诞 · 大奥 · 虚数大海战等复刻主线',
      badge: '8 部物语',
      accent: 'hub-purple',
      icon: <ScrollText size={22} />,
    },
  ];

  return (
    <div className="quest-hub-home">
      <div className="quest-hub-grid">
        {hubCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`quest-hub-card ${card.accent}`}
            onClick={() => {
              if (card.directPage) {
                setActiveCat(card.key);
                openQuestPage(card.title, card.directPage);
              } else {
                setActiveCat(card.key);
              }
            }}
          >
            <div className="quest-hub-card-top">
              <div className="quest-hub-icon">{card.icon}</div>
              <span className="quest-hub-badge">{card.badge}</span>
            </div>
            <strong className="quest-hub-title">{card.title}</strong>
            <p className="quest-hub-desc">{card.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
