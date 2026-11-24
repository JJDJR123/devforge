# 编辑器可靠性排查与修复（2026-11-21）

## 这次的真实问题

`01火焰-火焰火花本体` 的报错是：

```text
(u || []) is not iterable
```

页面数据没有丢。服务端仍有 48 个块，包含粒子系统参数表，更新时间可查。

崩溃点不在页面正文本身，而在**表格单元格结构异常**：

- 图片/旧导入数据让某个表格单元格不再是 `InlineContent[]`
- `extractPlainText()` 对单元格做 `for...of`
- 切页时 `BlockEditor` 清理逻辑调用 `extractPlainText()`
- 清理期间抛错 → 整个页面被 ErrorBoundary 接住
- 页面看起来“没保存/没内容”，实际是渲染入口崩了

## 已修复

1. **表格单元格归一化**
   - 字符串单元格恢复成文本
   - PowerShell 风格字符串 `@{type=text; text=...}` 提取真实文字
   - **保护 BlockNote 的 `tableCell` 对象**（`{ type: 'tableCell', content, props }`），不再把整个单元格误判成无 text 的图片对象
   - `tableCell.content` 里的文字/链接保留；图片对象降级为可点击的 `[图片]` 链接
   - `wikiLinksToMarks()` 在交给 BlockNote 前清洗

2. **文本提取防护**
   - `extractPlainText()` 不再假设 `row.cells` / `cell` 一定是数组
   - `extractPlainText()` / `blocksToMarkdown()` 支持读取 `tableCell.content`
   - `blocksToMarkdown()` 表格导出一并防护

3. **服务端搜索文本提取防护**
   - `server/db.js` 遇到异常表格单元格不会再 500
   - 表格单元格对象会读取 `cell.content`

4. **保存流程防护**
   - `extractPlainText()` 移入 `try`
   - `pagehide` / unmount 保存全部包 `try/catch`
   - 保存失败弹 toast，不再只显示一个小红点

5. **本地草稿兜底**
   - 编辑时把最新 blocks 写入 `localStorage`
   - 保存成功才清除
   - 保存失败/切页后重新进入页面，自动恢复并重试保存
   - `beforeunload` 在未保存时提示

6. **切页误更新元数据**
   - 页面标题没有变化时，不再在切页时 PATCH 标题
   - 避免无意义地刷新 `updatedAt`，导致本地草稿被误判为旧数据

## 验证

已通过浏览器实测：

- 登录 → 编辑 → 保存 → 刷新 → 切页 → 回看
- 标题清空、失焦、恢复
- 文字颜色 + 超链接颜色隔离
- 异常表格单元格 / 图片单元格不打崩
- Markdown 新建子页 / 覆盖本页
- 保存请求被中止后切页，草稿恢复并重新保存
- 180 段大文档保存、追加、切页、刷新
- 图片块保存、刷新后仍在

## 仍需注意

- 多标签页同时编辑仍是最后写入覆盖，没有版本锁。
- 单页 5MB 上限；超大文档会被拒绝。
- 图片放进表格单元格不会保留为图片，会降级成可点击的 `[图片]` 链接。这是 BlockNote 表格单元格只支持 inline content 的限制。
- 已经被保存成 `[图片]` 的旧表格不能靠本次修复自动还原，需要从旧备份/本地草稿恢复，或重新填写。
- 保存失败时，已经上传的图片可能成为孤立附件。
- 部署后旧标签页可能加载旧资源，出现异常先硬刷新。
