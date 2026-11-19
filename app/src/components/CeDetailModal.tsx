import React, { useState, useRef } from 'react';
import { X, Maximize2, User } from 'lucide-react';
import { CraftEssenceDetail } from '../types';
import { SmartImage } from './SmartImage';
import { FormattedEffectText } from './SkillAndNpTables';
import { CardLightbox } from './CardLightbox';
import { BackToTopButton } from './BackToTopButton';
import { useBackClose } from '../utils/backNavigation';

interface CeDetailModalProps {
  ce: CraftEssenceDetail | null;
  loading: boolean;
  onClose: () => void;
  onJumpToServantByTitle: (title: string) => void;
  onSelectEffectTag?: (tag: string) => void;
}

export const CeDetailModal: React.FC<CeDetailModalProps> = ({
  ce,
  loading,
  onClose,
  onJumpToServantByTitle,
  onSelectEffectTag,
}) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showJp, setShowJp] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useBackClose(Boolean(ce || loading), onClose);

  if (!ce && !loading) return null;

  return (
    <div className="modal-backdrop detail-backdrop" onClick={onClose}>
      <div className="detail-sheet ce-detail-sheet" onClick={(e) => e.stopPropagation()}>
        {loading || !ce ? (
          <div className="detail-loading">
            <div className="spinner" />
            <span>正在读取概念礼装详情...</span>
          </div>
        ) : (
          <>
            <header className="detail-header">
              <div className="detail-header-left">
                <SmartImage
                  localSrc={ce.iconLocal}
                  remoteSrc={ce.iconRemote}
                  alt={ce.nameCn}
                  className="detail-ce-badge"
                />
                <div>
                  <div className="detail-no-row">
                    <span className="detail-no">No.{ce.id}</span>
                    <span className="detail-stars">{'★'.repeat(ce.rarity || 4)}</span>
                    <span className="detail-method-tag">{ce.category}</span>
                  </div>
                  <h2 className="detail-name-cn">{ce.nameCn}</h2>
                  {ce.nameJp && <div className="detail-name-sub">{ce.nameJp}</div>}
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
                    title="点击放大查看并下载原始资源图片"
                  >
                    <SmartImage
                      localSrc={ce.cardThumbLocal}
                      remoteSrc={ce.cardThumbRemote}
                      fallbackSrc={ce.cardFullUrl || ce.iconLocal}
                      alt={ce.nameCn}
                      className="detail-art-img"
                    />
                    <div className="detail-art-zoom-hint">
                      <Maximize2 size={14} />
                      <span>点击放大 / 下载原图</span>
                    </div>
                  </div>
                </div>

                <div className="detail-quick-panel">
                  <div className="quick-stat-cards">
                    <div className="q-stat-box">
                      <span className="q-stat-label">COST（费用）</span>
                      <strong className="q-stat-val">{ce.cost || '—'}</strong>
                    </div>
                    <div className="q-stat-box">
                      <span className="q-stat-label">ATK（攻击力）</span>
                      <strong className="q-stat-val">{ce.atk || '0'}</strong>
                    </div>
                    <div className="q-stat-box">
                      <span className="q-stat-label">HP（生命值）</span>
                      <strong className="q-stat-val">{ce.hp || '0'}</strong>
                    </div>
                    <div className="q-stat-box">
                      <span className="q-stat-label">画师 · 属性倾向</span>
                      <strong className="q-stat-val">
                        {ce.illustrator || '—'} {ce.statType ? `· ${ce.statType}` : ''}
                      </strong>
                    </div>
                  </div>

                  {ce.effectTags && ce.effectTags.length > 0 && (
                    <div className="traits-tag-cloud" style={{ marginTop: 10 }}>
                      {ce.effectTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="trait-clickable-pill"
                          onClick={() => {
                            if (onSelectEffectTag) {
                              onSelectEffectTag(tag);
                              onClose();
                            }
                          }}
                          title="点击筛选拥有该效果标签的所有概念礼装"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

                  {ce.bondServant && (
                    <button
                      type="button"
                      className="bond-svt-jump-btn"
                      onClick={() => onJumpToServantByTitle(ce.bondServant)}
                    >
                      <User size={15} />
                      <span>所属从者：{ce.bondServant}（点击查看英灵详情）</span>
                    </button>
                  )}

                  <div className="mc-table-card" style={{ marginTop: 10 }}>
                    <div className="mc-passive-item">
                      <SmartImage
                        localSrc={ce.skillIconLocal}
                        remoteSrc={ce.skillIconRemote}
                        alt="礼装效果"
                        className="mc-passive-icon"
                      />
                      <div className="mc-passive-content">
                        <div className="mc-passive-title">
                          <span>初始持有技能</span>
                        </div>
                        <div className="mc-passive-desc">
                          <FormattedEffectText text={ce.des || '无效果'} />
                        </div>
                        {ce.desMax && (
                          <>
                            <div className="mc-passive-title" style={{ marginTop: 8 }}>
                              <span className="mc-mlb-badge">最大解放 [满破]</span>
                            </div>
                            <div className="mc-passive-desc">
                              <FormattedEffectText text={ce.desMax} />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {(ce.introCn || ce.introJp) && (
                <div className="detail-tab-pane" style={{ marginTop: 16 }}>
                  <div className="lore-header-row">
                    <h3 className="pane-section-title" style={{ margin: 0 }}>
                      礼装解说
                    </h3>
                    {ce.introJp && (
                      <button
                        type="button"
                        className="btn-lang-switch"
                        onClick={() => setShowJp((v) => !v)}
                      >
                        {showJp ? '显示中文译文' : '显示日文原文'}
                      </button>
                    )}
                  </div>
                  <div className="profile-card">
                    <div className="profile-card-text">
                      {showJp && ce.introJp ? ce.introJp : ce.introCn}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <BackToTopButton targetRef={scrollRef} variant="modal" />

            <CardLightbox
              open={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              title={ce.nameCn}
              arts={[
                {
                  label: '礼装卡面',
                  file: `${ce.nameCn}.png`,
                  thumbLocal: ce.cardThumbLocal,
                  thumbRemote: ce.cardThumbRemote,
                  fullUrl: ce.cardFullUrl,
                },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
};
