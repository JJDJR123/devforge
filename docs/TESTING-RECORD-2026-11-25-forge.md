# Forge UI 测试记录 · 2026-11-25

范围：Forge 统一界面、最近三篇文档、侧栏模块拖动、聊天 emoji、主题迁移、reader 总览。

## 冒烟

```text
tsc --noEmit             通过
vite build               通过
tools/e2e-editor.mjs     全部通过
tools/e2e-kb.mjs         全部通过
```

## 逐项

| 项目 | 结果 |
|---|---|
| 管理端 Dashboard `.fd-dashboard` | 通过 |
| 最近三篇文档及摘要 | 通过 |
| 模块卡片只显示顶层模块 | 通过 |
| 左侧模块拖动（两个模块，先折叠） | 顺序变化并写入 |
| 聊天室 emoji 打开 | 99 个候选 |
| emoji 按光标插入 `abc` 中间 | 得到 `a😀bc` |
| 好友私聊 emoji | 按钮存在，插入逻辑复用 |
| reader `/` 使用成员版 Forge 总览 | 通过，无页面异常 |
| reader 顶栏 crumb `成员空间` | 通过 |
| reader 最近三篇/公开模块 | 通过 |
| 知识库、素材、设置、账号、聊天、好友 smoke | 无白屏、无 JS 异常 |
| 线上 `/api/health` | 正常 |
| 线上主题迁移 | accent `#f16436`，radius 保留用户值 |
| 模块 accent 迁移 | `#f16436` |

## 审查修复

- 去掉 `global.css` / `ModuleDialog.tsx` 的 UTF-8 BOM
- Dashboard 只渲染顶层模块，恢复 ICP 链接和日期
- 模块卡键盘事件不再在菜单内误触发导航
- 拖动 early return 清理透明状态
- emoji 按光标位置插入
- 主题迁移只改旧绿色强调色，不再强制圆角/网格/环境光
- reader 新增成员版 Forge 总览
- README / UI-FORGE / TESTING 文档同步

## 仍属视觉债，未在本轮处理

- `forge-shell.css` 仍有部分裸 hex，主题预设不会重着色所有侧栏表面
- 部分旧页面仍有硬编码圆角
- `global.css` 和工作台之外的部分旧布局没有逐页重做
