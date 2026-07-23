# 飞书智能录入台 Portal

飞书智能业务数据中台的前端入口 — 截图智能录入台。

将聊天截图上传后，通过 OCR → 候选字段提取 → 治理规则校验 → 飞书业务表写入的完整流水线，将非结构化对话转化为结构化业务数据。

## 系统架构关系

本 Portal 是飞书智能业务数据中台（FEISHU-AI-MIDDLE-PLATFORM）的前端入口，与后端三个组件协作：

```
用户浏览器
  ↓ 上传截图
Portal (本项目, Next.js :3000)
  ↓ HTTP 调用 Screenshot API V1
Collator (数据摄入入口, Fastify :8787)
  ↓ PRE_WRITE 治理请求
SOP (统一治理门禁, Node.js :3001)
  ↓ BR-01~BR-06 规则校验
  ↓ 返回 Governance Result V1
Collator 执行 dry-run 写入
  ↓ （dry-run 模式不写入生产飞书）
飞书多维表格（权威业务数据库，本 demo 不接触）
```

**四者职责**：
- **Portal**：前端 UI，上传截图 → 展示候选字段 → 人工修正 → 展示治理结果。不含业务规则。
- **Collator**：数据摄入入口，负责 OCR → Candidate 提取 → PRE_WRITE 治理 → 写入。本 demo 默认 dry-run。
- **SOP**：统一治理门禁，执行 BR-01~BR-06 业务规则校验（客片必关联客户、样片必关联模特、类型缺失不猜测等），返回 PASS/NEEDS_REVIEW/BLOCKED。
- **飞书多维表格**：权威业务数据库，日常操作界面。本 demo 不写入生产飞书。

## 技术栈

- **Next.js 16** (App Router)
- **React 19**
- **Tailwind CSS 4**
- **zustand 5** (状态管理)
- **TypeScript 5** (严格模式)

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:3000）
npm run dev

# 生产构建
npm run build

# 启动生产服务器
npm start
```

## Demo 边界声明

> **演示环境 | dry-run 模式 | 不写入生产飞书**

本项目默认以 **Mock 模式** 运行，所有 OCR、治理、写入均为本地模拟，不调用任何后端服务，不写入生产飞书业务表。

- **Mock 模式（默认）**：使用 `lib/api-mock.ts` 中的匿名合成数据，不调用 collator。数据为虚构内容（如「匿名客户123」），不含真实客户信息。
- **Real 模式**：通过环境变量 `NEXT_PUBLIC_API_BASE_URL` 指向 collator HTTP 服务。即便切换到 Real 模式，仍可通过「dry-run」开关阻止实际写入飞书。
- **前端不包含客片/样片业务规则**（BR-07 入口一致性），业务规则由 collator 服务端治理引擎统一执行。

### 配置 Real 模式

复制 `.env.local.example` 为 `.env.local` 并修改：

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787
```

未设置该环境变量时，默认使用 Mock 模式。

## 功能概览

1. **上传截图**：拖拽或点击上传 1~10 张聊天截图（JPEG/PNG）
2. **处理流水线**：6 阶段可视化（上传 → OCR → 候选 → 治理 → 写入 → 完成）
3. **证据查看**：OCR 文本块展示 + 候选字段高亮关联证据来源
4. **人工修正**：编辑候选字段，修正后标记为 CONFIRMED 权威等级
5. **治理结果**：展示 PASS / NEEDS_REVIEW / BLOCKED / DUPLICATE_SKIPPED 四类决策
6. **飞书记录引用**：写入成功后展示飞书业务记录 ID 与目标表

## API 契约

Portal 适配 collator 受控 API 契约 `screenshot-api-v1.ts`（冻结于 2026-07-22），共 7 个 API：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/screenshots` | 创建截图提交 |
| GET | `/v1/screenshots/:id` | 查询处理状态 |
| GET | `/v1/screenshots/:id/evidence` | 获取 OCR 证据和 Candidate |
| POST | `/v1/screenshots/:id/corrections` | 提交人工修正 |
| POST | `/v1/screenshots/:id/confirm` | 确认写入 |
| POST | `/v1/screenshots/:id/escalate-review` | 转人工复核 |
| GET | `/v1/screenshots/:id/final-result` | 获取最终治理和写入结果 |

## 项目结构

```
portal/
├── app/
│   ├── layout.tsx              # 中文界面 lang=zh-CN
│   ├── page.tsx                # 主页面单页应用
│   └── globals.css             # Tailwind CSS 4 + 中文字体栈
├── components/
│   ├── UploadZone.tsx          # 拖拽/点击上传
│   ├── ScreenshotList.tsx      # 缩略图列表
│   ├── ProcessingStatus.tsx    # 6 阶段进度条
│   ├── EvidenceViewer.tsx      # OCR 证据 + 字段高亮
│   ├── CorrectionForm.tsx      # 人工修正表单
│   ├── ResultPanel.tsx         # 治理结果展示
│   ├── FeishuRecordRef.tsx     # 飞书记录引用
│   └── DemoDisclosureBanner.tsx# 演示边界披露横幅
├── lib/
│   ├── types.ts                # API 类型 + 前端专用类型
│   ├── api-client.ts           # mock/real 双模式 API Client
│   ├── api-mock.ts             # 7 API Mock 实现
│   └── store.ts                # zustand 全局状态
├── public/demo/
│   ├── chat-screenshot-1.svg   # 匿名聊天截图样例
│   └── chat-screenshot-2.svg
└── .env.local.example          # 环境变量示例
```

## 安全约束

- 浏览器端不存放飞书 Secret 或正式写入 Token（AC-B09）
- Real 模式直接调用 collator HTTP 服务，不携带任何凭据
- 客户端禁用重复点击，服务端以幂等键为准（AC-B08）
