# Forge Preview / CurseForge 方向预览

这是独立预览版，不替换现有工作台。

## 打开

```text
https://your-site/forge-preview
```

需要管理员登录。

当前 Dashboard 的「新版预览」按钮也会进入这里。

## 这一版包含

- 深灰 + 品牌橙，不使用现有荧光绿
- CurseForge 式内容卡：最近三篇文档
  - 第一篇主卡：页面封面 / 标题 / 摘要 / 模块 / 更新时间 / 字数
  - 后两篇辅卡：标题 / 模块 / 时间 / 摘要
- 左侧「我的模块」支持拖动排序
  - 只拖动模块行，不拖动系统导航
  - 手柄出现后才可拖
  - 仅预览本地排序，不写回数据库
- 模块卡显示页面数、字数、Todo 进度
- 顶部真实统计：模块 / 页面 / 累计字数 / 最近更新

## 这一版没有做

- 不替换旧版 Dashboard
- 不写回模块排序
- 不新增模块/页面封面字段
- 没有真实游戏封面时使用深色排版兜底
- 没有改公开站和成员站

## 相关文件

- `src/views/ForgePreview.tsx`
- `src/styles/forge-preview.css`
- `src/App.tsx`
- `src/views/Dashboard.tsx`（预览入口）
