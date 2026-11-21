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
       - **云端通道（方案 1）**：GitHub Actions 每天北京时间 19:30 (UTC 11:30) 自动运行（支持手动触发）增量同步 Mooncell 与 Atlas Academy 数据并生成带 28+ 分片 SHA-256 哈希的 `cloud_manifest.json`；App 点击「更新数据」或启动自动同步时，通过 jsDelivr 国内加速 + GitHub Raw 双线路按哈希差异增量拉取变化的英灵完整技能/宝具/羁绊分片、概念礼装分片、魔术礼装、灵衣、素材掉落效率数据包并持久化至 IndexedDB `data_blobs`（下次离线直接生效，新增图片自动走远端 CDN 兜底显示）。
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

---

## 5. 本地 Android APK 打包记录（2026-11-19）

- **前端同步**：运行 `npm.cmd --prefix app run android:sync`，完成 Vite 生产构建（`3.39s`）并将前端资源及 7,635 个离线图片同步至 `app/android/app/src/main/assets/public`。
- **APK 编译**：使用本机 JDK 17（`C:\Users\Yu\.jdks\jbr-17.0.14`，兼容 Gradle 8.2.1）与 Android SDK（`C:\Users\Yu\AppData\Local\Android\Sdk`，含 `android-34`）执行 `.\gradlew.bat assembleDebug`，耗时 `1m 2s` 编译成功。
- **产物路径**：`app/android/app/build/outputs/apk/debug/app-debug.apk`（大小 `141.88 MB`，已包含全量离线数据与压缩图片，可直接传输至安卓手机安装）。

---

## 6. 活动剧情时间修正与剧情完整图片增强（2026-11-19）

