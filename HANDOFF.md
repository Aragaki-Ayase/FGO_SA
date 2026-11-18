# 项目工作交接文档（HANDOFF）

## 1. 目标与状态

- **目标**：基于 Mooncell（`fgo.wiki`）离线图鉴数据构建美观顺滑的 Android / Web 移动端图鉴 App，涵盖英灵图鉴与礼装图鉴、图1/图2样式带框缩略图展示、6 维组合筛选（含同类特性归组）、图3/图4样式的技能与宝具多阶段切换展示、压缩缩略图预打包与卡面放大下载原图、以及非阻塞后台网站数据更新。
- **已完成**：
  - 补齐 `data/mooncell.sqlite3` 中的核心解析模板（`模板:基础数值`、`模板:宝具`、`模板:持有技能`、`模板:职阶技能`、`模板:追加技能`、`技能一览/追加技能`、`模板:概念礼装`）及 476 个英灵语音子页面（`{英灵名}/语音`）。
  - 编写 [build_app_data.py](file:///d:/git_proj/FGO_SA/build_app_data.py)，将 487 位英灵和 2,719 张概念礼装完整解析为结构化 JSON（输出至 `app/public/data/`），并生成离线图片清单 `data/image_manifest.json`（共 7,179 项资源）。
  - 编写 [download_assets.py](file:///d:/git_proj/FGO_SA/download_assets.py)，通过 HTTPS Keep-Alive + Pillow WebP 压缩将 7,165 张图片（英灵带框头像 `Servant001~487.jpg`、礼装带框缩略图 `礼装001~2719.jpg`、技能/素材/UI 图标、以及英灵与礼装 `.webp` 压缩卡面）预打包至 `app/public/assets/`。
  - 搭建 React + TypeScript + Vite + Capacitor 移动端应用（[app/](file:///d:/git_proj/FGO_SA/app/package.json)）及 Android 原生工程（`app/android/`），并配置 GitHub Actions 自动编译 APK 工作流（[.github/workflows/build-android-apk.yml](file:///d:/git_proj/FGO_SA/.github/workflows/build-android-apk.yml)）。
- **剩余待办**：
  - 本机未安装 Android SDK / JDK，若需在本机直接编译 `.apk`（而非通过 GitHub Actions 云端构建），需安装 JDK 21 与 Android SDK。
  - 后续可根据需要继续扩展指令纹章图鉴 Tab 或从者任务/幕间物语关卡配置子页面。

---

## 2. 关键改动与决策

- **[build_app_data.py](file:///d:/git_proj/FGO_SA/build_app_data.py)**：
  - 递归解析 `<tabber>`、`{{强化信息}}`、`{{复合标签}}` 与玛修各章节 `heroine` 区块，生成带 `tabLabel` 与 `cond` 的多阶段技能/宝具结构。
  - 兼容 `{{宝具}}` 中的 `|宝具信息=` 与 `{{持有技能}}` 中的 `|技能信息=` 特殊语法（如莫德雷德(Rider)、苍崎青子、哈贝特洛特等）。
  - 将 `{{特攻|...}}` 转换为 `⟪特攻:...⟫` 标记（避免被 `[[链接]]` 清洗正则误剥离），供前端渲染图4同款的蓝色虚线下划线。
  - 将 60+ 种从者特性与属性归类为 6 大分组（阵营与属性、性别与体型、种族与生命形态、系列与面孔、势力与地域文化、战斗机制与特殊状态）。
- **[download_assets.py](file:///d:/git_proj/FGO_SA/download_assets.py)**：
  - **踩坑注意**：Mooncell CDN（`media.fgo.wiki`）遵循标准 MediaWiki 首字母大写 + UTF-8 文件名 MD5 路径规则（`/{md5[0]}/{md5[:2]}/{filename}`）。礼装带框图标文件名为 3 位零填充 `礼装{id:03d}.jpg`（如 `礼装001.jpg`、`礼装191.jpg`、`礼装2719.jpg`），而非 4 位零填充。
  - 卡面缩略图仅预生成特定宽度（如英灵 `285px`、礼装 `300px`），请求任意非标宽度会断开连接；脚本优先拉取标准缩略图（404 时回退原图），再用 Pillow 统一压缩为宽度 `285px`、`quality=78` 的 `.webp` 文件。
- **前端与 Android 工程（[app/src/](file:///d:/git_proj/FGO_SA/app/src/App.tsx)）**：
  - [SkillAndNpTables.tsx](file:///d:/git_proj/FGO_SA/app/src/components/SkillAndNpTables.tsx)：实现图3持有技能表格（多阶段 Tab、`8→7→6` 红字充能、Lv.6/Lv.10 标红）与图4宝具表格（红/蓝/绿斜格纹标题横幅、立体金字、特攻蓝色虚线下划线、5级数值表）。
  - [ServantFilterModal.tsx](file:///d:/git_proj/FGO_SA/app/src/components/ServantFilterModal.tsx)：实现星级、职阶、宝具颜色、宝具种类、获取途径、6 大特性分类（支持 AND / OR 切换与关键词检索）多维筛选。
  - [CardLightbox.tsx](file:///d:/git_proj/FGO_SA/app/src/components/CardLightbox.tsx)：支持阶段立绘放大、切换高清原图预览及一键下载原始 `.png` 资源图片。
  - [dataService.ts](file:///d:/git_proj/FGO_SA/app/src/services/dataService.ts)：通过 MediaWiki API `origin=*` 跨域接口在后台异步检查更新并存入 IndexedDB，不阻塞主界面操作。

---

## 3. 验证结果

- **结构化数据生成校验**：
  - 运行 `python -X utf8 build_app_data.py`：成功生成 487 位英灵、2,719 张概念礼装的结构化分片数据及 7,179 条图片清单。
- **离线图片下载与压缩校验**：
  - 运行 `python -X utf8 download_assets.py --workers 16`：成功下载并压缩 7,165 张图片至 `app/public/assets/`（仅 14 张未实装/敌方词条缺图，前端由 [SmartImage.tsx](file:///d:/git_proj/FGO_SA/app/src/components/SmartImage.tsx) 自动优雅降级）。
- **TypeScript 与生产构建校验**：
  - 运行 `app\node_modules\.bin\tsc.cmd -p app\tsconfig.json --noEmit`：0 错误通过。
  - 运行 `npm run build --prefix app`：Vite 生产构建成功（`dist/` 产物与离线资源完整）。
  - 运行 `npx cap add android`：成功生成 `app/android/` 原生 Android 工程并完成资源同步。
- **未验证内容**：
  - 因当前 Windows 环境未安装 JDK 与 Android SDK，本地 Gradle `assembleDebug` 尚未在本机执行（已配置 `.github/workflows/build-android-apk.yml` 供云端编译）。

---

## 4. 下一步

1. **本地预览体验**：在仓库根目录执行 `npm run dev --prefix app`（或 `npm run preview --prefix app`），在浏览器或手机局域网访问即可直接体验完整功能。
2. **生成 Android APK 安装包**：
   - **方式 A（云端自动构建）**：将代码推送到 GitHub，在 Actions 页面运行 `Build Android APK` 工作流即可下载 `app-debug.apk`。
   - **方式 B（本地构建）**：安装 Android Studio（含 JDK 21 与 Android SDK）后，进入 `app/` 运行 `npm run android:open` 或进入 `app/android/` 执行 `.\gradlew.bat assembleDebug`。
