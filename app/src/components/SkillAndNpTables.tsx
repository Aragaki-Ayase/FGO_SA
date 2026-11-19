import React, { useState, useEffect } from 'react';
import { ActiveSkillSlot, NpVariant, ClassSkill, AppendSkill } from '../types';
import { SmartImage } from './SmartImage';

/**
 * 优先定位最高次数的「强化后」变体索引（如存在 强化后2 则优先于 强化后；
 * 同为强化后且含多卡色/多阶段时优先选第一个强化后变体）；无强化项时默认返回 0。
 */
function getDefaultVariantIndex(variants: Array<{ tabLabel?: string }>): number {
  if (!variants || variants.length <= 1) return 0;
  let bestIdx = 0;
  let bestLevel = 0;
  for (let i = 0; i < variants.length; i++) {
    const label = variants[i].tabLabel || '';
    const match = label.match(/强化后(\d*)/);
    if (match) {
      const level = match[1] ? parseInt(match[1], 10) : 1;
      if (level > bestLevel) {
        bestLevel = level;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

/**
 * Render effect text containing ⟪特攻:...⟫ tokens with blue dashed underline (matching 图4).
 */
export const FormattedEffectText: React.FC<{ text: string; showTargetIcon?: boolean }> = ({
  text,
  showTargetIcon = false,
}) => {
  const parts = text.split(/(⟪特攻:[^⟫]+⟫)/g);
  const isStarEffect = text.includes('获得暴击星') || text.includes('暴击星发生');

  return (
    <span className="fgo-effect-text">
      {showTargetIcon && (
        <span className={isStarEffect ? 'eff-icon-star' : 'eff-icon-target'} aria-hidden="true">
          {isStarEffect ? '✦' : '●'}
        </span>
      )}
      {parts.map((part, idx) => {
        if (part.startsWith('⟪特攻:') && part.endsWith('⟫')) {
          const inner = part.slice(4, -1);
          return (
            <span key={idx} className="fgo-special-tag" title="特攻/特性关联对象">
              {inner}
            </span>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </span>
  );
};

/**
 * 图3样式：持有技能卡片（支持多阶段/强化前后同处切换、8→7→6 红字充能、Lv.6/Lv.10 标红表格）
 */
export const ActiveSkillCard: React.FC<{ slot: ActiveSkillSlot }> = ({ slot }) => {
  const variants = slot.variants;
  const [activeIdx, setActiveIdx] = useState(() => getDefaultVariantIndex(variants));

  useEffect(() => {
    setActiveIdx(getDefaultVariantIndex(variants));
  }, [variants]);

  if (!variants || variants.length === 0) return null;

  const safeIdx = Math.min(activeIdx, variants.length - 1);
  const current = variants[safeIdx];
  const baseCd = current.cd;

  return (
    <div className="mc-skill-block">
      <div className="mc-skill-slot-title">{slot.slotTitle}</div>

      {variants.length > 1 && (
        <div className="mc-stage-tabs" role="tablist">
          {variants.map((v, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === safeIdx}
              className={`mc-stage-tab ${i === safeIdx ? 'active' : ''}`}
              onClick={() => setActiveIdx(i)}
            >
              {v.tabLabel || `阶段 ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {current.cond && <div className="mc-upgrade-cond">{current.cond}</div>}

      <div className="mc-table-card">
        <div className="mc-skill-header">
          <div className="mc-skill-icon-cell">
            <SmartImage
              localSrc={current.iconLocal}
              remoteSrc={current.iconRemote}
              alt={current.icon}
              className="mc-skill-icon-img"
            />
          </div>
          <div className="mc-skill-names">
            <div className="mc-skill-name-cn">{current.nameCn}</div>
            {current.nameJp && <div className="mc-skill-name-jp">{current.nameJp}</div>}
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
          {current.effects.map((eff, eIdx) => {
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
                        className={`mc-val-cell ${vIdx === 5 || vIdx === 9 ? 'mc-val-highlight' : ''}`}
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
};

/**
 * 图4样式：宝具卡片（支持多阶段/强化前后同处切换、红蓝绿斜格纹横幅、立体金字、特攻虚线下划线与5级数值表）
 */
export const NoblePhantasmCard: React.FC<{ variants: NpVariant[] }> = ({ variants }) => {
  const [activeIdx, setActiveIdx] = useState(() => getDefaultVariantIndex(variants));

  useEffect(() => {
    setActiveIdx(getDefaultVariantIndex(variants));
  }, [variants]);

  if (!variants || variants.length === 0) {
    return <div className="mc-empty-hint">该从者暂无宝具数据</div>;
  }

  const safeIdx = Math.min(activeIdx, variants.length - 1);
  const current = variants[safeIdx];
  const cardLower = (current.card || 'Buster').toLowerCase();

  return (
    <div className="mc-np-block">
      {variants.length > 1 && (
        <div className="mc-stage-tabs" role="tablist">
          {variants.map((v, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === safeIdx}
              className={`mc-stage-tab ${i === safeIdx ? 'active' : ''}`}
              onClick={() => setActiveIdx(i)}
            >
              {v.tabLabel || `阶段 ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {current.cond && <div className="mc-upgrade-cond">{current.cond}</div>}

      <div className="mc-np-card">
        <div className="mc-np-left">
          <SmartImage
            localSrc={`/assets/icons/ui/${current.card || 'Buster'}.png`}
            remoteSrc={`https://media.fgo.wiki/f/f8/${current.card || 'Buster'}.png`}
            alt={current.card}
            className="mc-np-card-icon"
          />
          <div className="mc-np-rank">{current.rank || '—'}</div>
          <div className="mc-np-kind">{current.kind || `${current.type}宝具`}</div>
        </div>

        <div className="mc-np-right">
          <div className={`mc-np-banner mc-np-banner-${cardLower}`}>
            {current.rubyCn && <div className="mc-np-ruby-cn">{current.rubyCn}</div>}
            <div className="mc-np-title-cn">{current.nameCn}</div>
          </div>

          {(current.rubyJp || current.nameJp) && (
            <div className="mc-np-jp-bar">
              {current.rubyJp && <div className="mc-np-ruby-jp">{current.rubyJp}</div>}
              {current.nameJp && <div className="mc-np-title-jp">{current.nameJp}</div>}
            </div>
          )}

          <div className="mc-effects-body">
            {current.effects.map((eff, eIdx) => {
              const uniqueVals = Array.from(new Set(eff.values));
              const isSingle = eff.values.length <= 1 || uniqueVals.length === 1;
              return (
                <div key={eIdx} className="mc-effect-group">
                  <div className="mc-effect-desc-row">
                    <FormattedEffectText text={eff.text} showTargetIcon={true} />
                  </div>
                  {isSingle ? (
                    <div className="mc-effect-values-single">{eff.values[0] || '∅'}</div>
                  ) : (
                    <div className="mc-effect-values-grid5">
                      {eff.values.slice(0, 5).map((val, vIdx) => (
                        <div key={vIdx} className="mc-val-cell">
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
    </div>
  );
};

export const ClassAndAppendSkills: React.FC<{
  classSkills: ClassSkill[];
  appendSkills: AppendSkill[];
}> = ({ classSkills, appendSkills }) => {
  return (
    <div className="mc-subskills-wrap">
      {classSkills.length > 0 && (
        <div className="mc-subskill-section">
          <h4 className="mc-sub-heading">职阶技能（被动）</h4>
          <div className="mc-passive-list">
            {classSkills.map((cs, i) => (
              <div key={i} className="mc-passive-item">
                <SmartImage
                  localSrc={cs.iconLocal}
                  remoteSrc={cs.iconRemote}
                  alt={cs.icon}
                  className="mc-passive-icon"
                />
                <div className="mc-passive-content">
                  <div className="mc-passive-title">
                    <span>{cs.nameCn}</span>
                    {cs.rank && <span className="mc-passive-rank">{cs.rank}</span>}
                  </div>
                  <div className="mc-passive-desc">
                    <FormattedEffectText text={cs.effect} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {appendSkills.length > 0 && (
        <div className="mc-subskill-section">
          <h4 className="mc-sub-heading">追加技能（Append Skills）</h4>
          {appendSkills.map((as, i) => {
            const uniqueVals = Array.from(new Set(as.values));
            const isSingle = as.values.length <= 1 || uniqueVals.length === 1;
            return (
              <div key={i} className="mc-table-card mc-append-card">
                <div className="mc-passive-item">
                  <SmartImage
                    localSrc={as.iconLocal}
                    remoteSrc={as.iconRemote}
                    alt={as.icon}
                    className="mc-passive-icon"
                  />
                  <div className="mc-passive-content">
                    <div className="mc-passive-title">
                      <span>
                        追加技能 {i + 1}：{as.nameCn}
                      </span>
                      {as.nameJp && <small className="mc-text-muted">{as.nameJp}</small>}
                    </div>
                    <div className="mc-passive-desc">
                      <FormattedEffectText text={as.effect} />
                    </div>
                  </div>
                </div>
                {!isSingle && (
                  <div className="mc-effect-values-grid10">
                    {as.values.slice(0, 10).map((val, vIdx) => (
                      <div
                        key={vIdx}
                        className={`mc-val-cell ${vIdx === 5 || vIdx === 9 ? 'mc-val-highlight' : ''}`}
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
      )}
    </div>
  );
};
