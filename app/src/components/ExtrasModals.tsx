import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Maximize2,
  User,
  ArrowUpDown,
  MapPin,
  Flame,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { MysticCode, CostumeItem, GameItem } from '../types';
import { SmartImage } from './SmartImage';
import { FormattedEffectText } from './SkillAndNpTables';
import { CardLightbox } from './CardLightbox';
import { BackToTopButton } from './BackToTopButton';
import { useBackClose } from '../utils/backNavigation';

/* ========================= 1. 魔术礼装详情弹窗 ========================= */

interface MysticCodeDetailModalProps {
  mc: MysticCode | null;
  onClose: () => void;
}

export const MysticCodeDetailModal: React.FC<MysticCodeDetailModalProps> = ({ mc, onClose }) => {
  const [artIdx, setArtIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showJp, setShowJp] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useBackClose(Boolean(mc), onClose);

  useEffect(() => {
    setArtIdx(0);
    setShowJp(false);
  }, [mc?.id]);

  if (!mc) return null;

  const currentArt = mc.arts[Math.min(artIdx, Math.max(0, mc.arts.length - 1))];

  return (
    <div className="modal-backdrop detail-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="detail-header">
          <div className="detail-header-left">
            <div>
              <div className="detail-no-row">
                <span className="detail-no">魔术礼装 #{mc.id}</span>
                <span className="detail-method-tag">御主装备</span>
              </div>
              <h2 className="detail-name-cn">{mc.nameCn}</h2>
              {mc.nameJp && <div className="detail-name-sub">{mc.nameJp}</div>}
            </div>
          </div>
          <button type="button" className="btn-icon-close" onClick={onClose} aria-label="关闭">
            <X size={22} />
          </button>
        </header>

        <div className="detail-scroll-body" ref={scrollRef}>
          <div className="detail-hero-grid">
            <div className="detail-art-box">
              {currentArt && (
                <>
                  <div
                    className="detail-art-frame"
                    onClick={() => setLightboxOpen(true)}
                    title="点击放大查看并下载原始资源图片"
                  >
                    <SmartImage
                      localSrc={currentArt.thumbLocal}
                      remoteSrc={currentArt.thumbRemote}
                      fallbackSrc={currentArt.fullUrl}
                      alt={mc.nameCn}
                      className="detail-art-img"
                    />
                    <div className="detail-art-zoom-hint">
                      <Maximize2 size={14} />
                      <span>点击放大 / 下载原图</span>
                    </div>
                  </div>
                  {mc.arts.length > 1 && (
                    <div className="detail-art-tabs">
                      {mc.arts.map((art, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`art-stage-pill ${i === artIdx ? 'active' : ''}`}
                          onClick={() => setArtIdx(i)}
                        >
                          {art.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="detail-quick-panel">
              <div className="lore-header-row" style={{ marginBottom: 6 }}>
                <strong style={{ fontSize: 13.5, color: '#0f172a' }}>礼装简介</strong>
                {mc.descJp && (
                  <button
                    type="button"
                    className="btn-lang-switch"
                    onClick={() => setShowJp((v) => !v)}
                  >
                    {showJp ? '显示中文' : '显示日文'}
                  </button>
                )}
              </div>
              <div className="profile-card" style={{ marginBottom: 10 }}>
                <div className="profile-card-text">
                  {showJp && mc.descJp ? mc.descJp : mc.descCn || '暂无简介'}
                </div>
              </div>

              {mc.obtain && (
                <div className="profile-card" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                  <div className="profile-card-head">
                    <strong style={{ color: '#92400e', fontSize: 13 }}>获取方式</strong>
                  </div>
                  <div className="profile-card-text">{mc.obtain}</div>
                </div>
              )}
            </div>
          </div>

          <div className="detail-tab-pane" style={{ marginTop: 12 }}>
            <h3 className="pane-section-title">御主赋予技能（Lv.1 ～ Lv.10）</h3>
            {mc.skills.map((sk, sIdx) => {
              const baseCd = sk.cd;
              return (
                <div key={sIdx} className="mc-skill-block">
                  <div className="mc-skill-slot-title">御主技能 {sIdx + 1}</div>
                  <div className="mc-table-card">
                    <div className="mc-skill-header">
                      <div className="mc-skill-icon-cell">
                        <SmartImage
                          localSrc={sk.iconLocal}
                          remoteSrc={sk.iconRemote}
                          alt={sk.icon}
                          className="mc-skill-icon-img"
                        />
                      </div>
                      <div className="mc-skill-names">
                        <div className="mc-skill-name-cn">{sk.nameCn}</div>
                        {sk.nameJp && <div className="mc-skill-name-jp">{sk.nameJp}</div>}
                      </div>
                      <div className="mc-skill-cd">
                        <span>充能时间: </span>
                        {baseCd ? (
                          <strong>
                            {baseCd}→<span className="mc-red">{baseCd - 1}</span>→
                            <span className="mc-red">{baseCd - 2}</span>
                          </strong>
                        ) : (
                          <strong>—</strong>
                        )}
                      </div>
                    </div>
                    <div className="mc-effects-body">
                      {sk.effects.map((eff, eIdx) => {
                        const uniqueVals = Array.from(new Set(eff.values));
                        const isSingle = eff.values.length <= 1 || uniqueVals.length === 1;
                        return (
                          <div key={eIdx} className="mc-effect-group">
                            <div className="mc-effect-desc-row">
                              <FormattedEffectText text={eff.text} />
                            </div>
                            {isSingle ? (
                              <div className="mc-effect-values-single">{eff.values[0] || '∅'}</div>
                            ) : (
                              <div className="mc-effect-values-grid10">
                                {eff.values.slice(0, 10).map((val, vIdx) => (
                                  <div
                                    key={vIdx}
                                    className={`mc-val-cell ${
                                      vIdx === 5 || vIdx === 9 ? 'mc-val-highlight' : ''
                                    }`}
                                  >
                                    <span className="mc-val-lv">Lv.{vIdx + 1}</span>
                                    <span className="mc-val-num">{val}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {mc.expCurve.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <h3 className="pane-section-title">礼装升级累计所需经验（Lv.2 ～ Lv.10）</h3>
                <div className="bond-points-table-wrap">
                  <table className="bond-points-table">
                    <thead>
                      <tr>
                        {mc.expCurve.map((_, i) => (
                          <th key={i}>Lv.{i + 2}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {mc.expCurve.map((val, i) => (
                          <td key={i} className={i === mc.expCurve.length - 1 ? 'mc-red' : ''}>
                            {val.toLocaleString()}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <BackToTopButton targetRef={scrollRef} variant="modal" />

        {mc.arts.length > 0 && (
          <CardLightbox
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            title={mc.nameCn}
            arts={mc.arts}
            initialIndex={artIdx}
          />
        )}
      </div>
    </div>
  );
};

/* ========================= 2. 灵衣一览详情弹窗 ========================= */

interface CostumeDetailModalProps {
  costume: CostumeItem | null;
  onClose: () => void;
  onJumpToServantByTitle: (title: string) => void;
  onOpenItemByName?: (name: string) => void;
}

export const CostumeDetailModal: React.FC<CostumeDetailModalProps> = ({
  costume,
  onClose,
  onJumpToServantByTitle,
  onOpenItemByName,
}) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showJp, setShowJp] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useBackClose(Boolean(costume), onClose);

  useEffect(() => {
    setShowJp(false);
  }, [costume?.id]);

  if (!costume) return null;

  return (
    <div className="modal-backdrop detail-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="detail-header">
          <div className="detail-header-left">
            {costume.iconLocal && (
              <SmartImage
                localSrc={costume.iconLocal}
                remoteSrc={costume.iconRemote}
                alt={costume.nameCn}
                className="detail-ce-badge"
              />
            )}
            <div>
              <div className="detail-no-row">
                <span className="detail-no">灵衣 No.{costume.id}</span>
                <span className="detail-method-tag">{costume.servant}</span>
              </div>
              <h2 className="detail-name-cn">{costume.nameCn}</h2>
              {costume.nameJp && <div className="detail-name-sub">{costume.nameJp}</div>}
            </div>
          </div>
          <button type="button" className="btn-icon-close" onClick={onClose} aria-label="关闭">
            <X size={22} />
          </button>
        </header>

        <div className="detail-scroll-body" ref={scrollRef}>
          <div className="detail-hero-grid">
            <div className="detail-art-box">
              <div
                className="detail-art-frame"
                onClick={() => setLightboxOpen(true)}
                title="点击放大查看并下载原始高清立绘"
              >
                <SmartImage
                  localSrc={costume.artThumbLocal || costume.iconLocal}
                  remoteSrc={costume.artThumbRemote || costume.iconRemote}
                  fallbackSrc={costume.artFullUrl}
                  alt={costume.nameCn}
                  className="detail-art-img"
                />
                <div className="detail-art-zoom-hint">
                  <Maximize2 size={14} />
                  <span>点击放大 / 下载原图</span>
                </div>
              </div>
            </div>

            <div className="detail-quick-panel">
              {costume.servant && (
                <button
                  type="button"
                  className="bond-svt-jump-btn"
                  style={{ marginTop: 0, marginBottom: 10 }}
                  onClick={() => onJumpToServantByTitle(costume.servant)}
                >
                  <User size={15} />
                  <span>所属从者：{costume.servant}（点击查看英灵详情）</span>
                </button>
              )}

              <div className="lore-header-row" style={{ marginBottom: 6 }}>
                <strong style={{ fontSize: 13.5 }}>灵衣简介</strong>
                {costume.descJp && (
                  <button
                    type="button"
                    className="btn-lang-switch"
                    onClick={() => setShowJp((v) => !v)}
                  >
                    {showJp ? '显示中文' : '显示日文'}
                  </button>
                )}
              </div>
              <div className="profile-card" style={{ marginBottom: 10 }}>
                <div className="profile-card-text">
                  {showJp && costume.descJp ? costume.descJp : costume.descCn || '暂无简介'}
                </div>
              </div>

              <div className="profile-card">
                <div className="profile-card-head">
                  <strong>灵衣解放所需素材</strong>
                  <span className="profile-cond">
                    {costume.materials.length > 0 ? '需消耗 300万 QP' : '无需消耗素材与QP'}
                  </span>
                </div>
                {costume.materials.length > 0 && (
                  <div className="mc-mat-items" style={{ padding: '4px 0 0' }}>
                    {costume.materials.map((m, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="mc-mat-chip mat-clickable"
                        onClick={() => onOpenItemByName && onOpenItemByName(m.name)}
                        title={`点击查看「${m.name}」的掉落关卡效率`}
                      >
                        <div className="mc-mat-icon-wrap">
                          <SmartImage
                            localSrc={m.iconLocal}
                            remoteSrc={m.iconRemote}
                            alt={m.name}
                            className="mc-mat-icon"
                          />
                          <span className="mc-mat-count">×{m.count}</span>
                        </div>
                        <span className="mc-mat-name">{m.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {costume.obtain && (
            <div className="detail-tab-pane" style={{ marginTop: 12 }}>
              <h3 className="pane-section-title">开放条件与获取活动</h3>
              <div className="profile-card">
                <div className="profile-card-text">{costume.obtain}</div>
              </div>
            </div>
          )}
        </div>

        {costume.artFullUrl && (
          <CardLightbox
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            title={`${costume.servant} - ${costume.nameCn}`}
            arts={[
              {
                label: costume.nameCn,
                file: `${costume.nameCn}.png`,
                thumbLocal: costume.artThumbLocal || costume.iconLocal,
                thumbRemote: costume.artThumbRemote || costume.iconRemote,
                fullUrl: costume.artFullUrl,
              },
            ]}
          />
        )}
        <BackToTopButton targetRef={scrollRef} variant="modal" />
      </div>
    </div>
  );
};

/* ========================= 3. 道具一览与掉落效率弹窗 ========================= */

type DropSortKey = 'ap_eff' | 'drop_rate' | 'ap_cost' | 'bond' | 'samples';

interface ItemDetailModalProps {
  item: GameItem | null;
  onClose: () => void;
  onJumpToItemByName: (name: string) => void;
}

export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({
  item,
  onClose,
  onJumpToItemByName,
}) => {
  const [sortKey, setSortKey] = useState<DropSortKey>('ap_eff');
  const [showJp, setShowJp] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useBackClose(Boolean(item), onClose);

  useEffect(() => {
    setSortKey('ap_eff');
  }, [item?.nameCn]);

  const sortedQuests = useMemo(() => {
    if (!item || !item.dropQuests) return [];
    const list = [...item.dropQuests];
    list.sort((a, b) => {
      if (sortKey === 'ap_eff') return a.apPerDrop - b.apPerDrop || b.dropRateNum - a.dropRateNum;
      if (sortKey === 'drop_rate') return b.dropRateNum - a.dropRateNum || a.apPerDrop - b.apPerDrop;
      if (sortKey === 'ap_cost') return a.ap - b.ap || a.apPerDrop - b.apPerDrop;
      if (sortKey === 'bond') return b.bond - a.bond || a.apPerDrop - b.apPerDrop;
      return b.samples - a.samples || a.apPerDrop - b.apPerDrop;
    });
    return list;
  }, [item, sortKey]);

  if (!item) return null;

  return (
    <div className="modal-backdrop detail-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        <header className="detail-header">
          <div className="detail-header-left">
            <SmartImage
              localSrc={item.iconLocal}
              remoteSrc={item.iconRemote}
              fallbackSrc={item.iconFallback}
              alt={item.nameCn}
              className="detail-ce-badge"
            />
            <div>
              <div className="detail-no-row">
                <span className="detail-no">No.{item.id}</span>
                <span className="detail-method-tag">{item.categoryGroup}</span>
                {item.dropCount > 0 && (
                  <span className="drop-count-pill">共 {item.dropCount} 个掉落关卡</span>
                )}
              </div>
              <h2 className="detail-name-cn">{item.nameCn}</h2>
              <div className="detail-name-sub">
                {item.nameJp} {item.nameEn ? `· ${item.nameEn}` : ''}
              </div>
            </div>
          </div>
          <button type="button" className="btn-icon-close" onClick={onClose} aria-label="关闭">
            <X size={22} />
          </button>
        </header>

        <div className="detail-scroll-body" ref={scrollRef}>
          {/* 道具描述 */}
          <div className="detail-tab-pane" style={{ marginBottom: 12 }}>
            <div className="lore-header-row" style={{ marginBottom: 6 }}>
              <h3 className="pane-section-title" style={{ margin: 0 }}>
                <BookOpen size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />
                道具说明
              </h3>
              {item.descJp && (
                <button
                  type="button"
                  className="btn-lang-switch"
                  onClick={() => setShowJp((v) => !v)}
                >
                  {showJp ? '显示中文' : '显示日文'}
                </button>
              )}
            </div>
            <div className="profile-card">
              <div className="profile-card-text">
                {showJp && item.descJp ? item.descJp : item.descCn || '暂无详细说明'}
              </div>
            </div>
          </div>

          {/* 掉落关卡效率一览 */}
          <div className="detail-tab-pane">
            <div className="lore-header-row" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <h3 className="pane-section-title" style={{ margin: 0 }}>
                <Flame size={15} style={{ verticalAlign: 'middle', marginRight: 5, color: '#dc2626' }} />
                自由关卡掉落效率一览
              </h3>
              <span style={{ fontSize: 11.5, color: '#64748b' }}>
                数据来源：FGO效率剧场 / Mooncell
              </span>
            </div>

            {sortedQuests.length === 0 ? (
              <div className="mc-empty-hint">该道具暂无常驻自由关卡掉落数据（通常通过活动/商店/任务获取）</div>
            ) : (
              <>
                {/* 排序切换栏（单行不换行） */}
                <div className="drop-sort-bar">
                  <ArrowUpDown size={14} style={{ flexShrink: 0, color: '#64748b' }} />
                  {(
                    [
                      { key: 'ap_eff', label: 'AP效率最优' },
                      { key: 'drop_rate', label: '掉落率最高' },
                      { key: 'ap_cost', label: '消耗AP最少' },
                      { key: 'bond', label: '牵绊最高' },
                      { key: 'samples', label: '样本最多' },
                    ] as { key: DropSortKey; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`drop-sort-pill ${sortKey === opt.key ? 'active' : ''}`}
                      onClick={() => setSortKey(opt.key)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* 掉落关卡卡片列表 */}
                <div className="drop-quest-list">
                  {sortedQuests.map((q, idx) => (
                    <div
                      key={`${q.questJp}_${idx}`}
                      className={`drop-quest-card ${idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : ''}`}
                    >
                      <div className="drop-quest-top">
                        <span className={`drop-rank-badge r${idx < 3 ? idx + 1 : 'n'}`}>
                          {idx < 3 ? `TOP ${idx + 1}` : `#${idx + 1}`}
                        </span>
                        <div className="drop-quest-name-col">
                          <div className="drop-quest-title">
                            <MapPin size={13} />
                            <span>
                              {q.chapter} · {q.location} — <strong>{showJp ? q.questJp : q.questCn}</strong>
                            </span>
                          </div>
                        </div>
                        <span className="drop-ap-chip">{q.ap} AP</span>
                      </div>

                      <div className="drop-metrics-grid">
                        <div className={`drop-metric ${sortKey === 'ap_eff' ? 'highlight' : ''}`}>
                          <span>每个所需AP</span>
                          <strong>{q.apPerDrop} AP</strong>
                        </div>
                        <div className={`drop-metric ${sortKey === 'drop_rate' ? 'highlight' : ''}`}>
                          <span>每场掉落率</span>
                          <strong>{q.dropRate}</strong>
                        </div>
                        <div className={`drop-metric ${sortKey === 'bond' ? 'highlight' : ''}`}>
                          <span>通关牵绊</span>
                          <strong>{q.bond}</strong>
                        </div>
                        <div className={`drop-metric ${sortKey === 'samples' ? 'highlight' : ''}`}>
                          <span>统计样本数</span>
                          <strong>{q.samples ? q.samples.toLocaleString() : '—'}</strong>
                        </div>
                      </div>

                      {q.otherDrops.length > 0 && (
                        <div className="drop-others-row">
                          <span className="drop-others-label">
                            <Sparkles size={11} /> 副产物：
                          </span>
                          <div className="drop-others-chips">
                            {q.otherDrops.map((od, oi) => (
                              <button
                                key={oi}
                                type="button"
                                className="drop-other-chip"
                                onClick={() => onJumpToItemByName(od.name)}
                                title={`点击查看「${od.name}」的掉落效率`}
                              >
                                {od.name} <small>{od.rate}</small>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <BackToTopButton targetRef={scrollRef} variant="modal" />
      </div>
    </div>
  );
};
