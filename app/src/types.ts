export interface TraitGroup {
  group: string;
  traits: string[];
}

export interface ServantSummary {
  id: number;
  svtId: string;
  title: string;
  nameCn: string;
  nameJp: string;
  nameEn: string;
  aliases: string;
  rarity: number;
  className: string;
  rawClass: string;
  method: string;
  npColors: string[];
  npTypes: string[];
  npKinds: string[];
  traits: string[];
  atkMax: number;
  hpMax: number;
  iconLocal: string;
  iconRemote: string;
}

export interface NpEffect {
  text: string;
  values: string[];
  target: string;
}

export interface NpVariant {
  tabLabel: string;
  cond: string;
  nameCn: string;
  rubyCn: string;
  nameJp: string;
  rubyJp: string;
  card: string;
  type: string;
  rank: string;
  kind: string;
  effects: NpEffect[];
}

export interface SkillEffect {
  text: string;
  values: string[];
}

export interface SkillVariant {
  tabLabel: string;
  cond: string;
  icon: string;
  iconLocal: string;
  iconRemote: string;
  nameCn: string;
  nameJp: string;
  cd: number | null;
  effects: SkillEffect[];
}

export interface ActiveSkillSlot {
  slotTitle: string;
  variants: SkillVariant[];
}

export interface ClassSkill {
  icon: string;
  iconLocal: string;
  iconRemote: string;
  nameCn: string;
  rank: string;
  effect: string;
}

export interface AppendSkill {
  id: string;
  icon: string;
  iconLocal: string;
  iconRemote: string;
  nameCn: string;
  nameJp: string;
  effect: string;
  values: string[];
}

export interface MaterialItem {
  name: string;
  count: string;
  iconLocal: string;
  iconRemote: string;
}

export interface MaterialStage {
  stage: string;
  items: MaterialItem[];
}

export interface AscensionArt {
  label: string;
  file: string;
  thumbLocal: string;
  thumbRemote: string;
  fullUrl: string;
}

export interface BondCeRef {
  id: number;
  nameCn: string;
  iconLocal: string;
  iconRemote: string;
  des: string;
  introCn?: string;
}

export interface ProfileSection {
  title: string;
  cond: string;
  textCn: string;
  textJp: string;
}

export interface VoiceItem {
  title: string;
  textCn: string;
  textJp: string;
  audioFile?: string;
  audioUrl?: string;
}

export interface VoiceSection {
  section: string;
  items: VoiceItem[];
}

export interface ServantDetail extends ServantSummary {
  cv: string;
  illustrator: string;
  gender: string;
  height: string;
  weight: string;
  attr1: string;
  attr2: string;
  subAttr: string;
  stats: {
    atkBase: string;
    hpBase: string;
    atkMax: string;
    hpMax: string;
    atk90: string;
    hp90: string;
    atk100: string;
    hp100: string;
    atk120: string;
    hp120: string;
  };
  params: {
    str: string;
    end: string;
    agi: string;
    mp: string;
    luk: string;
    np: string;
  };
  cards: string[];
  npRates: {
    Q: string;
    A: string;
    B: string;
    EX: string;
    NP: string;
    def: string;
  };
  hits: {
    Q: string;
    A: string;
    B: string;
    EX: string;
    NP: string;
  };
  starRate: string;
  deathRate: string;
  critWeight: string;
  traitDetails: { name: string; note: string }[];
  ascensions: AscensionArt[];
  noblePhantasms: NpVariant[];
  activeSkills: ActiveSkillSlot[];
  classSkills: ClassSkill[];
  appendSkills: AppendSkill[];
  materials: {
    ascension: MaterialStage[];
    skill: MaterialStage[];
    appendSkill: MaterialStage[];
  };
  bondPoints?: number[];
  bondCe: BondCeRef | null;
  profile: ProfileSection[];
  voices: VoiceSection[];
  sourceUrl: string;
  revisionId: number;
  updatedAt: string;
}

export interface CraftEssenceSummary {
  id: number;
  title: string;
  nameCn: string;
  nameJp: string;
  aliases: string;
  rarity: number;
  category: string;
  type: string;
  statType?: string;
  cost: string;
  hp: string;
  atk: string;
  des: string;
  desMax: string;
  effectTags?: string[];
  iconLocal: string;
  iconRemote: string;
  skillIconLocal: string;
  skillIconRemote: string;
}

export interface CraftEssenceDetail extends CraftEssenceSummary {
  illustrator: string;
  characters: string[];
  bondServant: string;
  introCn: string;
  introJp: string;
  cardThumbLocal: string;
  cardThumbRemote: string;
  cardFullUrl: string;
}

export interface CatalogSummaryPayload {
  generatedAt: string;
  counts: {
    servant: number;
    craftEssence: number;
  };
  traitGroups: TraitGroup[];
  ceEffectGroups?: { group: string; tags: string[] }[];
  servants: ServantSummary[];
  craftEssences: CraftEssenceSummary[];
}

