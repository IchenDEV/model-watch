# Model Watch

持续监控 AI 模型厂商与云厂商的新模型发布/上架，聚合成时间线页面，提供 RSS / Atom 订阅源和飞书机器人 webhook 推送。

## 功能

- 时间线页面：最近 200 条新模型事件，支持来源筛选、关键词搜索、复制 RSS 链接
- RSS 2.0：`/feed.xml`；Atom 1.0：`/feed.atom`（最近 50 条）
- 刷新接口：`GET|POST /api/refresh`，并发拉取全部来源，三层去重后入库并推送飞书通知
- 可插拔来源 adapter（`lib/sources/`）：openrouter、models.dev、OpenAI/DeepMind 博客 RSS、HuggingFace 新模型、可选的直连厂商层（`DIRECT_PROVIDERS`）

## 架构

```
poll (GitHub Actions / Vercel Cron / 手动)
        │ POST /api/refresh
        ▼
  并发 fetch 各来源 adapter (15s 超时，单源失败不阻塞)
        ▼
  三层去重: ① 同源增量快照  ② 事件幂等 addEventNX  ③ 跨源 canonical 合并
        ▼
  store (Upstash Redis ── 未配置则降级本地文件 .data/store.json)
        ├──► 时间线页面 /        ├──► /feed.xml  /feed.atom
        └──► 飞书 webhook 推送 (可选签名)
```

## 本地开发

```bash
npm install
npm run dev
```

无需 Redis：未配置 Upstash 环境变量时自动使用本地文件存储 `.data/store.json`。

触发一次抓取：打开 `http://localhost:3000/api/refresh`（或 `curl -X POST`）。首次为 bootstrap：每个来源只生成最新 20 条事件且不通知。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | 否 | Upstash Redis REST URL；与 TOKEN 同时存在时启用 Redis 存储 |
| `UPSTASH_REDIS_REST_TOKEN` | 否 | Upstash Redis REST Token |
| `CRON_SECRET` | 否 | 配置后 `/api/refresh` 要求 `Authorization: Bearer <secret>` 或 `?secret=` |
| `FEISHU_WEBHOOK_URL` | 否 | 飞书自定义机器人 webhook，未配置则跳过通知 |
| `FEISHU_WEBHOOK_SECRET` | 否 | 飞书机器人签名密钥（HMAC-SHA256） |
| `SITE_URL` | 否 | 站点 URL，用于通知文案，缺省 `http://localhost:3000` |
| `DIRECT_PROVIDERS` | 否 | JSON 数组，直连厂商 API，例：`[{"name":"zhipu","base":"https://open.bigmodel.cn/api/paas/v4","key":"..."}]`；Google 风格加 `"style":"google"` |

## 部署（Vercel）

1. 把仓库 push 到 GitHub，在 Vercel 中 **Import Project**。
2. 在 Vercel 项目中添加 **Upstash Redis** 集成（Storage → Create Database → Upstash），它会自动注入 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`。
3. 按需配置上表其余环境变量（至少建议 `CRON_SECRET`、`SITE_URL`）。
4. Deploy。部署后访问一次 `/api/refresh` 完成 bootstrap。

## 定时轮询（GitHub Actions）

`.github/workflows/poll.yml` 每 15 分钟触发一次刷新：

- 仓库 **Settings → Variables** 添加 `REFRESH_URL`（如 `https://your-app.vercel.app`）
- 仓库 **Settings → Secrets** 添加 `CRON_SECRET`

## 关于 Vercel Cron 的限制

Vercel Hobby（免费）计划的 Cron Jobs 每天最多触发一次、且只能配少量任务，无法满足 15 分钟轮询，因此本项目默认使用 GitHub Actions 轮询（免费额度足够）。若使用 Vercel Pro，可在 `vercel.json` 中配置 cron 直接调度 `/api/refresh`。
