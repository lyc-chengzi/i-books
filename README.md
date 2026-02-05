# iBooks

个人记账系统（本地部署）：前端 React + Ant Design；后端 FastAPI；数据库 SQL Server Express。

## 运行前准备（Windows）

1) 使用 SSMS 创建数据库：`iBooks`
- 连接实例：`.\SQLEXPRESS`
- 新建数据库：`iBooks`

2) 配置后端环境变量
- 复制 [backend/.env.example](backend/.env.example) 为 `backend/.env`
- 设置 `IBOOKS_JWT_SECRET`（不要提交到仓库）
- 默认使用 Windows 身份验证连接本机 SQL Server Express

## 启动后端

在 `backend` 目录：
- 创建虚拟环境并安装依赖：`pip install -r requirements.txt`
- 初始化表结构（首次运行或变更后）：`alembic upgrade head`
- 启动：`uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`

### 常见问题：`alembic upgrade head` 连接失败

- 报错包含 `4060`（无法打开数据库）或 `18456`（登录失败）：
	- 确认你已在 SSMS 创建数据库 `iBooks`（名称与 `IBOOKS_DB_NAME` 一致）。
	- 如果你使用 **Windows 身份验证**（`IBOOKS_DB_TRUSTED_CONNECTION=true`），需要确保当前 Windows 用户对 `iBooks` 有权限。
	- 如果你更倾向使用 **SQL 登录**（例如 `sa`），把 `IBOOKS_DB_TRUSTED_CONNECTION=false`，并在 `backend/.env` 里填写 `IBOOKS_DB_USER`/`IBOOKS_DB_PASSWORD`（不要提交到仓库）。

启动后会自动建表并初始化一个默认用户：
- 用户名：`admin`
- 密码：`admin`

## 启动前端

在 `frontend` 目录：
- 安装依赖：`pnpm install`（或 `npm install`）
- 启动：`pnpm dev`（或 `npm run dev`）

前端默认代理 `/api` 到 `http://127.0.0.1:8000`。

## 本机部署（不需要每次跑开发命令）

目标：前端打包成静态文件，后端 FastAPI 直接托管 `frontend/dist`，你只需要启动一个后端进程，然后访问 `http://localhost:8000`。

1) 配置后端环境变量
- 复制 [backend/.env.example](backend/.env.example) 为 `backend/.env`
- 设置 `IBOOKS_JWT_SECRET`
- 确认 `IBOOKS_SERVE_FRONTEND=true`

2) 一键构建 + 启动（推荐）

在仓库根目录运行（PowerShell）：
- `powershell -ExecutionPolicy Bypass -File .\deploy\windows\run-local.ps1`

运行后打开：`http://localhost:8000`

3) 可选：开机/登录自动启动（Task Scheduler）

安装任务：
- `powershell -ExecutionPolicy Bypass -File .\deploy\windows\install-schtask.ps1`

立刻启动任务：
- `schtasks /Run /TN iBooks`

卸载任务：
- `powershell -ExecutionPolicy Bypass -File .\deploy\windows\uninstall-schtask.ps1`

## 最小可用路径

- 登录：`/login`
- 配置/银行账户：创建银行卡账户
- 配置/记账项：创建收入/支出记账项（叶子）
- 记账/新增流水：选择资金来源（现金/银行卡）并保存

> 提醒：token 只保存在内存，关闭浏览器即退出登录。