export interface CeFilterState {
  rarities: number[];
  categories: string[];
  statTypes: string[];
  effectTags: string[];
  tagMatchMode: 'AND' | 'OR';
}

export interface MysticCodeSkill {
  icon: string;
  iconLocal: string;
  iconRemote: string;
  nameCn: string;
  nameJp: string;
  cd: number | null;
  effects: SkillEffect[];
}

export interface MysticCode {
  id: number;
  nameCn: string;
  nameJp: string;
  descCn: string;
  descJp: string;
  obtain: string;
  expCurve: number[];
  arts: AscensionArt[];
  skills: MysticCodeSkill[];
}

export interface CostumeItem {
  id: number;
  servant: string;
  nameCn: string;
  nameJp: string;
  descCn: string;
  descJp: string;
  obtain: string;
  materials: MaterialItem[];
  iconLocal: string;
  iconRemote: string;
  artThumbLocal: string;
  artThumbRemote: string;
  artFullUrl: string;
}

export interface ItemDropQuest {
  chapter: string;
  location: string;
  questCn: string;
  questJp: string;
  ap: number;
  bond: number;
  exp: number;
  samples: number;
  dropRate: string;
  dropRateNum: number;
  apPerDrop: number;
  otherDrops: { name: string; rate: string }[];
}

export interface GameItem {
  id: number;
  itemId: string;
  nameCn: string;
  nameJp: string;
  nameEn: string;
  rarity: number;
  categoryGroup: string;
  rawCategories: string[];
  descCn: string;
  descJp: string;
  iconLocal: string;
  iconRemote: string;
  iconFallback: string;
  dropCount: number;
  bestQuest: {
    chapter: string;
    location: string;
    questCn: string;
    ap: number;
    apPerDrop: number;
    dropRate: string;
  } | null;
  dropQuests: ItemDropQuest[];
}

export interface ExtrasCatalogPayload {
  counts: {
    mysticCode: number;
    costume: number;
    item: number;
    itemsWithDrops: number;
  };
  mysticCodes: MysticCode[];
  costumes: CostumeItem[];
  items: GameItem[];
}

export interface EventSummary {
  title: string;
  nameCn: string;
  nameJp: string;
  startCn: number;
  endCn: number;
  startJp: number;
  endJp: number;
  type: string;
  server: string;
  bannerThumb: string;
  bannerFull: string;
}

export interface BannerSummary {
  title: string;
  titleCn: string;
  titleJp: string;
  startCn: number;
  endCn: number;
  startJp: number;
  endJp: number;
  bannerThumb: string;
  bannerFull: string;
  servants: string[];
  ces: string[];
  luckybag: boolean;
}

export interface EventsBannersPayload {
  generatedAt: string;
  counts: {
    events: number;
    banners: number;
  };
  events: EventSummary[];
  banners: BannerSummary[];
}

export interface EventQuestConfigData {
  pageTitle: string;
  isSubpage: boolean;
  sections: { index: string; line: string; anchor: string; level: string }[];
  html: string;
  fetchedAt: string;
}

export interface ServantFilterState {
  rarities: number[];
  classes: string[];
  npColors: string[];
  npTypes: string[];
  npKinds: string[];
  methods: string[];
  traits: string[];
  traitMatchMode: 'AND' | 'OR';
}

/* ========================= 剧情阅读器（Atlas Academy CN） ========================= */

export type StoryWarCategory = 'part1' | 'part15' | 'part2' | 'ordeal_call' | 'event';

export interface StoryWarSummary {
  id: number;
  eventId: number;
  category: StoryWarCategory;
  name: string;
  longName: string;
  banner: string;
  startJp?: number;
  startJpDate?: string;
}

export interface StoryWarsPayload {
  generatedAt: string;
  counts: {
    total: number;
    main: number;
    event: number;
  };
  wars: StoryWarSummary[];
}

export interface StoryScriptEntry {
  scriptId: string;
  scriptUrl: string;
  spotName: string;
  questName: string;
  phase: number;
  partLabel: string;
}

export interface StoryWarDetail {
  warId: number;
  name: string;
  longName: string;
  entries: StoryScriptEntry[];
  fetchedAt: string;
}

export type StoryBlock =
  | { type: 'bg'; url: string; id: string }
  | { type: 'cg'; url: string; name: string }
  | { type: 'narration'; text: string }
  | { type: 'dialogue'; speaker: string; text: string }
  | { type: 'choices'; options: { index: string; text: string }[] };

export interface ParsedStoryScript {
  scriptId: string;
  blocks: StoryBlock[];
  fetchedAt: string;
}

export interface WarReadProgress {
  warId: number;
  lastScriptId: string;
  lastEntryIndex: number;
  lastTitle: string;
  lastScrollTop: number;
  readScriptIds: string[];
  updatedAt: number;
}
