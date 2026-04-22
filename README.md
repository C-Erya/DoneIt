# Task Web Demo

基于 `ref/` 目录中的设计语义，重建了一套完整可运行的前后端应用：

- 前端：`client/`，React + Vite + React Router
- 后端：`server/`，Express + TypeScript
- 数据接口：`/api/overview`、`/api/inspiration`、`/api/execution`、`/api/honor`

## 启动

1. 在项目根目录安装依赖：

```bash
npm install
```

2. 同时启动前后端：

```bash
npm run dev
```

3. 访问：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001/api/health`

## 结构

```text
client/   React 前端
server/   Express API
ref/      原始参考原型
```

## 说明

- 当前后端默认使用本地 JSON 存储，数据保存在 `server/data/app-state.json`。
- 页面内容按 PRD 的三大模块重建：灵感中心、执行中心、成就中心。
- 如果要接入 OpenAI 模型：

```bash
cp server/.env.example server/.env
```

然后至少配置：

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

当前后端会优先使用大模型处理：

- 灵感拆解
- 执行中心的今日进度分析

如果没有配置 `OPENAI_API_KEY`，会自动回退到本地规则逻辑。
