# Mooncell 离线资料库

GitHub 使用 `offline-data/` 中的压缩分卷同步完整数据。首次克隆后，在根目录执行 `python restore_data.py`，校验并恢复 `data/`，随后即可离线查询。若已有文件与快照不同，恢复脚本会停止，需先备份已有数据。

已按英灵图鉴、礼装图鉴、指令纹章图鉴采集公开数据，供本地 App 查询。

- `data/mooncell.sqlite3`：`catalog` 表存三类索引，`pages` 表存详情 Wikitext、修订号、时间和来源链接。
- `data/catalogs.json`：可直接导入 App 的三类索引及原始字段。
- `data/catalog-sources.json`：索引数据页的 API 原始响应。
- `data/catalog-report.json`：完成采集后的数量和未获取详情清单。

`kind` 取值为 `servant`、`craft_essence`、`command_code`。编号只在同类内唯一，必须使用 `(kind, number)` 作为主键。`catalog.title = pages.title` 可连接索引与详情。`fields_json` 保留名称、别名、获取方式、效果等来源字段；各类字段并不完全相同，空值及尚未翻译的日文按原样保留。

例如查询英灵列表：

```sql
SELECT number, name, title, fields_json
FROM catalog WHERE kind = 'servant' ORDER BY number;
```

查询单条详情：

```sql
SELECT c.*, p.wikitext, p.redirect, p.source_url
FROM catalog c LEFT JOIN pages p ON p.title = c.title
WHERE c.kind = 'servant' AND c.number = 1;
```

如果 `redirect` 非空，按该目标标题继续查 `pages`，并检测循环。采集程序会补抓重定向目标；尚未解析的目标列入报告。

运行 `python -X utf8 collect_catalogs.py` 会重新读取三类索引，按每批 20 个标题、至少间隔 1 秒下载缺少的详情，可中断续采。已有详情不会自动刷新；当前用途是建立离线快照。单批失败会重试，最终失败会退出，已提交的数据保留。

详情为 Wiki 源文，尚未展开模板、下载图片或转换成原生 App 技能/宝具结构。它不是可直接复刻网站外观的离线镜像。正文包含的模板引用及子页面可能需后续补齐。站点声明采用 CC BY-NC-SA 4.0，见 `data/siteinfo.json`；素材图片的权利需分别确认。

下面的 XML 导入工具也可独立使用，仅读取本地文件：

在可访问并获准导出的网站环境中取得 MediaWiki XML（如站点开放了「特殊页面 → 导出页面」，可选当前版本并勾选包含模板）；将导出文件放进项目，再在 PowerShell 运行：

```powershell
python -X utf8 mooncell_offline.py import .\mooncell.xml
python -X utf8 mooncell_offline.py search "玛修"
python -X utf8 mooncell_offline.py search "圣晶石" --body
python -X utf8 mooncell_offline.py show "首页"
```

支持普通 XML、gzip 和 bzip2，可一次传入多个文件；只保留各页面最新的已导入修订。重复导入不会用旧修订覆盖新修订。增量导入不会自动删掉新版导出里未出现的页面；如需从完整快照重建，请指定一个新数据库：

```powershell
python -X utf8 mooncell_offline.py --db .\snapshot.sqlite3 import .\mooncell.xml.bz2
```

App 可直接打开 `mooncell.sqlite3`：`pages` 表记录页面标题、命名空间、重定向目标、修订号、更新时间、原始 Wikitext 与原页面链接。按标题查详情；按 `namespace = 0` 筛选正文条目。标题与正文搜索为子串匹配，命令行最多返回 50 条。

目前生成的是可查询的源文资料库。要还原网站式阅读体验，需要后续处理 Wiki 模板、站内链接和媒体资源；XML 不包含图片二进制，也不保证包含网站扩展生成的数据。发布资料包前应核对站方的授权说明，并保留来源与署名。
