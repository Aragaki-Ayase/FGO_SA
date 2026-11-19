# 项目工作交接文档（HANDOFF）

## 1. 目标与状态

- **目标**：基于 Mooncell（`fgo.wiki`）离线图鉴数据构建美观顺滑的 Android / Web 移动端图鉴 App，涵盖英灵图鉴与礼装图鉴、图1/图2样式带框缩略图展示、多维筛选与实时预览、图3/图4样式的技能与宝具多阶段切换展示、从者完整羁绊数据、礼装效果标签自动归类与筛选、压缩缩略图预打包与卡面放大下载原图、非阻塞后台网站数据更新，以及安卓系统返回键/边缘侧滑手势逐层退出。
- **已完成**：
  1. **原始数据库与语音补齐（`data/mooncell.sqlite3`）**：包含 487 骑英灵、2,719 张概念礼装、核心解析模板、476 个英灵语音子页面，以及新增采集的 `御主装备`（28 套魔术礼装）、`灵衣一览`（154 套灵衣）、171 个 `分类:道具` 页面与 `模板:周常规划/data` / `sample`（全站自由关卡掉落效率数据）。
  2. **结构化解析器（[build_app_data.py](file:///d:/git_proj/FGO_SA/build_app_data.py) & [build_extras_data.py](file:///d:/git_proj/FGO_SA/build_extras_data.py)）**：
     - 解析从者基础数值、`<tabber>` / `{{强化信息}}` / `{{复合标签}}` 多阶段技能与宝具、职阶与追加技能 1~5、素材需求、个人资料与语音。
     - **新增从者羁绊数据**：解析 `{{牵绊点数}}` Lv.1~Lv.10 单级需求，结合梦火 Lv.11~Lv.15 经验、各星级圣晶石/苹果/硬币达成奖励、专属牵绊礼装完整属性与背景解说文本。
     - **新增概念礼装效果标签与属性倾向**：自动从全部 2,719 张礼装（含中/日文描述）提取 7 大类 30 种效果标签（如 `初始NP`、`Buster性能提升`、`暴击威力提升`、`宝具威力提升`、`无敌贯通` 等）及 `纯ATK / ATK+HP均衡 / 纯HP / 特殊` 属性倾向。
     - **新增魔术礼装 / 灵衣一览 / 道具与掉落效率（`extras_catalog.json`）**：解析 28 套魔术礼装、154 套灵衣及 171 项道具，计算 108 种可刷取素材在各自由关卡的每个所需 AP 均值、每场掉落率均值、消耗 AP、牵绊与样本数。
  3. **全量离线缩略图下载与压缩（[download_assets.py](file:///d:/git_proj/FGO_SA/download_assets.py)）**：7,599 张图标与 Pillow WebP 压缩立绘已预打包至 `app/public/assets/`。
  4. **移动端 App 与 Android 交互增强（[app/](file:///d:/git_proj/FGO_SA/app/package.json)）**：
     - **在线更新跨域修复**：网页端通过 [vite.config.ts](file:///d:/git_proj/FGO_SA/app/vite.config.ts) `/mooncell-api` 反向代理绕过 Mooncell CORS 限制；安卓端通过 `CapacitorHttp` 原生网络栈请求。
     - **特性与礼装标签多词搜索 + 实时预览**：支持空格分隔同时搜索多个特性/标签，并在筛选抽屉底部实时展示符合条件的从者/礼装带框缩略图。
     - **防换行布局优化**：详情页分栏按钮（`.detail-nav-tabs`）与技能/宝具多阶段切换栏（`.mc-stage-tabs`）强制单行自适应展示，杜绝窄屏文字折行。
     - **强化技能/宝具默认优先展示**：在 [SkillAndNpTables.tsx](file:///d:/git_proj/FGO_SA/app/src/components/SkillAndNpTables.tsx) 中新增 `getDefaultVariantIndex`，对存在强化的持有技能和宝具默认优先选中最高强化后的变体（如 `强化后`、`强化后2`、`强化后 (Buster)`），无强化项则保持默认第 1 项。
     - **从者语音点播与按需离线缓存**：在 [build_app_data.py](file:///d:/git_proj/FGO_SA/build_app_data.py) 中解析每条语音的 `audioUrl`，通过 [voicePlayer.ts](file:///d:/git_proj/FGO_SA/app/src/services/voicePlayer.ts) 与 Vite `/mooncell-media` 代理实现即点即播、自动互斥、播放后后台自动缓存及单个从者语音包一键离线缓存（Cache Storage）。
     - **双通道全模块自动更新与本地持久化（[update_cloud_data.py](file:///d:/git_proj/FGO_SA/update_cloud_data.py)、[update-catalog-data.yml](file:///d:/git_proj/FGO_SA/.github/workflows/update-catalog-data.yml)、[dataService.ts](file:///d:/git_proj/FGO_SA/app/src/services/dataService.ts)）**：
       - **云端通道（方案 1）**：GitHub Actions 每周一自动运行（支持手动触发）增量同步 Mooncell 与 Atlas Academy 数据并生成带 28+ 分片 SHA-256 哈希的 `cloud_manifest.json`；App 点击「更新数据」或启动自动同步时，通过 jsDelivr 国内加速 + GitHub Raw 双线路按哈希差异增量拉取变化的英灵完整技能/宝具/羁绊分片、概念礼装分片、魔术礼装、灵衣、素材掉落效率数据包并持久化至 IndexedDB `data_blobs`（下次离线直接生效，新增图片自动走远端 CDN 兜底显示）。
       - **源站直连通道**：同时继续直连 Mooncell SMW（最新 60 活动 / 80 卡池）与 Atlas Academy CN（最新主线/活动剧情目录与日服实装日期）实时补齐，任一通道异常均不阻断另一通道。
     - **活动一览 / 活动关卡配置 / 卡池一览（[collect_events_banners.py](file:///d:/git_proj/FGO_SA/collect_events_banners.py) & [EventsBannersView.tsx](file:///d:/git_proj/FGO_SA/app/src/components/EventsBannersView.tsx)）**：全量采集 692 个活动与 698 个卡池入 `events_banners.json`，支持国/日服进行中与未来视筛选、卡池 UP 从者/礼装带框头像点击跳详情，以及按需拉取并 IndexedDB 离线缓存各活动与主线章节的 `/关卡配置`（仅保留主线/自由/高难等顶级大类目录，移除错位面包屑并屏蔽外部 Mooncell 链接跳转）。
     - **关卡配置中心与层级返回导航（[QuestConfigHub.tsx](file:///d:/git_proj/FGO_SA/app/src/components/QuestConfigHub.tsx) & [EventsBannersView.tsx](file:///d:/git_proj/FGO_SA/app/src/components/EventsBannersView.tsx)）**：底部导航以「关卡配置」替代「活动」，采用适配手机端的 7 大彩色卡片分类（活动关卡、迦勒底之门、主线剧情 6 大部、冠位戴冠战、亚兹拉尔之庙、主线物语、自由关卡），全部子选项支持层级下钻并通过 `useBackClose` 实现按系统返回键/侧滑手势逐级退回上一级选项。
     - **更新提示框渐变消失与按钮文案精简**：顶部同步状态浮动框支持渐入与 450ms 透明度+位移渐变淡出动画；顶部同步按钮文案精简为「更新数据」。
     - **卡池 UP 列表展开/收起（[EventsBannersView.tsx](file:///d:/git_proj/FGO_SA/app/src/components/EventsBannersView.tsx)）**：`BannerCard` 中超出 16 个的 `+N 骑` / `+N 张` 占位升级为可点击按钮，支持一键展开查看并点击所有未显示的 UP 从者与概念礼装，以及随时收起。
     - **全页面右下角「回到顶部」悬浮按钮（[BackToTopButton.tsx](file:///d:/git_proj/FGO_SA/app/src/components/BackToTopButton.tsx)）**：覆盖主列表容器（全部 8 个标签页及关卡配置/剧情所有层级）、全部详情弹窗（英灵/礼装/活动/主线关卡/魔术礼装/灵衣/道具/剧情阅读器）以及英灵/礼装筛选抽屉，滚动超过 220px 自动渐显，点击平滑返回顶部。
     - **中文剧情阅读器与阅读进度记忆（[collect_story_wars.py](file:///d:/git_proj/FGO_SA/collect_story_wars.py)、[storyService.ts](file:///d:/git_proj/FGO_SA/app/src/services/storyService.ts)、[StoryHub.tsx](file:///d:/git_proj/FGO_SA/app/src/components/StoryHub.tsx)）**：采用方案 A，内置 Atlas Academy CN 剧情目录索引（31 篇真实主线 + 156 篇含日服实装日期的活动，已剔除 `11000/12000/13000/14000/40201~40501` 空壳总览容器）与 5 张分类横幅图 + 31 张真实对应主线章节离线横幅图（`app/public/assets/story/wars/war_*.webp`，彻底修复 2.3~2.7 与奏章 `warId != capId` 的图片错位）；底部导航固定 8 列均分（手机端无需横向滑动），且再次点击任意底部按钮均返回该页主界面并平滑回到顶部；剧情首页与具体章节列表均采用横幅图片卡片（无图自动降级文字卡）；子页标题栏吸顶悬浮并美化刷新按钮；剧情阅读器采用全屏独立页面（非抽屉），自动剔除演出特效与过滤提示框，支持图文/纯文本切换、上一节/下一节连读、低速串行一键离线缓存整章文本、IndexedDB 离线缓存以及 `localStorage` 章节阅读进度记忆（重开已读章节可弹窗选择「继续上次进度」并恢复滚动位置，或「查看章节目录」）。
     - **安卓系统返回键与边缘侧滑手势支持**：通过 [backNavigation.ts](file:///d:/git_proj/FGO_SA/app/src/utils/backNavigation.ts) 历史栈钩子与 Android [MainActivity.java](file:///d:/git_proj/FGO_SA/app/android/app/src/main/java/wiki/fgo/mooncell/offline/MainActivity.java) `OnBackPressedCallback` 联动，按「卡面大图查看器 → 从者/礼装详情页 → 筛选抽屉」优先级逐层关闭界面。

---

## 2. 关键改动与决策

- **[app/vite.config.ts](file:///d:/git_proj/FGO_SA/app/vite.config.ts) & [app/src/services/dataService.ts](file:///d:/git_proj/FGO_SA/app/src/services/dataService.ts)**：
  - **踩坑注意**：`https://fgo.wiki/api.php` 未配置 `$wgCrossSiteAJAXdomains`，浏览器直接请求即使带 `origin=*` 也会因缺少 `Access-Control-Allow-Origin` 响应头报错。通过 Vite 代理 `/mooncell-api`（Web 端）与 `CapacitorHttp`（Android 原生端）彻底解决。
- **[build_app_data.py](file:///d:/git_proj/FGO_SA/build_app_data.py)**：
  - 新增 `parse_bond_points`、`extract_ce_effect_tags` 与 `classify_ce_stat_type`，输出 `bondPoints`、`ceEffectGroups`、`effectTags`、`statType`。
- **[app/src/components/ServantFilterModal.tsx](file:///d:/git_proj/FGO_SA/app/src/components/ServantFilterModal.tsx) & [CeFilterModal.tsx](file:///d:/git_proj/FGO_SA/app/src/components/CeFilterModal.tsx)**：
  - 支持空格/逗号分隔多关键词同时检索，底部内嵌实时匹配结果网格，点击头像可直接打开对应从者或礼装详情。
- **[app/src/components/ServantDetailModal.tsx](file:///d:/git_proj/FGO_SA/app/src/components/ServantDetailModal.tsx)**：
  - 新增「❤️ 羁绊数据」独立分栏，整合专属牵绊礼装效果与解说故事、Lv.1~Lv.15 单级/累计牵绊表与奖励、以及牵绊等级专属语音。
- **[app/src/utils/backNavigation.ts](file:///d:/git_proj/FGO_SA/app/src/utils/backNavigation.ts) & [MainActivity.java](file:///d:/git_proj/FGO_SA/app/android/app/src/main/java/wiki/fgo/mooncell/offline/MainActivity.java)**：
  - 使用分层 History 状态栈拦截浏览器 `popstate`、`Escape` 键与 Android 系统返回手势。

---

## 3. 验证结果

- 运行 `python -X utf8 build_app_data.py`：成功重新生成包含羁绊点数与礼装效果标签的 487 骑英灵 + 2,719 张礼装结构化数据。
- 运行 `app\node_modules\.bin\tsc.cmd -p app\tsconfig.json --noEmit`：**0 错误通过**。

---

## 4. 下一步

1. **在浏览器测试全部新功能**：
   - 直接双击仓库根目录的 [start_web.bat](file:///d:/git_proj/FGO_SA/start_web.bat) 即可启动服务并自动打开默认浏览器（或命令行运行 `npm run dev --prefix app`）。
2. **构建生产包或推送到 GitHub 自动打包 APK**：
   - 本地生产构建验证：`npm run build --prefix app`
   - 推送至 GitHub 触发云端 APK 打包：`git add . && git commit -m "Enhance sync, traits, bond tab, CE tags and back navigation" && git push origin main`
