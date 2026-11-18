import React, { useState } from 'react';
import { X, RotateCcw, Search, Filter } from 'lucide-react';
import { ServantFilterState, TraitGroup } from '../types';
import { SmartImage } from './SmartImage';

interface ServantFilterModalProps {
  open: boolean;
  onClose: () => void;
  filters: ServantFilterState;
  onChange: (next: ServantFilterState) => void;
  onReset: () => void;
  traitGroups: TraitGroup[];
  matchedCount: number;
}

const RARITY_OPTIONS = [
  { value: 5, label: '★★★★★ (5星)' },
  { value: 4, label: '★★★★ (4星)' },
  { value: 3, label: '★★★ (3星)' },
  { value: 2, label: '★★ (2星)' },
  { value: 1, label: '★ (1星)' },
  { value: 0, label: '☆ (0星)' },
];

const CLASS_OPTIONS = [
  { value: 'Saber', label: 'Saber' },
  { value: 'Archer', label: 'Archer' },
  { value: 'Lancer', label: 'Lancer' },
  { value: 'Rider', label: 'Rider' },
  { value: 'Caster', label: 'Caster' },
  { value: 'Assassin', label: 'Assassin' },
  { value: 'Berserker', label: 'Berserker' },
  { value: 'Shielder', label: 'Shielder' },
  { value: 'Ruler', label: 'Ruler' },
  { value: 'Avenger', label: 'Avenger' },
  { value: 'MoonCancer', label: 'MoonCancer' },
  { value: 'Alterego', label: 'Alterego' },
  { value: 'Foreigner', label: 'Foreigner' },
  { value: 'Pretender', label: 'Pretender' },
  { value: 'Beast', label: 'Beast' },
];

const NP_COLOR_OPTIONS = [
  { value: 'Buster', label: 'Buster (红卡)' },
  { value: 'Arts', label: 'Arts (蓝卡)' },
  { value: 'Quick', label: 'Quick (绿卡)' },
];

const NP_TYPE_OPTIONS = [
  { value: '全体', label: '全体攻击 (光炮)' },
  { value: '单体', label: '单体攻击' },
  { value: '辅助', label: '辅助宝具' },
];

const NP_KIND_OPTIONS = [
  '对人宝具',
  '对军宝具',
  '对城宝具',
  '对界宝具',
  '对国宝具',
  '结界宝具',
  '对神宝具',
  '对王宝具',
  '对龙宝具',
  '对星宝具',
];

const METHOD_OPTIONS = [
  '期间限定',
  '圣晶石常驻',
  '剧情限定',
  '活动赠送',
  '友情点召唤',
  '初始获得',
  '无法召唤',
];

