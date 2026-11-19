import React, { useState, useMemo, useRef } from 'react';
import { X, RotateCcw, Search, Filter, CheckSquare, Sparkles } from 'lucide-react';
import { CeFilterState, CraftEssenceSummary } from '../types';
import { SmartImage } from './SmartImage';
import { BackToTopButton } from './BackToTopButton';
import { useBackClose } from '../utils/backNavigation';

interface CeFilterModalProps {
  open: boolean;
  onClose: () => void;
  filters: CeFilterState;
  onChange: (next: CeFilterState) => void;
  onReset: () => void;
  effectGroups: { group: string; tags: string[] }[];
  matchedCes: CraftEssenceSummary[];
  onSelectCe: (id: number) => void;
}

const CE_RARITIES = [
  { value: 5, label: '★★★★★ (5星)' },
  { value: 4, label: '★★★★ (4星)' },
  { value: 3, label: '★★★ (3星)' },
  { value: 2, label: '★★ (2星)' },
  { value: 1, label: '★ (1星)' },
];

const CE_CATEGORY_OPTIONS = [
  '普通概念礼装',
  '牵绊概念礼装',
  '纪念概念礼装',
  '情人节概念礼装',
  '魔力棱镜兑换概念礼装',
  '概念礼装EXP卡',
];

