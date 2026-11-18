# Mooncell 离线资料库与 Android 图鉴 App

本项目基于 Mooncell（`fgo.wiki`）公开数据构建本地离线数据库与移动端图鉴 App（支持 Web 预览与 Capacitor Android APK 打包）。

## 核心特性

1. **双主栏图鉴（英灵图鉴 + 礼装图鉴）**
   - **英灵图鉴（487 骑）**：采用游戏内带框头像缩略图（含职阶图标、星级与 `Servant` 边框），支持网格缩略图与图文列表两种视图切换。
   - **概念礼装图鉴（2,719 张）**：采用游戏内带框礼装缩略图（含星级与 `Craft Essence` 边框），支持按分类（普通、牵绊、纪念、情人节、魔力棱镜兑换）与星级筛选。
2. **多维组合筛选与同类特性归组**
   - 支持按 **星级**、**职阶**、**宝具颜色（Buster/Arts/Quick）**、**宝具种类（全体/单体/辅助 及 对人/对军/对城/结界等细分）**、**获取途径** 组合筛选。
   - **特性分类筛选**：将 60+ 种特性按 **阵营与属性、性别与体型、种族与生命形态、系列与面孔、势力与地域文化、战斗机制与特殊状态** 6 大类别归组，支持 `同时满足 (AND)` 与 `满足任一 (OR)` 模式切换及特性关键词快速检索。
3. **技能与宝具多阶段/强化前后同处切换**
   - 自动识别灵基再临阶段差异（如“第1阶段形象时 / 第2阶段形象时 / 第3阶段形象时”）、强化前后状态及多卡色切换，在同一处顶部通过 Tab 切换查看。
   - 持有技能表格还原 `充能时间: 8→7→6` 红字递减与 Lv.6 / Lv.10 标红数值行；宝具卡片还原红/蓝/绿斜格纹标题横幅、立体金字、特攻蓝色虚线下划线与 5 级数值表。
4. **全量预打包压缩图片 + 原图放大与下载**
   - 头像、技能、素材图标与压缩后的 `.webp` 阶段卡面均预打包至 `app/public/assets/`。
   - 点击英灵或礼装卡面可打开全屏查看器，支持缩放、阶段切换、**加载高清原图** 及 **一键下载原始资源图片（`.png`）**。
5. **非阻塞后台网站数据更新**
   - 顶部提供 **「从网站更新数据」** 按钮，通过后台异步请求比对 Mooncell 最新图鉴索引并写入本地 IndexedDB 覆盖层，更新期间以浮动进度条提示，完全不影响浏览、筛选与详情查阅。

---

## 目录与脚本说明

- `data/mooncell.sqlite3`：SQLite 原始数据库（`catalog` 索引表 + `pages` Wikitext 详情、模板与语音子页面表）。
- `restore_data.py`：从 `offline-data/` 压缩分卷恢复 `data/` 目录。
- `collect_catalogs.py`：从 Mooncell API 拉取最新三类图鉴索引并补抓缺失页面。
- `build_app_data.py`：将 SQLite 中的 Wikitext 解析为前端/App 结构化 JSON 数据（输出至 `app/public/data/`）并生成图片清单 `data/image_manifest.json`。
- `download_assets.py`：多线程 Keep-Alive 下载并使用 Pillow 压缩全部头像、技能、素材及阶段立绘缩略图至 `app/public/assets/`。
- `app/`：React + TypeScript + Vite + Capacitor 移动端图鉴应用源码。
- `.github/workflows/build-android-apk.yml`：GitHub Actions 自动构建 Android `.apk` 工作流。

---

## 快速开始

### 1. 数据准备与结构化构建

```powershell
# 1) 首次克隆后恢复 SQLite 数据快照（若 data/ 已存在可跳过）
python restore_data.py

# 2) 解析 Wikitext 生成 App 结构化数据与图片清单
python -X utf8 build_app_data.py

# 3) 批量下载并压缩离线图标与卡面缩略图（支持断点续传）
python -X utf8 download_assets.py --workers 16
```

### 2. 启动移动端图鉴预览 / 打包 Android APK

```powershell
cd app
npm install

# 启动本地开发预览服务器
npm run dev

# 构建生产静态包并同步到 Capacitor Android 工程
npm run build
npx cap sync android

# 若本机已安装 Android Studio / Android SDK，可直接打开或编译 APK
npx cap open android
```

---

## 版权与署名说明

原始数据及媒体资源来源于 Mooncell（`https://fgo.wiki`），站点文本声明采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)（详见 `data/siteinfo.json`）；游戏内卡面、图标等素材权利归原版权方所有，仅供个人离线学习与查阅使用。