function toggleItem<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export const ServantFilterModal: React.FC<ServantFilterModalProps> = ({
  open,
  onClose,
  filters,
  onChange,
  onReset,
  traitGroups,
  matchedCount,
}) => {
  const [traitSearch, setTraitSearch] = useState('');

  if (!open) return null;

  const q = traitSearch.trim().toLowerCase();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="filter-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="filter-drawer-header">
          <div className="filter-drawer-title">
            <Filter size={18} />
            <span>英灵多维筛选</span>
            <span className="filter-match-badge">匹配 {matchedCount} 骑</span>
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

        <div className="filter-drawer-body">
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
              {RARITY_OPTIONS.map((opt) => {
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

          {/* 2. 职阶 */}
          <section className="filter-section">
            <div className="filter-sec-header">
              <h4>职阶（Class）</h4>
              {filters.classes.length > 0 && (
                <button
                  type="button"
                  className="btn-clear-sec"
                  onClick={() => onChange({ ...filters, classes: [] })}
                >
                  清除
                </button>
              )}
            </div>
            <div className="filter-class-grid">
              {CLASS_OPTIONS.map((cls) => {
                const active = filters.classes.includes(cls.value);
                return (
                  <button
                    key={cls.value}
                    type="button"
                    className={`filter-class-btn ${active ? 'active' : ''}`}
                    onClick={() =>
                      onChange({ ...filters, classes: toggleItem(filters.classes, cls.value) })
                    }
                  >
                    <SmartImage
                      localSrc={`/assets/icons/ui/金卡${cls.value}.png`}
                      alt={cls.label}
                      className="filter-class-icon"
                    />
                    <span>{cls.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. 宝具颜色 & 4. 宝具种类 */}
          <section className="filter-section">
            <div className="filter-sec-header">
              <h4>宝具颜色与宝具种类</h4>
              {(filters.npColors.length > 0 ||
                filters.npTypes.length > 0 ||
                filters.npKinds.length > 0) && (
                <button
                  type="button"
                  className="btn-clear-sec"
                  onClick={() =>
                    onChange({ ...filters, npColors: [], npTypes: [], npKinds: [] })
                  }
                >
                  清除
                </button>
              )}
            </div>
            <div className="filter-sub-label">宝具颜色</div>
            <div className="filter-chips-row">
              {NP_COLOR_OPTIONS.map((col) => {
                const active = filters.npColors.includes(col.value);
                return (
                  <button
                    key={col.value}
                    type="button"
                    className={`filter-chip filter-chip-card filter-chip-${col.value.toLowerCase()} ${
                      active ? 'active' : ''
                    }`}
                    onClick={() =>
                      onChange({ ...filters, npColors: toggleItem(filters.npColors, col.value) })
                    }
                  >
                    <SmartImage
                      localSrc={`/assets/icons/ui/${col.value}.png`}
                      alt={col.value}
                      className="chip-mini-icon"
                    />
                    <span>{col.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="filter-sub-label" style={{ marginTop: 10 }}>
              宝具范围类型
            </div>
            <div className="filter-chips-row">
              {NP_TYPE_OPTIONS.map((tp) => {
                const active = filters.npTypes.includes(tp.value);
                return (
                  <button
                    key={tp.value}
                    type="button"
                    className={`filter-chip ${active ? 'active' : ''}`}
                    onClick={() =>
                      onChange({ ...filters, npTypes: toggleItem(filters.npTypes, tp.value) })
                    }
                  >
                    {tp.label}
                  </button>
                );
              })}
            </div>

            <div className="filter-sub-label" style={{ marginTop: 10 }}>
              宝具细分种类
            </div>
            <div className="filter-chips-wrap">
              {NP_KIND_OPTIONS.map((kd) => {
                const active = filters.npKinds.includes(kd);
                return (
                  <button
                    key={kd}
                    type="button"
                    className={`filter-chip filter-chip-sm ${active ? 'active' : ''}`}
                    onClick={() =>
                      onChange({ ...filters, npKinds: toggleItem(filters.npKinds, kd) })
                    }
                  >
                    {kd}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 5. 获取途径 */}
          <section className="filter-section">
            <div className="filter-sec-header">
              <h4>获取途径</h4>
              {filters.methods.length > 0 && (
                <button
                  type="button"
                  className="btn-clear-sec"
                  onClick={() => onChange({ ...filters, methods: [] })}
                >
                  清除
                </button>
              )}
            </div>
            <div className="filter-chips-wrap">
              {METHOD_OPTIONS.map((m) => {
                const active = filters.methods.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    className={`filter-chip ${active ? 'active' : ''}`}
                    onClick={() =>
                      onChange({ ...filters, methods: toggleItem(filters.methods, m) })
                    }
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 6. 特性分类（同类特性归到一起） */}
          <section className="filter-section">
            <div className="filter-sec-header">
              <h4>特性分类（已选 {filters.traits.length} 项）</h4>
              <div className="trait-mode-toggle">
                <button
                  type="button"
                  className={`mode-btn ${filters.traitMatchMode === 'AND' ? 'active' : ''}`}
                  onClick={() => onChange({ ...filters, traitMatchMode: 'AND' })}
                  title="同时具备所选的全部特性"
                >
                  同时满足(AND)
                </button>
                <button
                  type="button"
                  className={`mode-btn ${filters.traitMatchMode === 'OR' ? 'active' : ''}`}
                  onClick={() => onChange({ ...filters, traitMatchMode: 'OR' })}
                  title="具备所选的任意一项特性"
                >
                  满足任一(OR)
                </button>
                {filters.traits.length > 0 && (
                  <button
                    type="button"
                    className="btn-clear-sec"
                    onClick={() => onChange({ ...filters, traits: [] })}
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
                placeholder="快速检索特性（如：神性、龙、圆桌、人科、善...）"
                value={traitSearch}
                onChange={(e) => setTraitSearch(e.target.value)}
              />
              {traitSearch && (
                <button type="button" onClick={() => setTraitSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="trait-groups-container">
              {traitGroups.map((grp) => {
                const visibleTraits = q
                  ? grp.traits.filter((t) => t.toLowerCase().includes(q))
                  : grp.traits;
                if (visibleTraits.length === 0) return null;
                return (
                  <div key={grp.group} className="trait-group-card">
                    <div className="trait-group-title">{grp.group}</div>
                    <div className="filter-chips-wrap">
                      {visibleTraits.map((t) => {
                        const active = filters.traits.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            className={`filter-chip filter-chip-sm ${active ? 'active' : ''}`}
                            onClick={() =>
                              onChange({ ...filters, traits: toggleItem(filters.traits, t) })
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
          </section>
        </div>

        <div className="filter-drawer-footer">
          <button type="button" className="btn-primary-full" onClick={onClose}>
            查看筛选结果（共 {matchedCount} 骑英灵）
          </button>
        </div>
      </div>
    </div>
  );
};
