import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar,
  Sparkles,
  X,
  RefreshCw,
  Swords,
  Info,
  ExternalLink,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  EventSummary,
  BannerSummary,
  EventQuestConfigData,
  ServantSummary,
  CraftEssenceSummary,
} from '../types';
import { loadEventQuestConfig } from '../services/dataService';
import { SmartImage } from './SmartImage';
import { BackToTopButton } from './BackToTopButton';
import { useBackClose } from '../utils/backNavigation';

function fmtDate(ts: number): string {
  if (!ts) return '待定';
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getStatusTag(
  startCn: number,
  endCn: number,
  startJp: number,
  endJp: number,
  nowSec: number
): { label: string; cls: string } {
  if (startCn > 0 && startCn <= nowSec && endCn >= nowSec) {
    return { label: '国服进行中', cls: 'status-cn-live' };
  }
  if (startJp > 0 && startJp <= nowSec && endJp >= nowSec) {
    return { label: '日服进行中', cls: 'status-jp-live' };
  }
  if (startCn === 0 && startJp > 0) {
    return { label: '国服未来视', cls: 'status-future' };
  }
  if (startCn > nowSec) {
    return { label: '国服即将开启', cls: 'status-future' };
  }
  return { label: '已结束', cls: 'status-ended' };
}

/* ========================= 活动详情 & 活动关卡配置弹窗 ========================= */

interface EventDetailModalProps {
  event: EventSummary | null;
  onClose: () => void;
  allBanners: BannerSummary[];
  servantByTitle: Map<string, ServantSummary>;
  ceByTitle: Map<string, CraftEssenceSummary>;
  onOpenServant: (id: number) => void;
  onOpenCe: (id: number) => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  onClose,
  allBanners,
  servantByTitle,
  ceByTitle,
  onOpenServant,
  onOpenCe,
}) => {
  const [tab, setTab] = useState<'quests' | 'overview'>('quests');
  const [questData, setQuestData] = useState<EventQuestConfigData | null>(null);
  const [questLoading, setQuestLoading] = useState(false);
  const [questError, setQuestError] = useState('');
  const contentRef = useRef<HTMLDivElement | null>(null);

  useBackClose(Boolean(event), onClose);

  const relatedBanners = useMemo(() => {
    if (!event) return [];
    const key = event.title.split('～')[0].replace(/复刻：|轻量版/g, '').trim();
    if (!key) return [];
    return allBanners
      .filter(
        (b) =>
          b.title.includes(key) ||
          b.titleCn.includes(key) ||
          (event.startJp > 0 && Math.abs(b.startJp - event.startJp) < 86400 * 14 && b.title.slice(0, 4) === event.title.slice(0, 4))
      )
      .slice(0, 8);
  }, [event, allBanners]);

  const fetchConfig = async (title: string, force = false) => {
    setQuestLoading(true);
    setQuestError('');
    try {
      const data = await loadEventQuestConfig(title, force);
      setQuestData(data);
    } catch (err: any) {
      setQuestError(err?.message || '加载关卡配置失败');
      setQuestData(null);
    } finally {
      setQuestLoading(false);
    }
  };

  useEffect(() => {
    if (!event) {
      setQuestData(null);
      setQuestError('');
      return;
    }
    setTab('quests');
    fetchConfig(event.title, false);
  }, [event?.title]);

  const scrollToSection = (anchor: string) => {
    if (!contentRef.current) return;
    const el = contentRef.current.querySelector(`[id="${CSS.escape(anchor)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!event) return null;

  return (
    <div className="modal-backdrop detail-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="detail-header">
          <div className="detail-header-left">
            <div>
              <div className="detail-no-row">
                <span className="detail-method-tag">
                  {event.type === 'Event' ? '大型活动' : '纪念活动'}
                </span>
                {event.startCn > 0 && (
                  <span className="detail-no">
                    国服 {fmtDate(event.startCn)} ~ {fmtDate(event.endCn)}
                  </span>
                )}
              </div>
              <h2 className="detail-name-cn">{event.nameCn}</h2>
              {event.nameJp && event.nameJp !== event.nameCn && (
                <div className="detail-name-sub">{event.nameJp}</div>
              )}
            </div>
          </div>
          <button type="button" className="btn-icon-close" onClick={onClose} aria-label="关闭">
            <X size={22} />
          </button>
        </header>

        <div className="detail-scroll-body" ref={contentRef}>
          {event.bannerThumb && (
            <div className="event-detail-banner-wrap">
              <SmartImage
                localSrc={event.bannerThumb}
                remoteSrc={event.bannerFull}
                alt={event.nameCn}
                className="event-detail-banner-img"
              />
            </div>
          )}

          {/* 顶部单行 Tab：活动关卡配置 vs 活动概览与关联卡池 */}
          <div className="detail-nav-tabs" style={{ marginTop: 10 }}>
            <button
              type="button"
              className={`detail-nav-tab ${tab === 'quests' ? 'active' : ''}`}
              onClick={() => setTab('quests')}
            >
              <Swords size={15} />
              <span>活动关卡与配置</span>
            </button>
            <button
              type="button"
              className={`detail-nav-tab ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => setTab('overview')}
            >
              <Info size={15} />
              <span>活动信息与关联卡池 ({relatedBanners.length})</span>
            </button>
          </div>

          {tab === 'quests' ? (
            <div className="detail-tab-pane">
              <div className="lore-header-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <h3 className="pane-section-title" style={{ margin: 0 }}>
                  {questData?.isSubpage ? '活动关卡配置（/关卡配置）' : '活动页面与关卡信息'}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {questData?.fetchedAt && (
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      已缓存：{questData.fetchedAt}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn-lang-switch"
                    onClick={() => fetchConfig(event.title, true)}
                    disabled={questLoading}
                  >
                    <RefreshCw
                      size={12}
                      className={questLoading ? 'spin-icon' : ''}
                      style={{ verticalAlign: 'middle', marginRight: 4 }}
                    />
                    刷新配置
                  </button>
                </div>
              </div>

              {questLoading ? (
                <div className="detail-loading">
                  <div className="spinner" />
                  <span>正在从 Mooncell 拉取该活动关卡配置并缓存到本地...</span>
                </div>
              ) : questError ? (
                <div className="empty-state">
                  <AlertCircle size={32} />
                  <p>{questError}</p>
                  <a
                    href={`https://fgo.wiki/w/${encodeURIComponent(event.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-toolbar active"
                    style={{ textDecoration: 'none' }}
                  >
                    <ExternalLink size={14} />
                    <span>前往 Mooncell 原页面查看</span>
                  </a>
                </div>
              ) : questData ? (
                <>
                  {/* 关卡目录快捷跳转：仅保留主线、自由(Free)、高难等顶级大类区分 */}
                  {questData.sections.filter(
                    (s) =>
                      Number(s.level) === 2 &&
                      s.line &&
                      !s.line.includes('注释') &&
                      !s.line.includes('链接') &&
                      !s.line.includes('参考')
                  ).length > 0 && (
                    <div className="quest-toc-bar">
                      {questData.sections
                        .filter(
                          (s) =>
                            Number(s.level) === 2 &&
                            s.line &&
                            !s.line.includes('注释') &&
                            !s.line.includes('链接') &&
                            !s.line.includes('参考')
                        )
                        .map((sec) => (
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

                  {/* Mooncell 渲染后的关卡配置 HTML 容器（屏蔽外部链接跳转与错位面包屑） */}
                  <div
                    className="mc-wiki-rendered-html"
                    onClick={(e) => {
                      const anchor = (e.target as HTMLElement).closest('a');
                      if (anchor) e.preventDefault();
                    }}
                    dangerouslySetInnerHTML={{ __html: questData.html }}
                  />
                </>
              ) : null}
            </div>
          ) : (
            <div className="detail-tab-pane">
              <h3 className="pane-section-title">活动排期</h3>
              <div className="quick-stat-cards" style={{ marginBottom: 14 }}>
                <div className="q-stat-box">
                  <span className="q-stat-label">国服时间</span>
                  <strong className="q-stat-val">
                    {event.startCn > 0
                      ? `${fmtDate(event.startCn)} ～ ${fmtDate(event.endCn)}`
                      : '国服尚未实装（未来视）'}
                  </strong>
                </div>
                <div className="q-stat-box">
                  <span className="q-stat-label">日服时间</span>
                  <strong className="q-stat-val">
                    {event.startJp > 0
                      ? `${fmtDate(event.startJp)} ～ ${fmtDate(event.endJp)}`
                      : '—'}
                  </strong>
                </div>
              </div>

              <h3 className="pane-section-title">关联推荐召唤卡池</h3>
              {relatedBanners.length === 0 ? (
                <div className="mc-empty-hint">暂未匹配到关联卡池，可在「卡池」标签页直接搜索查看</div>
              ) : (
                <div className="banner-list-grid">
                  {relatedBanners.map((b) => (
                    <BannerCard
                      key={b.title}
                      banner={b}
                      servantByTitle={servantByTitle}
                      ceByTitle={ceByTitle}
                      onOpenServant={(id) => {
                        onClose();
                        onOpenServant(id);
                      }}
                      onOpenCe={(id) => {
                        onClose();
                        onOpenCe(id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <BackToTopButton targetRef={contentRef} variant="modal" />
      </div>
    </div>
  );
};

/* ========================= 卡池卡片组件（带 UP 从者/礼装头像跳转） ========================= */

interface BannerCardProps {
  banner: BannerSummary;
  servantByTitle: Map<string, ServantSummary>;
  ceByTitle: Map<string, CraftEssenceSummary>;
  onOpenServant: (id: number) => void;
  onOpenCe: (id: number) => void;
}

export const BannerCard: React.FC<BannerCardProps> = ({
  banner,
  servantByTitle,
  ceByTitle,
  onOpenServant,
  onOpenCe,
}) => {
  const [expandSvts, setExpandSvts] = useState(false);
  const [expandCes, setExpandCes] = useState(false);
  const nowSec = Math.floor(Date.now() / 1000);
  const status = getStatusTag(banner.startCn, banner.endCn, banner.startJp, banner.endJp, nowSec);
  const visibleSvts = expandSvts ? banner.servants : banner.servants.slice(0, 16);
  const visibleCes = expandCes ? banner.ces : banner.ces.slice(0, 10);

  return (
    <div className="banner-card">
      <div className="banner-card-top">
        {banner.bannerThumb && (
          <SmartImage
            localSrc={banner.bannerThumb}
            remoteSrc={banner.bannerFull}
            alt={banner.titleCn}
            className="banner-cover-img"
          />
        )}
        <div className="banner-head-info">
          <div className="banner-badges-row">
            <span className={`event-status-badge ${status.cls}`}>{status.label}</span>
            {banner.luckybag && <span className="event-status-badge status-lucky">福袋召唤</span>}
          </div>
          <h4 className="banner-title">{banner.titleCn}</h4>
          <div className="banner-dates">
            {banner.startCn > 0 && (
              <span>
                <Clock size={11} /> 国服：{fmtDate(banner.startCn)} ～ {fmtDate(banner.endCn)}
              </span>
            )}
            {banner.startJp > 0 && (
              <span>
                <Calendar size={11} /> 日服：{fmtDate(banner.startJp)} ～ {fmtDate(banner.endJp)}
              </span>
            )}
          </div>
        </div>
      </div>

      {banner.servants.length > 0 && (
        <div className="banner-up-section">
          <div className="banner-up-label">
            推荐召唤从者（共 {banner.servants.length} 骑，点击头像查详情）：
          </div>
          <div className="banner-up-avatars">
            {visibleSvts.map((svtTitle) => {
              const svt = servantByTitle.get(svtTitle);
              return svt ? (
                <button
                  key={svtTitle}
                  type="button"
                  className="banner-avatar-btn"
                  onClick={() => onOpenServant(svt.id)}
                  title={`${svt.nameCn} (${svt.className})`}
                >
                  <SmartImage
                    localSrc={svt.iconLocal}
                    remoteSrc={svt.iconRemote}
                    alt={svt.nameCn}
                    className="banner-mini-avatar"
                  />
                  <span>{svt.nameCn}</span>
                </button>
              ) : (
                <span key={svtTitle} className="banner-text-pill">
                  {svtTitle}
                </span>
              );
            })}
            {banner.servants.length > 16 && (
              <button
                type="button"
                className="banner-expand-btn"
                onClick={() => setExpandSvts((v) => !v)}
              >
                {expandSvts ? '收起 ▲' : `+${banner.servants.length - 16} 骑\n点击展开`}
              </button>
            )}
          </div>
        </div>
      )}

      {banner.ces.length > 0 && (
        <div className="banner-up-section">
          <div className="banner-up-label">
            <Sparkles size={11} /> 推荐召唤礼装（共 {banner.ces.length} 张）：
          </div>
          <div className="banner-up-avatars">
            {visibleCes.map((ceTitle) => {
              const ce = ceByTitle.get(ceTitle);
              return ce ? (
                <button
                  key={ceTitle}
                  type="button"
                  className="banner-avatar-btn"
                  onClick={() => onOpenCe(ce.id)}
                  title={ce.nameCn}
                >
                  <SmartImage
                    localSrc={ce.iconLocal}
                    remoteSrc={ce.iconRemote}
                    alt={ce.nameCn}
                    className="banner-mini-avatar"
                  />
                  <span>{ce.nameCn}</span>
                </button>
              ) : (
                <span key={ceTitle} className="banner-text-pill">
                  {ceTitle}
                </span>
              );
            })}
            {banner.ces.length > 10 && (
              <button
                type="button"
                className="banner-expand-btn"
                onClick={() => setExpandCes((v) => !v)}
              >
                {expandCes ? '收起 ▲' : `+${banner.ces.length - 10} 张\n点击展开`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


/* ========================= 主线剧情关卡配置独立弹窗 ========================= */

interface MainStoryChapter {
  shortName: string;
  pageTitle: string;
}

const MAIN_STORY_PARTS: { part: string; chapters: MainStoryChapter[] }[] = [
  {
    part: '第1部（特异点）',
    chapters: [
      { shortName: '特异点F 冬木', pageTitle: '特异点F 燃烧污染都市 冬木' },
      { shortName: '第一特异点 奥尔良', pageTitle: '第一特异点 邪龙百年战争 奥尔良' },
      { shortName: '第二特异点 七丘之城', pageTitle: '第二特异点 永续疯狂帝国 七丘之城' },
      { shortName: '第三特异点 俄刻阿诺斯', pageTitle: '第三特异点 封锁终局四海 俄刻阿诺斯' },
      { shortName: '第四特异点 伦敦', pageTitle: '第四特异点 死界魔雾都市 伦敦' },
      { shortName: '第五特异点 合众为一', pageTitle: '第五特异点 北美神话大战 合众为一' },
      { shortName: '第六特异点 卡美洛', pageTitle: '第六特异点 神圣圆桌领域 卡美洛' },
      { shortName: '第七特异点 巴比伦尼亚', pageTitle: '第七特异点 绝对魔兽战线 巴比伦尼亚' },
      { shortName: '终局特异点 所罗门', pageTitle: '终局特异点 冠位时间神殿 所罗门' },
    ],
  },
  {
    part: '第1.5部（亚种特异点）',
    chapters: [
      { shortName: '亚种Ⅰ 新宿', pageTitle: '亚种特异点Ⅰ 恶性隔绝魔境 新宿' },
      { shortName: '亚种Ⅱ 雅戈泰', pageTitle: '亚种特异点Ⅱ 传承地底世界 雅戈泰' },
      { shortName: '亚种Ⅲ 下总国', pageTitle: '亚种特异点Ⅲ 尸山血河舞台 下总国' },
      { shortName: '亚种Ⅳ 塞勒姆', pageTitle: '亚种特异点Ⅳ 禁忌降临庭园 塞勒姆' },
    ],
  },
  {
    part: '第2部（异闻带）',
    chapters: [
      { shortName: '2.1 永久冻土帝国', pageTitle: 'Lostbelt No.1 永久冻土帝国 阿纳斯塔西娅' },
      { shortName: '2.2 诸神黄昏', pageTitle: 'Lostbelt No.2 无间冰焰世纪 诸神黄昏' },
      { shortName: '2.3 人智统合真国', pageTitle: 'Lostbelt No.3 人智统合真国 SIN' },
      { shortName: '2.4 由伽·刹多罗', pageTitle: 'Lostbelt No.4 创世灭亡轮回 由伽·刹多罗' },
      { shortName: '2.5 亚特兰蒂斯', pageTitle: 'Lostbelt No.5 神代巨神海洋 亚特兰蒂斯' },
      { shortName: '2.5 奥林波斯', pageTitle: 'Lostbelt No.5 星间都市山脉 奥林波斯' },
      { shortName: '2.55 地狱界平安京', pageTitle: '地狱界曼荼罗 平安京' },
      { shortName: '2.6 阿瓦隆·勒·菲', pageTitle: 'Lostbelt No.6 妖精圆桌领域 阿瓦隆·勒·菲' },
      { shortName: '2.6 后篇', pageTitle: 'Lostbelt No.6 妖精圆桌领域 阿瓦隆·勒·菲(后篇)' },
      { shortName: '2.65 通古斯卡·圣域', pageTitle: '非灵长生存圈 通古斯卡·圣域(主线)' },
      { shortName: '2.65 死想显现界域 Traum', pageTitle: '死想显现界域 Traum' },
      { shortName: '2.7 纳维·米克特兰', pageTitle: 'Lostbelt No.7 黄金树海纪行 纳维·米克特兰' },
      { shortName: '2.7 后篇', pageTitle: 'Lostbelt No.7 黄金树海纪行 纳维·米克特兰(后篇)' },
    ],
  },
  {
    part: '奏章（Ordeal Call）',
    chapters: [
      { shortName: '奏章序幕', pageTitle: '奏章序幕' },
      { shortName: '奏章Ⅰ 平面之月', pageTitle: '奏章Ⅰ 虚数罗针内界 平面之月' },
      { shortName: '奏章Ⅱ 不可逆废弃孔 伊底', pageTitle: '奏章Ⅱ 不可逆废弃孔 伊底' },
      { shortName: '奏章Ⅲ 原型肇始', pageTitle: '奏章Ⅲ 新灵长后继战 原型肇始' },
      { shortName: '奏章Ⅳ 人类裁决法庭', pageTitle: '奏章Ⅳ 人类裁决法庭 三位一体·梅塔特洛尼俄斯' },
      { shortName: '终章 序', pageTitle: '终章 序' },
    ],
  },
];

interface MainStoryQuestModalProps {
  open: boolean;
  onClose: () => void;
}

export const MainStoryQuestModal: React.FC<MainStoryQuestModalProps> = ({ open, onClose }) => {
  const [partIdx, setPartIdx] = useState(0);
  const [selectedChapter, setSelectedChapter] = useState<MainStoryChapter>(
    MAIN_STORY_PARTS[0].chapters[0]
  );
  const [questData, setQuestData] = useState<EventQuestConfigData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useBackClose(open, onClose);

  const loadChapter = async (chap: MainStoryChapter, force = false) => {
    setSelectedChapter(chap);
    setLoading(true);
    setError('');
    try {
      const data = await loadEventQuestConfig(chap.pageTitle, force);
      setQuestData(data);
      scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err: any) {
      setError(err?.message || '加载主线关卡配置失败');
      setQuestData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadChapter(selectedChapter, false);
    }
  }, [open]);

  const scrollToSection = (anchor: string) => {
    if (!scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[id="${CSS.escape(anchor)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!open) return null;

  const topSections = (questData?.sections || []).filter(
    (s) =>
      Number(s.level) === 2 &&
      s.line &&
      !s.line.includes('注释') &&
      !s.line.includes('链接') &&
      !s.line.includes('参考')
  );

  return (
    <div className="modal-backdrop detail-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="detail-header">
          <div className="detail-header-left">
            <div>
              <div className="detail-no-row">
                <span className="detail-method-tag">主线剧情</span>
                <span className="detail-no">{MAIN_STORY_PARTS[partIdx].part}</span>
              </div>
              <h2 className="detail-name-cn">主线关卡配置：{selectedChapter.shortName}</h2>
            </div>
          </div>
          <button type="button" className="btn-icon-close" onClick={onClose} aria-label="关闭">
            <X size={22} />
          </button>
        </header>

        <div className="detail-scroll-body" ref={scrollRef}>
          {/* 部/篇切换栏（单行不换行） */}
          <div className="mc-stage-tabs" style={{ marginBottom: 8 }}>
            {MAIN_STORY_PARTS.map((p, idx) => (
              <button
                key={p.part}
                type="button"
                className={`mc-stage-tab ${idx === partIdx ? 'active' : ''}`}
                onClick={() => setPartIdx(idx)}
              >
                {p.part}
              </button>
            ))}
          </div>

          {/* 当前部下的章节选择按钮 */}
          <div className="mainstory-chapter-grid">
            {MAIN_STORY_PARTS[partIdx].chapters.map((chap) => {
              const active = chap.pageTitle === selectedChapter.pageTitle;
              return (
                <button
                  key={chap.pageTitle}
                  type="button"
                  className={`filter-chip filter-chip-sm ${active ? 'active' : ''}`}
                  onClick={() => loadChapter(chap, false)}
                >
                  {chap.shortName}
                </button>
              );
            })}
          </div>

          <div className="detail-tab-pane" style={{ marginTop: 10 }}>
            <div className="lore-header-row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <h3 className="pane-section-title" style={{ margin: 0 }}>
                {selectedChapter.pageTitle}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {questData?.fetchedAt && (
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    已缓存：{questData.fetchedAt}
                  </span>
                )}
                <button
                  type="button"
                  className="btn-lang-switch"
                  onClick={() => loadChapter(selectedChapter, true)}
                  disabled={loading}
                >
                  <RefreshCw
                    size={12}
                    className={loading ? 'spin-icon' : ''}
                    style={{ verticalAlign: 'middle', marginRight: 4 }}
                  />
                  刷新配置
                </button>
              </div>
            </div>

            {loading ? (
              <div className="detail-loading">
                <div className="spinner" />
                <span>正在拉取「{selectedChapter.shortName}」主线关卡配置并缓存到本地...</span>
              </div>
            ) : error ? (
              <div className="empty-state">
                <AlertCircle size={32} />
                <p>{error}</p>
              </div>
            ) : questData ? (
              <>
                {topSections.length > 0 && (
                  <div className="quest-toc-bar">
                    {topSections.map((sec) => (
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
                  onClick={(e) => {
                    const anchor = (e.target as HTMLElement).closest('a');
                    if (anchor) e.preventDefault();
                  }}
                  dangerouslySetInnerHTML={{ __html: questData.html }}
                />
              </>
            ) : null}
          </div>
        </div>
        <BackToTopButton targetRef={scrollRef} variant="modal" />
      </div>
    </div>
  );
};
