# 作品集下载页

## 入口

- 管理：`/portfolio`，只在管理员侧栏显示
- 分享：`/works`，不进入公开站/成员站导航
- 单文件直链：`/api/works/:id/download`

## 规则

- 管理员可上传、改标题/说明、隐藏、删除
- 已上传作品可「替换文件」：作品 ID 和下载直链保持不变，只替换文件内容
- 公开页只显示 `visible = 1` 的文件
- 公开页带 `noindex,nofollow,noarchive`
- 文件不经过图片压缩，原文件保存在 `data/portfolio/`
- 默认单文件上限 200MB，可用 `MAX_PORTFOLIO_MB` 调整
- 如果前面有 Nginx，`client_max_body_size` 必须不小于该值（仓库配置为 220m）
- 支持 PDF、ZIP、图片、MP4、WebM；HTML/SVG 等可执行内容不接受

## 数据库

迁移版本 18：

```sql
CREATE TABLE portfolio_items (...);
```

## 注意

`/works` 是“不公开入口”的分享页，不是登录保护页。拿到链接的人都能访问和下载；如果以后需要密码或一次性 token，可以在这个页面前再加一层访问控制。
