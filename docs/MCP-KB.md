# 桌面 Codex 接 DEVFORGE 知识库（MCP）

这个 MCP 只暴露两个工具：

- `kb_search`：检索**已发布**的知识库条目
- `kb_propose`：提交一条**草稿**，等管理员在网页审核

它不会审核、删除或修改已发布内容；没有 token 不能调用。

---

## 1. 在平台拿 token

登录：

```text
http://8.166.135.9:8080/admin
```

进入：

```text
知识库 → 接口 token
```

复制 `DEVFORGE_KB_TOKEN` 的值。  
**不要提交到 Git，也不要发到聊天里。**

---

## 2. 配置 Codex

编辑：

```text
C:\Users\50180\.codex\config.toml
```

在文件末尾添加：

```toml
[mcp_servers.devforge-kb]
command = "node"
args = ["A:/大肥鱼工作区/devforge/tools/kb-mcp.mjs"]
startup_timeout_sec = 30

[mcp_servers.devforge-kb.env]
DEVFORGE_KB_URL = "http://8.166.135.9:8080"
DEVFORGE_KB_TOKEN = "把平台里的 token 填在这里"
```

- Windows 路径用正斜杠，避免 TOML 转义。
- 如果平台跑在本机，`DEVFORGE_KB_URL` 改成 `http://127.0.0.1:3001`。
- 换 token 后只改这一处，然后重启 Codex。

重启 Codex 后，MCP 面板里应该出现 `devforge-kb`。

---

## 3. 在 Codex 里怎么用

### 搜索已发布知识

```text
用 devforge-kb 的 kb_search 查：像素风角色立绘 工作流
```

返回内容包含标题、类型、摘要、工具、正文、提示词、标签。

### 提交草稿

```text
用 kb_propose 提交一条配方：
标题：像素立绘工作流
工具：ComfyUI
正文：...
提示词：...
```

提交后：

```text
DEVFORGE → 知识库 → 待审
```

管理员点「通过」后才会进入 AI 检索。

---

## 4. 安全边界

- `kb_search` 只返回 `status = published`，草稿不会进入 AI 检索。
- `kb_propose` 强制 `draft`，不能直接发布。
- token 在平台设置里，只保存在服务器数据库；MCP 进程通过 Bearer 头调用。
- token 泄露时，去「接口 token → 换一个」，旧 token 立即失效。
- MCP 不直接读 SQLite，也不读 API Key。

---

## 5. 常见问题

### MCP 显示启动失败

在终端手动跑：

```powershell
node "A:\大肥鱼工作区\devforge\tools\kb-mcp.mjs"
```

它不会输出内容，等输入是正常的；按 `Ctrl+C` 退出。

确认：

```powershell
Test-Path "A:\大肥鱼工作区\devforge\tools\kb-mcp.mjs"
node --version
```

### `平台返回 401`

token 不对，或者平台重启后 token 被轮换。回平台重新复制。

### `平台返回 404`

旧的平台还没有 `/api/kb/search`。先部署带知识库的版本。

### 搜不到刚提交的配方

它是草稿，必须在「知识库 → 待审」点「通过」。
