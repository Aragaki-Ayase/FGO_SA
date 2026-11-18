import React, { useState, useEffect } from 'react';
import {
  X,
  Maximize2,
  Award,
  Swords,
  Shield,
  Package,
  BookOpen,
  Volume2,
  ExternalLink,
} from 'lucide-react';
import { ServantDetail, MaterialStage } from '../types';
import { SmartImage } from './SmartImage';
import {
  ActiveSkillCard,
  NoblePhantasmCard,
  ClassAndAppendSkills,
  FormattedEffectText,
} from './SkillAndNpTables';
import { CardLightbox } from './CardLightbox';

interface ServantDetailModalProps {
  servant: ServantDetail | null;
  loading: boolean;
  onClose: () => void;
  onSelectTrait: (trait: string) => void;
  onOpenBondCe: (ceId: number) => void;
}

const MaterialTable: React.FC<{ title: string; stages: MaterialStage[] }> = ({
  title,
  stages,
}) => {
  if (!stages || stages.length === 0) return null;
  return (
    <div className="mc-mat-section">
      <h4 className="mc-sub-heading">{title}</h4>
      <div className="mc-mat-table">
        {stages.map((st, idx) => (
          <div
            key={idx}
            className={`mc-mat-row ${st.stage === '总计' ? 'mc-mat-row-total' : ''}`}
          >
            <div className="mc-mat-stage">{st.stage}</div>
            <div className="mc-mat-items">
              {st.items.map((item, i) => (
                <div key={i} className="mc-mat-chip" title={item.name}>
                  <div className="mc-mat-icon-wrap">
                    <SmartImage
                      localSrc={item.iconLocal}
                      remoteSrc={item.iconRemote}
                      alt={item.name}
                      className="mc-mat-icon"
                    />
                    <span className="mc-mat-count">×{item.count}</span>
                  </div>
                  <span className="mc-mat-name">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ServantDetailModal: React.FC<ServantDetailModalProps> = ({
  servant,
  loading,
  onClose,
  onSelectTrait,
  onOpenBondCe,
}) => {
  const [activeTab, setActiveTab] = useState<'combat' | 'stats' | 'materials' | 'lore'>('combat');
  const [artIdx, setArtIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showJpLore, setShowJpLore] = useState(false);
  const [activeVoiceSec, setActiveVoiceSec] = useState(0);

  useEffect(() => {
    setActiveTab('combat');
    setArtIdx(0);
    setActiveVoiceSec(0);
  }, [servant?.id]);

  if (!servant && !loading) return null;

  return (
    <div className="modal-backdrop detail-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(e) => e.stopPropagation()}>
        {loading || !servant ? (
          <div className="detail-loading">
            <div className="spinner" />
            <span>正在读取从者灵基档案...</span>
          </div>
        ) : (
          <>
            {/* Top Bar */}
            <header className="detail-header">
              <div className="detail-header-left">
                <SmartImage
                  localSrc={`/assets/icons/ui/金卡${servant.className}.png`}
                  alt={servant.className}
                  className="detail-class-badge"
                />
                <div>
                  <div className="detail-no-row">
                    <span className="detail-no">No.{servant.id}</span>
                    <span className="detail-stars">{'★'.repeat(servant.rarity || 1)}</span>
                    <span className="detail-method-tag">{servant.method}</span>
                  </div>
                  <h2 className="detail-name-cn">{servant.nameCn}</h2>
                  <div className="detail-name-sub">
                    {servant.nameJp} {servant.nameEn ? `· ${servant.nameEn}` : ''}
                  </div>
                </div>
              </div>
              <button type="button" className="btn-icon-close" onClick={onClose} aria-label="关闭">
                <X size={22} />
              </button>
            </header>

            <div className="detail-scroll-body">
              {/* Top Hero: Card Art Gallery + Quick Summary */}
              <div className="detail-hero-grid">
                <div className="detail-art-box">
                  {servant.ascensions.length > 0 ? (
                    <>
                      <div
                        className="detail-art-frame"
                        onClick={() => setLightboxOpen(true)}
                        title="点击放大查看并可下载原始资源图片"
                      >
                        <SmartImage
                          localSrc={servant.ascensions[Math.min(artIdx, servant.ascensions.length - 1)].thumbLocal}
                          remoteSrc={servant.ascensions[Math.min(artIdx, servant.ascensions.length - 1)].thumbRemote}
                          fallbackSrc={servant.ascensions[Math.min(artIdx, servant.ascensions.length - 1)].fullUrl}
                          alt={servant.nameCn}
                          className="detail-art-img"
                        />
                        <div className="detail-art-zoom-hint">
                          <Maximize2 size={14} />
                          <span>点击放大 / 下载原图</span>
                        </div>
                      </div>
                      {servant.ascensions.length > 1 && (
                        <div className="detail-art-tabs">
                          {servant.ascensions.map((art, i) => (
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
                  ) : (
                    <div className="detail-art-frame">
                      <SmartImage
                        localSrc={servant.iconLocal}
                        remoteSrc={servant.iconRemote}
                        alt={servant.nameCn}
                        className="detail-art-img"
                      />
                    </div>
                  )}
                </div>

                {/* Quick Stats & Command Cards */}
                <div className="detail-quick-panel">
                  <div className="quick-stat-cards">
                    <div className="q-stat-box">
                      <span className="q-stat-label">满级 ATK / HP</span>
                      <strong className="q-stat-val">
                        {servant.stats.atkMax || '—'} / {servant.stats.hpMax || '—'}
                      </strong>
                    </div>
                    <div className="q-stat-box">
                      <span className="q-stat-label">100级 ATK / HP</span>
                      <strong className="q-stat-val">
                        {servant.stats.atk100 || '—'} / {servant.stats.hp100 || '—'}
                      </strong>
                    </div>
                    <div className="q-stat-box">
                      <span className="q-stat-label">120级 ATK / HP</span>
                      <strong className="q-stat-val">
                        {servant.stats.atk120 || '—'} / {servant.stats.hp120 || '—'}
                      </strong>
                    </div>
                    <div className="q-stat-box">
                      <span className="q-stat-label">阵营 · 属性 · 性别</span>
                      <strong className="q-stat-val">
                        {[servant.subAttr, servant.attr1, servant.attr2, servant.gender]
                          .filter(Boolean)
                          .join(' · ')}
                      </strong>
                    </div>
                  </div>

                  {/* Command Cards Deck */}
                  <div className="deck-bar">
                    <span className="deck-label">指令卡配卡</span>
                    <div className="deck-cards">
                      {servant.cards.map((c, idx) => (
                        <div key={idx} className={`deck-card-item deck-${c.toLowerCase()}`}>
                          <SmartImage
                            localSrc={`/assets/icons/ui/${c}.png`}
                            alt={c}
                            className="deck-card-img"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CV & Illustrator */}
                  <div className="meta-row-compact">
                    <span>
                      <strong>画师：</strong>
                      {servant.illustrator || '—'}
                    </span>
                    <span>
                      <strong>声优：</strong>
                      {servant.cv || '—'}
                    </span>
                  </div>

                  {/* Bond CE Jump Card */}
                  {servant.bondCe && (
                    <div
                      className="bond-ce-banner"
                      onClick={() => onOpenBondCe(servant.bondCe!.id)}
                      title="点击查看专属牵绊礼装详情"
                    >
                      <SmartImage
                        localSrc={servant.bondCe.iconLocal}
                        remoteSrc={servant.bondCe.iconRemote}
                        alt={servant.bondCe.nameCn}
                        className="bond-ce-thumb"
                      />
                      <div className="bond-ce-info">
                        <div className="bond-ce-title">
                          <Award size={14} />
                          <span>专属牵绊礼装：{servant.bondCe.nameCn}</span>
                          <ExternalLink size={13} />
                        </div>
                        <div className="bond-ce-desc">
                          <FormattedEffectText text={servant.bondCe.des} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section Navigation Tabs */}
              <div className="detail-nav-tabs">
                <button
                  type="button"
                  className={`detail-nav-tab ${activeTab === 'combat' ? 'active' : ''}`}
                  onClick={() => setActiveTab('combat')}
                >
                  <Swords size={16} />
                  <span>技能与宝具</span>
                </button>
                <button
                  type="button"
                  className={`detail-nav-tab ${activeTab === 'stats' ? 'active' : ''}`}
                  onClick={() => setActiveTab('stats')}
                >
                  <Shield size={16} />
                  <span>数值与特性</span>
                </button>
                <button
                  type="button"
                  className={`detail-nav-tab ${activeTab === 'materials' ? 'active' : ''}`}
                  onClick={() => setActiveTab('materials')}
                >
                  <Package size={16} />
                  <span>素材需求</span>
                </button>
                <button
                  type="button"
                  className={`detail-nav-tab ${activeTab === 'lore' ? 'active' : ''}`}
                  onClick={() => setActiveTab('lore')}
                >
                  <BookOpen size={16} />
                  <span>资料与语音</span>
                </button>
              </div>

              {/* Tab 1: Skills & Noble Phantasm (图3 + 图4) */}
              {activeTab === 'combat' && (
                <div className="detail-tab-pane">
                  <h3 className="pane-section-title">持有技能</h3>
                  {servant.activeSkills.length > 0 ? (
                    servant.activeSkills.map((slot, sIdx) => (
                      <ActiveSkillCard key={sIdx} slot={slot} />
                    ))
                  ) : (
                    <div className="mc-empty-hint">暂无持有技能数据</div>
                  )}

                  <h3 className="pane-section-title" style={{ marginTop: 22 }}>
                    宝具（Noble Phantasm）
                  </h3>
                  <NoblePhantasmCard variants={servant.noblePhantasms} />

                  <ClassAndAppendSkills
                    classSkills={servant.classSkills}
                    appendSkills={servant.appendSkills}
                  />
                </div>
              )}

              {/* Tab 2: Detailed Stats & Traits */}
              {activeTab === 'stats' && (
                <div className="detail-tab-pane">
                  <h3 className="pane-section-title">隐藏数值（NP率 / Hit数 / 暴击出星）</h3>
                  <div className="stats-detail-grid">
                    <div className="stat-kv">
                      <span>Quick NP率 / Hit</span>
                      <strong>
                        {servant.npRates.Q || '—'} ({servant.hits.Q || '—'} Hits)
                      </strong>
                    </div>
                    <div className="stat-kv">
                      <span>Arts NP率 / Hit</span>
                      <strong>
                        {servant.npRates.A || '—'} ({servant.hits.A || '—'} Hits)
                      </strong>
                    </div>
                    <div className="stat-kv">
                      <span>Buster NP率 / Hit</span>
                      <strong>
                        {servant.npRates.B || '—'} ({servant.hits.B || '—'} Hits)
                      </strong>
                    </div>
                    <div className="stat-kv">
                      <span>Extra NP率 / Hit</span>
                      <strong>
                        {servant.npRates.EX || '—'} ({servant.hits.EX || '—'} Hits)
                      </strong>
                    </div>
                    <div className="stat-kv">
                      <span>宝具 NP率 / Hit</span>
                      <strong>
                        {servant.npRates.NP || '—'} ({servant.hits.NP || '—'} Hits)
                      </strong>
                    </div>
                    <div className="stat-kv">
                      <span>受击 NP率</span>
                      <strong>{servant.npRates.def || '—'}</strong>
                    </div>
                    <div className="stat-kv">
                      <span>出星率</span>
                      <strong>{servant.starRate || '—'}</strong>
                    </div>
                    <div className="stat-kv">
                      <span>暴击星权重</span>
                      <strong>{servant.critWeight || '—'}</strong>
                    </div>
                    <div className="stat-kv">
                      <span>被即死率</span>
                      <strong>{servant.deathRate || '—'}</strong>
                    </div>
                    <div className="stat-kv">
                      <span>身高 / 体重</span>
                      <strong>
                        {servant.height || '—'} / {servant.weight || '—'}
                      </strong>
                    </div>
                  </div>

                  <h3 className="pane-section-title" style={{ marginTop: 20 }}>
                    能力参数（六维面板）
                  </h3>
                  <div className="params-grid">
                    {[
                      { k: '筋力', v: servant.params.str },
                      { k: '耐久', v: servant.params.end },
                      { k: '敏捷', v: servant.params.agi },
                      { k: '魔力', v: servant.params.mp },
                      { k: '幸运', v: servant.params.luk },
                      { k: '宝具', v: servant.params.np },
                    ].map((p) => (
                      <div key={p.k} className="param-box">
                        <span className="param-k">{p.k}</span>
                        <strong className="param-v">{p.v || '—'}</strong>
                      </div>
                    ))}
                  </div>

                  <h3 className="pane-section-title" style={{ marginTop: 20 }}>
                    特性标签（点击特性可筛选同类从者）
                  </h3>
                  <div className="traits-tag-cloud">
                    {servant.traits.map((t) => {
                      const detailObj = servant.traitDetails.find((d) => d.name === t);
                      return (
                        <button
                          key={t}
                          type="button"
                          className="trait-clickable-pill"
                          onClick={() => {
                            onSelectTrait(t);
                            onClose();
                          }}
                        >
                          <span>{t}</span>
                          {detailObj?.note && <small>{detailObj.note}</small>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab 3: Materials */}
              {activeTab === 'materials' && (
                <div className="detail-tab-pane">
                  {servant.materials.ascension.length === 0 &&
                  servant.materials.skill.length === 0 &&
                  servant.materials.appendSkill.length === 0 ? (
                    <div className="mc-empty-hint">该从者无需常规灵基再临与技能强化素材</div>
                  ) : (
                    <>
                      <MaterialTable
                        title="灵基再临（从者进化）素材"
                        stages={servant.materials.ascension}
                      />
                      <MaterialTable
                        title="持有技能强化素材（单技能 Lv.1 → Lv.10）"
                        stages={servant.materials.skill}
                      />
                      <MaterialTable
                        title="追加技能强化素材（单技能 Lv.1 → Lv.10）"
                        stages={servant.materials.appendSkill}
                      />
                    </>
                  )}
                </div>
              )}

              {/* Tab 4: Profile & Voices */}
              {activeTab === 'lore' && (
                <div className="detail-tab-pane">
                  <div className="lore-header-row">
                    <h3 className="pane-section-title" style={{ margin: 0 }}>
                      从者背景资料
                    </h3>
                    <button
                      type="button"
                      className="btn-lang-switch"
                      onClick={() => setShowJpLore((v) => !v)}
                    >
                      {showJpLore ? '显示中文译文' : '显示日文原文'}
                    </button>
                  </div>

                  <div className="profile-cards-list">
                    {servant.profile.map((sec, idx) => (
                      <div key={idx} className="profile-card">
                        <div className="profile-card-head">
                          <strong>{sec.title}</strong>
                          {sec.cond && <span className="profile-cond">{sec.cond}</span>}
                        </div>
                        <div className="profile-card-text">
                          {(showJpLore && sec.textJp ? sec.textJp : sec.textCn) || '暂无文本'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {servant.voices.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <h3 className="pane-section-title">
                        <Volume2 size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        语音文本一览
                      </h3>
                      <div className="mc-stage-tabs">
                        {servant.voices.map((vs, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`mc-stage-tab ${idx === activeVoiceSec ? 'active' : ''}`}
                            onClick={() => setActiveVoiceSec(idx)}
                          >
                            {vs.section} ({vs.items.length})
                          </button>
                        ))}
                      </div>
                      <div className="voice-table">
                        {servant.voices[Math.min(activeVoiceSec, servant.voices.length - 1)]?.items.map(
                          (item, idx) => (
                            <div key={idx} className="voice-row">
                              <div className="voice-row-title">{item.title}</div>
                              <div className="voice-row-content">
                                <div className="voice-cn">{item.textCn}</div>
                                {item.textJp && <div className="voice-jp">{item.textJp}</div>}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {servant.ascensions.length > 0 && (
              <CardLightbox
                open={lightboxOpen}
                onClose={() => setLightboxOpen(false)}
                title={servant.nameCn}
                arts={servant.ascensions}
                initialIndex={artIdx}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};
