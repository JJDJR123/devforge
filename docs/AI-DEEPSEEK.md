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
AI_MODEL=deepseek-chat
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

- 当前状态：`DeepSeek · deepseek-chat`
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
3. 把最多约 15,000 字的笔记上下文发给 DeepSeek；
4. 返回答案，并列出参考页面链接。

第一版是「基于关键词检索 + 当前页面」的 RAG，不是把所有笔记一次性发过去，也不会自动修改笔记。

## 5. 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 面板显示「等待配置」 | `.env` 没有 `AI_API_KEY`，或服务没重启 | 检查 `.env`，`systemctl restart devforge` |
| `AI_AUTH_FAILED` / 401 | Key 无效或已被删除 | 重新创建 Key，更新 `.env` |
| 余额不足 / 402 | DeepSeek 账户没充值 | 到 DeepSeek 控制台充值 |
| 429 | 请求太频繁或额度受限 | 等几分钟再试 |
| 连接 DeepSeek 失败 | 服务器访问不了 `api.deepseek.com` | 检查服务器网络 / DNS，必要时换可用的 OpenAI 兼容代理 |
| 回答没有引用笔记 | 没有搜到相关页面 | 换更具体的问法，或先把相关笔记写完整 |

## 6. 费用与隐私

- 按 token 计费，具体价格以 DeepSeek 官网为准。
- 为了回答你的问题，相关笔记内容会发送给 DeepSeek API。
- 不要把密码、身份证、银行卡、API Key 等敏感信息写进笔记后再让 AI 读取。
- AI 结果可能出错，涉及命令、备份、账号操作时请核对原文。

## 7. 换模型

默认：

```env
AI_MODEL=deepseek-chat
```

想换推理模型可以改成：

```env
AI_MODEL=deepseek-reasoner
```

改完重启服务。推理模型更慢，费用也可能不同。

## 8. 为什么不会和 Git 冲突

`AI_API_KEY` 在 `/opt/devforge/.env`，这个文件：

- 不在 Git 里
- 不会被自动更新覆盖
- 重启服务后一直有效

自动更新只拉代码，不会改 `.env` 和 `data/`。