const CE_STAT_TYPES = [
  { value: '纯ATK', label: '纯 ATK 加成' },
  { value: 'ATK/HP均衡', label: 'ATK + HP 双加成' },
  { value: '纯HP', label: '纯 HP 加成' },
  { value: '特殊/零属性', label: '特殊 / 零属性' },
];

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export const CeFilterModal: React.FC<CeFilterModalProps> = ({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  effectGroups,
  matchedCes,
  onSelectCe,
}) => {
  const [tagSearch, setTagSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useBackClose(open, onClose);

  const searchTokens = useMemo(
    () =>
      tagSearch
        .trim()
        .toLowerCase()
        .split(/[\s,，、]+/)
        .filter(Boolean),
    [tagSearch]
  );

  const searchedTagList = useMemo(() => {
    if (searchTokens.length === 0) return [];
    const allTags = Array.from(new Set(effectGroups.flatMap((g) => g.tags)));
    return allTags.filter((t) =>
      searchTokens.some((tok) => t.toLowerCase().includes(tok))
    );
  }, [effectGroups, searchTokens]);

  if (!open) return null;

  const matchedCount = matchedCes.length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="filter-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="filter-drawer-header">
          <div className="filter-drawer-title">
            <Filter size={18} />
            <span>概念礼装多维筛选</span>
            <span className="filter-match-badge">匹配 {matchedCount} 张</span>
          </div>
          <div className="filter-header-actions">
            <button type="button" className="btn-reset" onClick={onReset}>
              <RotateCcw size={15} />
              <span>重置</span>
            </button>
            <button type="button" className="btn-icon-close" onClick={onClose} aria-label="关闭">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="filter-drawer-body" ref={scrollRef}>
          {/* 1. 星级 */}
          <section className="filter-section">
            <div className="filter-sec-header">
              <h4>星级（稀有度）</h4>
              {filters.rarities.length > 0 && (
                <button
                  type="button"
                  className="btn-clear-sec"
                  onClick={() => onChange({ ...filters, rarities: [] })}
                >
                  清除
                </button>
              )}
            </div>
            <div className="filter-chips-grid">
              {CE_RARITIES.map((opt) => {
                const active = filters.rarities.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`filter-chip ${active ? 'active rarity-chip' : ''}`}
                    onClick={() =>
                      onChange({ ...filters, rarities: toggleItem(filters.rarities, opt.value) })
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. 礼装种类 */}
          <section className="filter-section">
            <div className="filter-sec-header">
              <h4>礼装种类</h4>
              {filters.categories.length > 0 && (
                <button
                  type="button"
                  className="btn-clear-sec"
                  onClick={() => onChange({ ...filters, categories: [] })}
                >
                  清除
                </button>
              )}
            </div>
            <div className="filter-chips-wrap">
              {CE_CATEGORY_OPTIONS.map((cat) => {
                const active = filters.categories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`filter-chip ${active ? 'active' : ''}`}
                    onClick={() =>
                      onChange({ ...filters, categories: toggleItem(filters.categories, cat) })
                    }
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. 属性加成倾向 (纯ATK / 纯HP / 均衡) */}
          <section className="filter-section">
            <div className="filter-sec-header">
              <h4>ATK / HP 属性倾向</h4>
              {filters.statTypes.length > 0 && (
                <button
                  type="button"
                  className="btn-clear-sec"
                  onClick={() => onChange({ ...filters, statTypes: [] })}
                >
                  清除
                </button>
              )}
            </div>
            <div className="filter-chips-wrap">
              {CE_STAT_TYPES.map((st) => {
                const active = filters.statTypes.includes(st.value);
                return (
                  <button
                    key={st.value}
                    type="button"
                    className={`filter-chip ${active ? 'active' : ''}`}
                    onClick={() =>
                      onChange({ ...filters, statTypes: toggleItem(filters.statTypes, st.value) })
                    }
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 4. 礼装效果标签（支持多词空格搜索 + AND/OR 切换 + 实时预览） */}
          <section className="filter-section" style={{ borderBottom: 'none', marginBottom: 4 }}>
            <div className="filter-sec-header">
              <h4>效果标签（已选 {filters.effectTags.length} 项）</h4>
              <div className="trait-mode-toggle">
                <button
                  type="button"
                  className={`mode-btn ${filters.tagMatchMode === 'AND' ? 'active' : ''}`}
                  onClick={() => onChange({ ...filters, tagMatchMode: 'AND' })}
                  title="同时包含所选的全部效果（如：初始NP + 宝具威力提升）"
                >
                  同时满足(AND)
                </button>
                <button
                  type="button"
                  className={`mode-btn ${filters.tagMatchMode === 'OR' ? 'active' : ''}`}
                  onClick={() => onChange({ ...filters, tagMatchMode: 'OR' })}
                  title="包含所选任意一项效果"
                >
                  满足任一(OR)
                </button>
                {filters.effectTags.length > 0 && (
                  <button
                    type="button"
                    className="btn-clear-sec"
                    onClick={() => onChange({ ...filters, effectTags: [] })}
                  >
                    清除
                  </button>
                )}
              </div>
            </div>

            <div className="trait-search-bar">
              <Search size={15} />
              <input
                type="text"
                placeholder="用空格分隔搜索多个效果标签（如：NP Buster 暴击）..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
              />
              {searchedTagList.length > 0 && (
                <button
                  type="button"
                  className="trait-select-matches-btn"
                  onClick={() => {
                    const merged = Array.from(
                      new Set([...filters.effectTags, ...searchedTagList])
                    );
                    onChange({ ...filters, effectTags: merged });
                  }}
                >
                  <CheckSquare size={13} />
                  <span>全选匹配({searchedTagList.length})</span>
                </button>
              )}
              {tagSearch && (
                <button type="button" onClick={() => setTagSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            {filters.effectTags.length > 0 && (
              <div className="selected-traits-strip">
                <span className="strip-label">当前已选标签：</span>
                {filters.effectTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="selected-trait-tag"
                    onClick={() =>
                      onChange({
                        ...filters,
                        effectTags: filters.effectTags.filter((x) => x !== t),
                      })
                    }
                  >
                    <span>{t}</span>
                    <X size={12} />
                  </button>
                ))}
              </div>
            )}

            <div className="trait-groups-container">
              {effectGroups.map((grp) => {
                const visibleTags =
                  searchTokens.length > 0
                    ? grp.tags.filter((t) =>
                        searchTokens.some((tok) => t.toLowerCase().includes(tok))
                      )
                    : grp.tags;
                if (visibleTags.length === 0) return null;
                return (
                  <div key={grp.group} className="trait-group-card">
                    <div className="trait-group-title">{grp.group}</div>
                    <div className="filter-chips-wrap">
                      {visibleTags.map((t) => {
                        const active = filters.effectTags.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            className={`filter-chip filter-chip-sm ${active ? 'active' : ''}`}
                            onClick={() =>
                              onChange({
                                ...filters,
                                effectTags: toggleItem(filters.effectTags, t),
                              })
                            }
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 实时预览符合当前筛选的概念礼装（取前 60 张展示以保持丝滑响应） */}
            <div className="trait-live-preview-box">
              <div className="trait-live-preview-header">
                <Sparkles size={15} />
                <span>
                  符合当前条件的礼装（共 <strong>{matchedCount}</strong> 张，点击可直接查看）
                </span>
              </div>
              {matchedCount === 0 ? (
                <div className="trait-live-empty">暂无同时满足所选效果与条件的概念礼装</div>
              ) : (
                <div className="trait-live-grid">
                  {matchedCes.slice(0, 60).map((ce) => (
                    <button
                      key={ce.id}
                      type="button"
                      className="trait-live-svt-card"
                      onClick={() => {
                        onClose();
                        onSelectCe(ce.id);
                      }}
                    >
                      <div className="trait-live-avatar-wrap">
                        <SmartImage
                          localSrc={ce.iconLocal}
                          remoteSrc={ce.iconRemote}
                          alt={ce.nameCn}
                          className="trait-live-avatar"
                        />
                        <span className="trait-live-no">#{ce.id}</span>
                      </div>
                      <span className="trait-live-name">{ce.nameCn}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <BackToTopButton targetRef={scrollRef} variant="drawer" />

        <div className="filter-drawer-footer">
          <button type="button" className="btn-primary-full" onClick={onClose}>
            完成筛选并返回列表（共 {matchedCount} 张礼装）
          </button>
        </div>
      </div>
    </div>
  );
};
