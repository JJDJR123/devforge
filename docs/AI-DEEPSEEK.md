# 接入 DeepSeek AI 助手

DEVFORGE 的 AI 助手**只对管理员开放**，API Key 只保存在服务器，不会发送到浏览器，也不会提交到 Git。

## 1. 先拿到 DeepSeek API Key

1. 打开 <https://platform.deepseek.com/>
2. 注册 / 登录
3. 进入 **API Keys**
4. 创建 Key，复制以 `sk-` 开头的字符串
5. 在「充值 / 余额」里确认账户有可用额度

> Key 只显示一次。不要发到聊天、截图或 Git 仓库里。

## 2. 在服务器上配置

用 Workbench 登录服务器，编辑：

```bash
sudo nano /opt/devforge/.env
```

在文件末尾添加：

```env
# DeepSeek AI 助手
AI_API_KEY=sk-你的key
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-flash
AI_MODELS=deepseek-flash,deepseek-v4-pro
AI_MAX_TOKENS=1200
```

保存：`Ctrl + O`，回车；退出：`Ctrl + X`。

然后重启：

```bash
sudo systemctl restart devforge
```

确认服务正常：

```bash
sudo systemctl status devforge --no-pager
curl -fsS http://127.0.0.1:3000/api/health
```

## 3. 在网站里打开

登录管理端：

```text
http://8.166.135.9:8080/admin
```

右下角会出现一个带星光的 **AI** 按钮：

```text
✨ AI
```

点开它会看到：

- 当前状态：`DeepSeek · 模型可切换`
- 输入框
- 「总结当前页面」
- 「根据我的笔记回答」
- 「找出和这个页面相关的笔记」

第一次打开时如果显示「等待配置 / 还差一步」，说明 `.env` 没有读到或服务没有重启。

> 公开站访客看不到这个按钮；AI 只存在于管理员后台。

## 4. 它会怎么工作

你提问时，服务器会：

1. 读取当前页面（如果在页面里打开 AI）；
2. 用问题搜索相关笔记；
3. 读取这段对话的长期摘要和最近几轮消息；
4. 把「摘要 + 最近消息 + 最多约 15,000 字的相关笔记」发给 DeepSeek；
5. 返回答案，并列出参考页面链接。

第一版是「关键词检索 + 当前页面 + 对话摘要」的 RAG，**不会把全部历史一次性发过去**。每 10 条消息会自动更新一次长期摘要，避免越聊越糊涂。

## 5. 对话日志保存在哪里

所有 AI 对话都会保存在服务器：

```text
/opt/devforge/data/ai-logs/
├── index.md                    # 所有会话索引
├── <conversation-id>.md        # 完整对话记录
└── ...
```

- 每段对话一个 Markdown 文件；
- `index.md` 记录标题、消息数、最近更新时间；
- 对话也同时保存在 SQLite 的 `ai_conversations` / `ai_messages` 表里，刷新页面后可以继续；
- 后台 AI 面板右上角有「对话记录」按钮，可以切换历史对话；「+」是新对话。

`data/ai-logs/` 不在 Git 里，自动更新不会覆盖；`deploy/backup.sh` 会把它和数据库、uploads 一起备份。

> 对话日志是明文保存在你自己的服务器上，请自己控制服务器访问权限。

## 6. 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 面板显示「等待配置」 | `.env` 没有 `AI_API_KEY`，或服务没重启 | 检查 `.env`，`systemctl restart devforge` |
| `AI_AUTH_FAILED` / 401 | Key 无效或已被删除 | 重新创建 Key，更新 `.env` |
| 余额不足 / 402 | DeepSeek 账户没充值 | 到 DeepSeek 控制台充值 |
| 429 | 请求太频繁或额度受限 | 等几分钟再试 |
| 连接 DeepSeek 失败 | 服务器访问不了 `api.deepseek.com` | 检查服务器网络 / DNS，必要时换可用的 OpenAI 兼容代理 |
| 回答没有引用笔记 | 没有搜到相关页面 | 换更具体的问法，或先把相关笔记写完整 |

## 7. 费用与隐私

- 按 token 计费，具体价格以 DeepSeek 官网为准。
- 为了回答你的问题，相关笔记内容会发送给 DeepSeek API。
- 不要把密码、身份证、银行卡、API Key 等敏感信息写进笔记后再让 AI 读取。
- AI 结果可能出错，涉及命令、备份、账号操作时请核对原文。

## 8. 切换模型

现在可以直接在 AI 面板里切换：

```text
模型 [ DeepSeek V4.1 Flash（通用） ▾ ]
```

默认允许两个：

```env
AI_MODEL=deepseek-flash
AI_MODELS=deepseek-flash,deepseek-v4-pro
```

| 模型 | 适合 | 取舍 |
| --- | --- | --- |
| `deepseek-flash` | 日常问答、总结、整理笔记 | 快、便宜，支持图片输入 |
| `deepseek-v4-pro` | 复杂推理、长文规划、难问题 | 更慢、更贵，不支持图片 |

建议只保留这两个，不要把所有模型都塞进去。切换后会保存到本地设置，**下一轮对话**使用新模型，当前会话不会丢失。

想增加别的兼容模型：在 `.env` 的 `AI_MODELS` 里加逗号分隔的模型名，重启 `devforge` 后下拉框会出现。模型名必须在白名单里。

## 9. 为什么不会和 Git 冲突

`AI_API_KEY` 在 `/opt/devforge/.env`，这个文件：

- 不在 Git 里
- 不会被自动更新覆盖
- 重启服务后一直有效

自动更新只拉代码，不会改 `.env` 和 `data/`。
