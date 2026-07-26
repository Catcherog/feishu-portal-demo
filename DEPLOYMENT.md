# Portal 部署说明

## 部署目标
将飞书智能录入台 Portal 部署到 Vercel，提供公开受控演示入口。

## 前置条件
- GitHub 账号（Catcherog）
- Vercel 账号
- gh CLI 已登录（`gh auth login`）
- Vercel CLI 已登录（`vercel login`）

## 部署步骤

### 1. 创建 GitHub 仓库
```powershell
cd "D:\360Downloads\Trae 项目\lark\portal"
gh repo create Catcherog/feishu-portal-demo --public --source=. --remote=origin --push
```

### 2. Vercel 部署
```powershell
# 生产部署（Demo Mode 启用，不调用真实 collator）
vercel --prod --yes

# 设置环境变量（在 Vercel 项目设置中或用 CLI）
vercel env add NEXT_PUBLIC_DEMO_MODE production
# 值: true

vercel env add NEXT_PUBLIC_API_BASE_URL production
# 值: http://localhost:8787（演示模式不实际调用）
```

### 3. 验证部署
- 访问 Vercel 分配的 URL
- 确认页面加载正常
- 确认 Demo Mode 横幅显示
- 确认截图上传功能可用（mock 数据）

## 环境变量配置

| 变量 | 值 | 说明 |
|------|-----|------|
| NEXT_PUBLIC_DEMO_MODE | true | Demo/Mock 模式，使用本地模拟数据 |
| NEXT_PUBLIC_API_BASE_URL | http://localhost:8787 | collator 地址（Demo 模式不实际调用） |

## 安全配置
- .env.local 已被 .gitignore 排除
- 飞书 App Secret 不在 Portal 中（仅 collator 服务端）
- Demo Mode 不调用真实飞书 API
- 不展示真实客户数据

## 手动回退
如果 Vercel 部署失败，可使用本地运行：
```powershell
npm run dev
# 访问 http://localhost:3000
```
