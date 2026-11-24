# 成员申请与只读权限

## 流程

```text
访客打开 /apply
→ 填用户名、密码、申请说明
→ 进入 pending 申请队列
→ 管理员在 /requests 审批
→ 通过后创建 reader 账号
→ 申请人用申请时的用户名/密码登录
→ 进入成员只读空间
```

管理员审批页：

```text
/admin → 注册申请
```

## 角色

### admin

完整管理权限：页面、模块、知识库、素材库、设置、AI。

### reader

只读：

- 公开页面
- `visibility = members` 的知识库条目
- 公开页面里已经引用的图片

不能：

- 编辑页面 / 上传 / 删除
- 访问管理员知识库、草稿、未引用素材
- 访问 `/api/bootstrap`、`/api/kb`、`/api/assets` 等管理接口
- 使用管理员 AI
- 管理用户或审批申请

## 知识库可见范围

管理员在知识库编辑器里选择：

```text
仅管理员
成员可见
```

只有同时满足：

```text
status = published
visibility = members
```

成员才能看到。现有知识库默认是“仅管理员”，需要手动改成“成员可见”。

## 成员素材库

只显示：

- 公开页面 blocks 里引用的图片
- 不显示未引用文件
- 不显示站点 Logo、模块图标、管理用素材

## 防刷

- 公开申请页有蜜罐字段
- 同一 IP 3 次/小时
- 全站 50 条申请/24 小时
- 密码使用 scrypt
- 申请写入 `registration_requests`，不直接创建账号
- 管理员审批后才创建用户

## 当前没有做

- 邮件验证（没有配置 SMTP）
- Turnstile / 图形验证码（需要申请站点 key）
- 自动通知申请人（需要邮件/短信）
- 封禁/删除成员的管理 UI
- 私密模块对成员开放

## 测试

```text
1. /apply 提交申请
2. 管理员 /requests 看到 pending
3. 审批通过
4. 申请人登录 → 进入只读成员页
5. 成员看不到 admin 可见知识库
6. 成员 /api/kb、/api/assets、/api/bootstrap 返回 403
7. 成员 /kb、/assets 正常
8. 公开页面图片可用；未引用图片 /api/public/assets 返回 404
```
