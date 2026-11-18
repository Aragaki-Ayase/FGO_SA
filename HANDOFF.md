# 项目工作交接文档（HANDOFF）

## 1. 目标与状态

- **目标**：基于 Mooncell（`fgo.wiki`）离线图鉴数据构建美观顺滑的 Android / Web 移动端图鉴 App，涵盖英灵图鉴与礼装图鉴、图1/图2样式带框缩略图展示、多维筛选与实时预览、图3/图4样式的技能与宝具多阶段切换展示、从者完整羁绊数据、礼装效果标签自动归类与筛选、压缩缩略图预打包与卡面放大下载原图、非阻塞后台网站数据更新，以及安卓系统返回键/边缘侧滑手势逐层退出。
- **已完成**：
  1. **原始数据库与语音补齐（`data/mooncell.sqlite3`）**：包含 487 骑英灵、2,719 张概念礼装、核心解析模板及 476 个英灵语音子页面。
  2. **结构化解析器（[build_app_data.py](file:///d:/git_proj/FGO_SA/build_app_data.py)）**：
     - 解析从者基础数值、`<tabber>` / `{{强化信息}}` / `{{复合标签}}` 多阶段技能与宝具、职阶与追加技能 1~5、素材需求、个人资料与语音。
     - **新增从者羁绊数据**：解析 `{{牵绊点数}}` Lv.1~Lv.10 单级需求，结合梦火 Lv.11~Lv.15 经验、各星级圣晶石/苹果/硬币达成奖励、专属牵绊礼装完整属性与背景解说文本。
     - **新增概念礼装效果标签与属性倾向**：自动从全部 2,719 张礼装（含中/日文描述）提取 7 大类 30 种效果标签（如 `初始NP(开局充能)`、`Buster性能提升`、`暴击威力提升`、`宝具威力提升`、`无敌贯通` 等）及 `纯ATK / ATK+HP均衡 / 纯HP / 特殊` 属性倾向。
  3. **全量离线缩略图下载与压缩（[download_assets.py](file:///d:/git_proj/FGO_SA/download_assets.py)）**：7,165 张图标与 Pillow WebP 压缩立绘已预打包至 `app/public/assets/`。
  4. **移动端 App 与 Android 交互增强（[app/](file:///d:/git_proj/FGO_SA/app/package.json)）**：
     - **在线更新跨域修复**：网页端通过 [vite.config.ts](file:///d:/git_proj/FGO_SA/app/vite.config.ts) `/mooncell-api` 反向代理绕过 Mooncell CORS 限制；安卓端通过 `CapacitorHttp` 原生网络栈请求。
     - **特性与礼装标签多词搜索 + 实时预览**：支持空格分隔同时搜索多个特性/标签，并在筛选抽屉底部实时展示符合条件的从者/礼装带框缩略图。
     - **防换行布局优化**：详情页分栏按钮（`.detail-nav-tabs`）与技能/宝具多阶段切换栏（`.mc-stage-tabs`）强制单行自适应展示，杜绝窄屏文字折行。
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
   - 若 `npm run dev --prefix app` 已在运行，建议重启一次命令以加载更新后的 `vite.config.ts` 代理配置。
2. **构建生产包或推送到 GitHub 自动打包 APK**：
   - 本地生产构建验证：`npm run build --prefix app`
   - 推送至 GitHub 触发云端 APK 打包：`git add . && git commit -m "Enhance sync, traits, bond tab, CE tags and back navigation" && git push origin main`