- **活动时间来源修正与降序排序**：
  - 原脚本 [collect_story_wars.py](file:///e:/work/FGO_SA/collect_story_wars.py) 与 [storyService.ts](file:///e:/work/FGO_SA/app/src/services/storyService.ts) 仅从日服 `JP/basic_event.json` 拉取时间，导致国服活动标题与日服时间错位约 1 年。
  - 现已改为优先从国服 `CN/basic_event.json` 获取准确国服实装时间（`startCn` / `startCnDate`，UTC+8），国服已实装活动严格按 `startCn` 降序排列（最新在最上方，如 `2026-10-22 完结南瓜行星万圣节星球`），国服暂未实装的日服活动排在末尾并标注。
  - 升级了 `STORY_DATA_VERSION` 与 `STORY_OVERRIDES_KEY`（`story_wars_overrides_v3`），自动替换旧版日期缓存。
- **剧情图片完整补齐（参考 Atlas Academy DB）**：
  - 扩展 [types.ts](file:///e:/work/FGO_SA/app/src/types.ts)、[storyService.ts](file:///e:/work/FGO_SA/app/src/services/storyService.ts)、[StoryHub.tsx](file:///e:/work/FGO_SA/app/src/components/StoryHub.tsx) 与 [styles.css](file:///e:/work/FGO_SA/app/src/styles.css)。
  - 支持 `[enableFullScreen]` 宽屏高清背景（`back{id}_1344_626.png`，加载失败自动回退 `back{id}.png`）、`[sceneSet]`、`[imageSet]`/`[verticalImageSet]`/`[horizontalImageSet]`（取消对 `text`/`effect` 等有内容 CG 的误杀过滤）、`[equipSet]`（概念礼装/道具卡面）、`[charaSet]`/`[charaChange]`/`[charaCrossFade]` + 登场指令（角色立绘与名称角标）、`[pictureFrame]` 及行内 `[image]` 标记图，并支持点击任意剧情图片全屏放大预览。
  - 新增 `SCRIPT_PARSER_VERSION = 2`，旧版缺少图片的 IndexedDB 缓存会自动重新拉取解析。
- **验证与重新打包**：
  - `python -X utf8 collect_story_wars.py` 成功更新 [story_wars.json](file:///e:/work/FGO_SA/app/public/data/story_wars.json)（31 主线 + 156 活动）。
  - `tsc --noEmit` 0 错误通过，`npm.cmd --prefix app run android:sync` 与 `.\gradlew.bat assembleDebug`（`6s`）构建成功，最新 APK `app/android/app/build/outputs/apk/debug/app-debug.apk`（`142.34 MB`）。

---

## 7. 剧情章节重排、节号标注与 Atlas Academy 表情差分合成（2026-11-19）

- **章节内剧情重新排序与节号标注**：
  - 在 [storyService.ts](file:///e:/work/FGO_SA/app/src/services/storyService.ts) 的 `loadWarDetail` 中将 `spots` 下的全部剧情任务展平，改为按 `type === 'main'` 优先、`priority` 降序、`id` 升序排列，同任务内按 `phase` 升序排列。
  - 解析 `chapterSubStr`、`chapterSubId` 及标题前缀，生成明确的 `chapterLabel`（如 `第1节`、`序章`、`后篇 · 第14节`、`断章／1`、`回顾关卡`），在 [StoryHub.tsx](file:///e:/work/FGO_SA/app/src/components/StoryHub.tsx) 的章节列表徽章与阅读器顶部同步显示；升级 `WAR_DETAIL_VERSION = 2` 自动刷新旧缓存。
- **Atlas Academy 风格场景合成（隐藏底部表情网格，仅合成当前表情）**：
  - 新增 [StorySceneCard.tsx](file:///e:/work/FGO_SA/app/src/components/StorySceneCard.tsx)，通过 `/raw/CN/svtScript?charaId={id}` 获取角色偏移与表情坐标，按 Atlas Academy `Scene.tsx` 算法将「背景图 + 裁切掉表情网格的人物主体 + 当前 `[charaFace]` 对应的单个表情差分」叠合渲染，底部附带 `[背景]` `[立绘]` 预览按钮。
  - 升级 [storyService.ts](file:///e:/work/FGO_SA/app/src/services/storyService.ts) 的 `parseStoryScript`（`SCRIPT_PARSER_VERSION = 3`），追踪 `[charaFace]`/`[charaFaceFade]`/`[charaFilter]`/`[cameraFilter]`/`[charaFadeout]` 并在演出段合并输出合成场景块 `scene`，同时清洗说话人前的槽位前缀（如 `B：希翁?` → `希翁?`）。
- **验证状态**：`tsc --noEmit` 0 错误通过，`npm.cmd --prefix app run build`（`3.80s`）构建成功；按用户要求**未打包 APK**，待确认网页端效果后再执行打包。

---

## 8. 安卓侧滑返回手势修复（2026-11-19）

- **根因**：原 [MainActivity.java](file:///e:/work/FGO_SA/app/android/app/src/main/java/wiki/fgo/mooncell/offline/MainActivity.java) 通过 `webView.canGoBack()` 判断是否可返回，而前端 [backNavigation.ts](file:///e:/work/FGO_SA/app/src/utils/backNavigation.ts) 使用不改变 URL 的 `window.history.pushState(..., '')`，在 Android WebView 中 `canGoBack()` 常返回 `false`，导致侧滑直接退出 App。
- **修复**：
  - [backNavigation.ts](file:///e:/work/FGO_SA/app/src/utils/backNavigation.ts) 暴露全局桥接方法 `window.__fgoHandleAndroidBack()`，原生端不再操作 `history.pushState`/`history.back()`，直接基于 `activeLayers` 内存栈逐层关闭顶层页面/弹窗并返回 `'handled'` 或 `'exit'`（Web 浏览器端保留原 `popstate` + `Esc` 逻辑）。
  - [MainActivity.java](file:///e:/work/FGO_SA/app/android/app/src/main/java/wiki/fgo/mooncell/offline/MainActivity.java) 在 `OnBackPressedCallback` 中通过 `webView.evaluateJavascript(...)` 直接调用 `window.__fgoHandleAndroidBack()`，仅当返回 `'exit'` 且无 WebView 历史时才退出 App。
  - 优化 [StoryHub.tsx](file:///e:/work/FGO_SA/app/src/components/StoryHub.tsx) 阅读器与大图预览的 `useBackClose` 压栈顺序。
- **验证状态**：`tsc --noEmit` 0 错误通过，`npm.cmd --prefix app run android:sync`（`5.31s`）与 `.\gradlew.bat assembleDebug`（`7s`）全部成功，最新 APK `app/android/app/build/outputs/apk/debug/app-debug.apk`（`142.34 MB`，`2026/11/19 21:19:59`），已包含章节重排/节号、Atlas Academy 表情差分合成与安卓侧滑返回修复。

---

## 9. 安卓顶部状态栏配色统一（方案 A，2026-11-19）

- **改动**：
  - [styles.xml](file:///e:/work/FGO_SA/app/android/app/src/main/res/values/styles.xml)：为 `AppTheme.NoActionBar` 与 `AppTheme.NoActionBarLaunch` 设置 `android:windowBackground`、`android:statusBarColor` 为 `#0f172a`，`android:windowTranslucentStatus` 为 `false`，`android:windowLightStatusBar` 为 `false`。
  - [MainActivity.java](file:///e:/work/FGO_SA/app/android/app/src/main/java/wiki/fgo/mooncell/offline/MainActivity.java)：在 `onCreate`、`onResume`、`onWindowFocusChanged` 中统一调用 `applyDarkStatusBar()`，清除 `FLAG_TRANSLUCENT_STATUS` 半透明灰罩、关闭 `setStatusBarContrastEnforced(false)`，并将 `DecorView` 与 `android.R.id.content` 底色同步设为 `#0f172a` 以兼容 HyperOS / Android 15+。
- **验证与打包**：`.\gradlew.bat assembleDebug`（`7s`）编译成功，最新 APK `app/android/app/build/outputs/apk/debug/app-debug.apk`（`142.69 MB`，`2026/11/19 21:44:37`）。

---

## 10. 剧情图片加载提速与本地持久化缓存（2026-11-19）

- **改动**：
  - [storyService.ts](file:///e:/work/FGO_SA/app/src/services/storyService.ts)：将 IndexedDB `atlas_story_cache_v1` 升级到版本 2，新增 `svt_scripts`（角色表情坐标持久化库）与 `image_cache`（剧情图片 Blob 持久化缓存池）；实现 `prefetchSvtScriptMetas` 整节批量拉取坐标、以及 `loadCachedStoryImage`（内存 ObjectURL + IndexedDB 持久化 + 并发去重）与缓存统计/清理接口。
  - [StorySceneCard.tsx](file:///e:/work/FGO_SA/app/src/components/StorySceneCard.tsx)：引入 `IntersectionObserver` 视口懒加载（提前 500px 预热），移除重复的 `{id}.png` 尺寸探测大图下载（直接复用已缓存 `_merged.png` 自然宽度，立绘流量减半）；新增 `CachedStoryImg` 统一接管 `bg`/`cg`/`equip`/`chara`/`mark` 图片缓存与加载骨架占位。
  - [StoryHub.tsx](file:///e:/work/FGO_SA/app/src/components/StoryHub.tsx) & [styles.css](file:///e:/work/FGO_SA/app/src/styles.css)：打开剧情时自动批量预拉取本节 `svtScript` 坐标；在剧情中心首页底部增加本地图片缓存数量与 MB 统计条及「清理图片缓存」入口，点击后弹出**二次确认弹窗**（不直接删除，且不清理剧情文本与阅读进度）。
- **验证状态**：`tsc --noEmit` 0 错误通过，`npm.cmd --prefix app run build`（`3.85s`）构建成功；按用户要求**未打包 APK**，待确认后再打包。

---

## 11. 过滤剧情特效占位角色与屏幕外隐形立绘（2026-11-19）

- **改动**：
  - [storyService.ts](file:///e:/work/FGO_SA/app/src/services/storyService.ts)：新增 `isDummyChara`（过滤 `dummy` / `ダミー` / `エフェクト` / `特效用` / `演出用` 等占位角色及无名/特效用途的 `98115000`）与 `isOffscreenCoord`（过滤坐标 `|x| >= 1000` 或 `|y| >= 1000` 的屏幕外 `charaPut`/`charaPutFSR`/`charaFadein`），并过滤透明度 `<= 0.01` 的 `charaFadeTime`。
  - 升级 `SCRIPT_PARSER_VERSION = 4`，重新打开章节时自动刷新旧缓存剔除占位立绘。
- **验证状态**：`tsc --noEmit` 0 错误通过，`npm.cmd --prefix app run build`（`4.00s`）构建成功，`npm.cmd --prefix app run android:sync`（`5.75s`）与 `.\gradlew.bat assembleDebug`（`6s`）打包成功，最新 APK `app/android/app/build/outputs/apk/debug/app-debug.apk`（`141.99 MB`，`2026/11/19 22:23:54`）。

---

## 12. 清除剧情人物名与正文中的 NGUI 富文本控制标签（2026-11-20）

- **根因**：`cleanSpeakerName` 未清洗 Unity NGUI 颜色码与闭合符（如 `[51d4ff]达·芬奇[-]`），且 `cleanInlineMarkup` 正则未匹配 `[-]` 及 `[/b]`/`[/i]`/`[/u]`/`[/s]`/`[/c]` 等含 `-`/`/` 的闭合标签。
- **改动**：
  - [storyService.ts](file:///d:/git_proj/FGO_SA/app/src/services/storyService.ts)：
    - 在 `cleanInlineMarkup` 中新增剔除 `[-]`、6/8 位十六进制颜色码 `\[[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\]` 及所有闭合控制标签 `\[\/[a-zA-Z0-9_-]+\]`；
    - 在 `cleanSpeakerName` 中先执行 `cleanInlineMarkup` 再去槽位前缀，并同步应用于 `charaSet` 角色立绘名；
    - 升级 `SCRIPT_PARSER_VERSION = 5`，自动刷新已缓存旧剧本。
- **验证状态**：`tsc --noEmit` **0 错误通过**。

---

## 13. 修复全部卡池误显示为福袋召唤的问题（2026-11-20）

- **根因**：Mooncell SMW `action=ask` 接口返回的 `SummonLuckybag` 属性格式为 `['t']`（福袋）或 `['f']`（非福袋）的字符串数组。原脚本 [collect_events_banners.py](file:///d:/git_proj/FGO_SA/collect_events_banners.py) 使用 `bool(po.get("SummonLuckybag"))`、原前端 [dataService.ts](file:///d:/git_proj/FGO_SA/app/src/services/dataService.ts) 使用 `Boolean(po.SummonLuckybag && po.SummonLuckybag.length > 0)`，导致非空列表 `['f']` 均被误判为 `true`。
- **改动**：
  - [collect_events_banners.py](file:///d:/git_proj/FGO_SA/collect_events_banners.py)：新增 `first_bool` 解析 `['t']`/`'true'`/`'1'`，支持 `--from-raw` 参数直接基于本地原始快照重新生成；重建 [events_banners.json](file:///d:/git_proj/FGO_SA/app/public/data/events_banners.json)（698 个卡池中仅 32 个真实福袋卡池 `luckybag=True`，其余恢复 `False`）并刷新 [cloud_manifest.json](file:///d:/git_proj/FGO_SA/app/public/data/cloud_manifest.json)。
  - [dataService.ts](file:///d:/git_proj/FGO_SA/app/src/services/dataService.ts)：新增 `smwFirstBool` 修复 `syncFromMooncell` 在线同步解析；升级 `DATA_VERSION = '20261120v1'` 与 `EVENTS_BANNERS_OVERRIDES_KEY = 'events_banners_overrides_v2'` 并对旧版全 `true` 错误 IndexedDB blob 增加自动失效兜底。
- **验证状态**：`tsc -p app/tsconfig.json --noEmit` **0 错误通过**；未提交或推送 Git。

---

## 14. 本机 JDK 17 + Android SDK 环境配置与 APK 打包验证（2026-11-20）

- **环境配置（免管理员权限，已持久化写入当前用户 `HKCU\Environment`）**：
  - `JAVA_HOME`：`C:\Users\孙羽\AppData\Local\Android\jdk-17`（Microsoft OpenJDK `17.0.21.1` LTS）
  - `ANDROID_HOME` / `ANDROID_SDK_ROOT`：`C:\Users\孙羽\AppData\Local\Android\Sdk`（已安装 `cmdline-tools;latest`、`platform-tools`、`platforms;android-34`、`build-tools;34.0.0`）
  - `Path`：已追加 `%JAVA_HOME%\bin`、`%ANDROID_HOME%\cmdline-tools\latest\bin`、`%ANDROID_HOME%\platform-tools`
  - [app/android/local.properties](file:///d:/git_proj/FGO_SA/app/android/local.properties)：已写入 `sdk.dir=C:/Users/\u5b59\u7fbd/AppData/Local/Android/Sdk`（已被 Git 忽略）
  - 用户级 `C:\Users\孙羽\.gradle\gradle.properties`：已配置 `-Xmx2048m -Dfile.encoding=UTF-8` 与本地代理 `127.0.0.1:7890`（不污染 Git 仓库），且已预下载 `gradle-8.2.1-all.zip`
- **APK 构建验证**：
  - `npm.cmd --prefix app run android:sync`：成功同步 Web 构建产物及离线资源至 Android 工程。
  - `.\gradlew.bat assembleDebug --no-daemon`：`BUILD SUCCESSFUL`（82 actionable tasks），成功生成最新离线 APK [app-debug.apk](file:///d:/git_proj/FGO_SA/app/android/app/build/outputs/apk/debug/app-debug.apk)。
- **未提交状态**：本地（第 13 节福袋修复 + 本次环境配置文件）未执行 Git 提交/推送；其中 `local.properties` 与 `~/.gradle/` 均不影响远程仓库。

---

## 15. 已有内容变更自动检测与更新增强（2026-11-20）

- **前端已缓存关卡配置变更检测（[types.ts](file:///d:/git_proj/FGO_SA/app/src/types.ts)、[dataService.ts](file:///d:/git_proj/FGO_SA/app/src/services/dataService.ts)、[App.tsx](file:///d:/git_proj/FGO_SA/app/src/App.tsx)）**：
  - `EventQuestConfigData` 新增 `revid` 字段；`loadEventQuestConfig` 在请求 `action=parse` 时同时获取并保存 Mooncell 页面 `revid`。
  - 新增 `syncCachedQuestConfigs()`，在 `syncFromMooncell` 流程中按每批 50 个标题批量比对本地 IndexedDB `quest_configs` 中已缓存关卡的当前最新 `revid`：发现站点页面修订变化（或旧缓存无 `revid`）时，前 10 个主动热刷新并写入最新 `revid`，超出部分删除失效缓存以便下次打开重拉；`deltaParts` 与 `hasAnyUpdate` 纳入 `updatedQuestConfigs` 提示。
- **云端已有从者/语音/礼装全量 `revid` 精准比对（[update_cloud_data.py](file:///d:/git_proj/FGO_SA/update_cloud_data.py)、[update-catalog-data.yml](file:///d:/git_proj/FGO_SA/.github/workflows/update-catalog-data.yml)）**：
  - 修复 `update_cloud_data.py` 的 SQLite 写入语句以匹配 `data/mooncell.sqlite3` 真实表结构（`pages(page_id, namespace, title, redirect, revision_id, updated_at, model, wikitext, source_url)` 与 `catalog(kind, number, name, title, fields_json)`），并升级为批量拉取全部 ~487 骑英灵及语音页面的 `revid` 与本地对比（彻底消除仅靠最近 50 条 `recentchanges` 的漏检盲区）；新增 `--check-only` 与 `--check-all-ces` 参数。
  - 在 [update-catalog-data.yml](file:///d:/git_proj/FGO_SA/.github/workflows/update-catalog-data.yml) 中配置缓存未命中时通过 `restore_data.py` 自动还原基线库，并启用 `--check-all-ces` 全量比对。
- **验证结果**：
  - `app\node_modules\.bin\tsc.cmd -p app\tsconfig.json --noEmit`：**0 错误通过**。
  - `python -m py_compile update_cloud_data.py`：语法检查通过。
  - `python -X utf8 update_cloud_data.py --check-only`：实测精准识别本地 4,248 页 SQLite 中已有 **2 骑从者修订**（`千利休`、`冲田总司〔Alter〕(Saber)`）、**4 个语音子页面修订**、**10 张缺失礼装与 12 张礼装修订**（共 28 页待更新，未改动本地数据文件）。
  - **严格按用户要求**：未执行 Git 提交/推送，未执行 APK 打包。

---

## 16. 接入各从者「幕间物语」与「情人节剧情」（2026-11-20）

- **轻量索引采集与云端追踪（[collect_servant_stories.py](file:///d:/git_proj/FGO_SA/collect_servant_stories.py)、[update_cloud_data.py](file:///d:/git_proj/FGO_SA/update_cloud_data.py)）**：
  - 扫描 Atlas Academy CN 全量从者（`nice_servant.json`）及 33 个 `war`（`1003` 幕间物语、`9999` 迦勒底之门及主线各章节）和缺失的 `91*` `relateQuestIds`，跨库关联 Mooncell `catalog_summary.json` 中文译名与头像路径，生成紧凑索引 [servant_stories.json](file:///d:/git_proj/FGO_SA/app/public/data/servant_stories.json)（**361,658 字节**，收录 **214 位从者 / 279 篇幕间物语**、**425 位从者 / 435 篇情人节剧情**）及 2 张本地分类横幅图 `cat_interlude.webp`、`cat_valentine.webp`。
  - 已将 `servant_stories.json` 纳入 `cloud_manifest.json` 追踪（共 29 个数据文件）与云端每日同步流程。
- **三处联动入口与阅读体验复用（[types.ts](file:///d:/git_proj/FGO_SA/app/src/types.ts)、[dataService.ts](file:///d:/git_proj/FGO_SA/app/src/services/dataService.ts)、[StoryHub.tsx](file:///d:/git_proj/FGO_SA/app/src/components/StoryHub.tsx)、[ServantDetailModal.tsx](file:///d:/git_proj/FGO_SA/app/src/components/ServantDetailModal.tsx)、[CeDetailModal.tsx](file:///d:/git_proj/FGO_SA/app/src/components/CeDetailModal.tsx)、[App.tsx](file:///d:/git_proj/FGO_SA/app/src/App.tsx)、[styles.css](file:///d:/git_proj/FGO_SA/app/src/styles.css)）**：
  - **「剧情」中心首页**：新增「幕间物语」与「情人节剧情」两张横幅分类大卡，按从者头像与编号分组展示，全局搜索兼容搜索从者名/编号/幕间与回礼标题；支持整从者一键离线缓存、阅读进度记忆（分别使用负数键 `-100000 - svtId` 与 `-200000 - svtId` 与主线进度共享 `localStorage`）与首页「最近阅读」续看。
  - **英灵详情页**：在「资料与语音」分栏顶部新增「专属剧情阅读」快捷卡片，直接列出该从者的幕间物语与情人节剧情，点击直达全屏 `StoryReaderModal`。
  - **概念礼装详情页**：打开「情人节概念礼装」或关联情人节从者的礼装时，提供粉色「阅读对应情人节剧情」直达按钮。
- **验证状态**：
  - `app\node_modules\.bin\tsc.cmd -p app\tsconfig.json --noEmit`：**0 错误通过**。
  - `npm run build --prefix app`：`vite build` 构建成功（`dist/index.html`、`dist/bundle/index-*.css` / `.js` 产出正常，1,589 个模块）。
  - **严格按用户要求**：未执行 Git 提交/推送，未执行 `android:sync` 与 APK 打包。

---

## 17. 修复云端数据更新 404 与 Actions 定时错峰配置（2026-11-20）

- **排查结论**：
  - 手机 App 点击「更新数据」未拉取到 `#413 苍崎青子` 与 `#415 久远寺有珠` 强化的根因：GitHub 仓库 `Aragaki-Ayase/FGO_SA` 此前为 **Private（私有）**，导致 `cdn.jsdelivr.net` 与 `raw.githubusercontent.com` 返回 404；用户将仓库改为 **Public（公开）** 后已实测两条线路均恢复 `HTTP 200` 且返回 `2026-11-20 12:42 UTC`（含青子/有珠强化）最新清单，无需修改前端或重新打包 APK。
  - 19:30 定时未触发根因：GitHub Actions 在整半点 `:30` 洪峰队列易延迟或丢弃，且当天刚修改 cron。
- **改动**：
  - [update-catalog-data.yml](file:///e:/work/FGO_SA/.github/workflows/update-catalog-data.yml)：将 `schedule` 从 `'30 11 * * *'` 调整为错峰冷门分钟 `'23 11 * * *'`（北京时间 19:23）并增加 `'17 12 * * *'`（北京时间 20:17）兜底。
- **待同步**：当前本地目录 `e:\work\FGO_SA` 无 `.git` 文件夹，需将 `update-catalog-data.yml` 同步推送至 GitHub `main` 分支后定时新配置才会生效。

---

## 18. 云端更新多 CDN 竞速选路与全链路超时防卡死（2026-11-20）

- **改动**：
  - [dataService.ts](file:///e:/work/FGO_SA/app/src/services/dataService.ts)：
    - 将 `CLOUD_DATA_BASES` 扩展为 5 条已验证线路（`fastly.jsdelivr.net`、`gcore.jsdelivr.net`、`cdn.jsdelivr.net`、`ghfast.top`、`raw.githubusercontent.com`）。
    - 新增 `raceCloudManifest()` 并行竞速拉取 `cloud_manifest.json`，谁最先返回即锁定 `preferredCloudBase` 供后续分片复用，失败时快速回退其余线路。
    - 为 `CapacitorHttp.get` 与 Web `fetch` 统一增加超时保护（云端连接 5s / 读取 8~15s，Mooncell 连接 6s / 读取 12s）。
  - [storyService.ts](file:///e:/work/FGO_SA/app/src/services/storyService.ts)：为 `fetchAtlasJson` 与 `fetchAtlasText` 增加 `connectTimeout: 5000` / `readTimeout: 8000~10000` 与 `AbortController` 超时，并将 `syncStoryWarsFromAtlas` 设为单次 6s 快速超时，避免国内不挂代理时卡死更新流程。
- **验证状态**：`tsc --noEmit` **0 错误通过**，`npm.cmd --prefix app run android:sync`（`4.98s`）与 `.\gradlew.bat assembleDebug`（`21s`）打包成功，最新 APK `app/android/app/build/outputs/apk/debug/app-debug.apk`（`128.71 MB`，`2026/11/20 21:19:26`），并已推送至 `origin/main`。

---

## 19. 关卡配置中心 5 项体验与功能修复（2026-11-21）

- **改动**：
  - [QuestConfigHub.tsx](file:///e:/work/FGO_SA/app/src/components/QuestConfigHub.tsx)：
    1. **移除「自由关卡」分类**：首页精简为 6 大分类卡片（活动关卡、迦勒底之门、主线剧情、冠位戴冠战、亚兹拉尔之庙、主线物语）。
    2. **修复全部左上角返回按钮**：将所有返回按钮的 `onClick` 从失效的 `window.history.back()` 改为直接调用 React 状态回退函数（引入 `questPageStack` 多级页面栈），同时修正 `directPage`（如亚兹拉尔之庙）返回时的状态同步清理，与系统侧滑手势保持一致。
    3. **全站关卡搜索**：汇总迦勒底之门、主线 6 大部 35 章、冠位戴冠战 8 职阶、亚兹拉尔之庙、主线物语 8 部及全部活动关卡，搜索框输入后直接实时展示全部分类匹配结果并支持点击直达。
    4. **迦勒底之门子关卡配置**：参考 Mooncell `迦勒底之门` 结构升级为 12 项子关卡目录（每日任务、进阶关卡、强化任务、强化任务按职阶排序、幕间物语、魔术礼装任务、纪念任务、体验任务、测试关卡、监狱塔兑换、合众国开拓史兑换及原总览页），并支持点击渲染 HTML 中的图片/文字站内链接（`迦勒底之门/*`、`*/关卡配置`、`*/从者任务#...`）压栈跳转与自动滚动定位。
  - [dataService.ts](file:///e:/work/FGO_SA/app/src/services/dataService.ts)：
    - 升级 `sanitizeWikiHtml` 与 `loadEventQuestConfig`（缓存键升级为 `v3:`）：移除「快速跳转」框与原页面 `#toc` 目录；对「亚兹拉尔之庙」按 `<h3>` 试炼关卡块及 `sections` 同步倒序重排（最新关卡排最前）；将站内 `<a href="/w/...">` 安全转换为 `data-mc-page` / `data-mc-anchor` 以支持 App 内跳转。
  - [App.tsx](file:///e:/work/FGO_SA/app/src/App.tsx) & [styles.css](file:///e:/work/FGO_SA/app/src/styles.css)：更新关卡配置搜索框提示文案，新增全局搜索结果与页内可点击链接样式。
- **验证状态**：`tsc --noEmit` **0 错误通过**，`npm.cmd --prefix app run android:sync`（`5.44s`）与 `.\gradlew.bat assembleDebug`（`8s`）打包成功，最新本地 APK `app/android/app/build/outputs/apk/debug/app-debug.apk`（`129.89 MB`，`2026/11/21 12:35:35`），并已提交推送至 `origin/main`。

---

## 20. 消除 jsDelivr 旧缓存截胡、自动 Purge 缓存与升级 APK 版本号 v1.1（2026-11-21）

- **改动**：
  - [dataService.ts](file:///e:/work/FGO_SA/app/src/services/dataService.ts)：将 `raceCloudManifest()` 从“谁先回就用谁”升级为 `Promise.allSettled` 并发探测全部线路后，优先选取 `updatedAt` 最新的清单（同为最新时优先最快线路），避免 jsDelivr 对 `@main` 的旧缓存抢先返回导致漏掉刚提交的更新（如 `#2720 魔法使之夜`）。
  - [update-catalog-data.yml](file:///e:/work/FGO_SA/.github/workflows/update-catalog-data.yml)：在 `git push` 后对变动的数据文件自动调用 `https://purge.jsdelivr.net/gh/...` 刷新 jsDelivr 缓存。
  - [build.gradle](file:///e:/work/FGO_SA/app/android/app/build.gradle)：将 `versionCode` 递增至 `2`、`versionName` 升至 `"1.1"`，便于手机覆盖安装时清晰辨认新版。
  - 同步 `471901f` 最新云端数据（含 `#2720 魔法使之夜`）至本地 `app/public/data/` 并主动刷新线上 jsDelivr 缓存。
- **验证与打包**：`tsc --noEmit` **0 错误通过**，`npm.cmd --prefix app run android:sync`（`5.56s`）与 `.\gradlew.bat assembleDebug`（`10s`）构建成功，最新 APK `app/android/app/build/outputs/apk/debug/app-debug.apk`（`v1.1`，`128.72 MB`，`2026/11/21 12:51:14`），并已提交推送至 `origin/main`。

---

## 21. 修复英灵/礼装原始图片下载功能（2026-11-21）

- **改动**：
  - [MainActivity.java](file:///e:/work/FGO_SA/app/android/app/src/main/java/wiki/fgo/mooncell/offline/MainActivity.java)：新增 `NativeMediaBridge`（挂载至 `window.MooncellNative.saveImage`），后台线程通过 `HttpURLConnection` 拉取原图，Android 10+ 使用 `MediaStore.Images.Media` 免权限写入系统相册 `Pictures/Mooncell图鉴/`（Android 9 以下写入外部 Pictures 目录并扫描相册），完成后弹原生 `Toast` 并回调前端 `window.__onNativeImageSaveResult`。
  - [CardLightbox.tsx](file:///e:/work/FGO_SA/app/src/components/CardLightbox.tsx)：Android 原生端调用 `MooncellNative.saveImage` 直接保存至手机相册；Web 浏览器端优先走 Vite `/mooncell-media` 同源代理绕过 `media.fgo.wiki` CORS 限制并触发真实文件下载，按钮同步展示保存反馈提示。
- **验证状态**：`tsc --noEmit` **0 错误通过**，`npm.cmd --prefix app run android:sync`（`5.06s`）与 `.\gradlew.bat assembleDebug`（`8s`）打包成功，版本号递增至 `v1.2 (versionCode 3)`，最新 APK `app/android/app/build/outputs/apk/debug/app-debug.apk`（`128.72 MB`，`2026/11/21 13:29:30`），并已提交推送至 `origin/main`。
