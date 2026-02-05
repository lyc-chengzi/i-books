# iBooks（个人记账系统）Copilot 开发指引（初版）

> 当前仓库暂无代码；本文件基于需求做“可执行的初始约定”。当代码/技术栈落地后，请用实际实现细节替换或删减本文件中的“建议”。

## 技术栈（已确定）
- 前端：React + TypeScript + Vite
- UI：Ant Design 6
- 请求与缓存：`ofetch` + TanStack Query（React Query）
- 图表：ECharts
- 后端：FastAPI + Uvicorn
- ORM/迁移：SQLAlchemy 2.x + Alembic
- 数据库：SQL Server Express（本机实例 `\\.\\SQLEXPRESS`）
- 连接驱动：pyodbc（通过 SQLAlchemy 的 `mssql+pyodbc`）
- 数据校验/DTO：Pydantic

## 目标与菜单边界
- **记账**：录入收入/支出；录入时必须选择到“具体记账项”（叶子节点），例如 `日常消费/超市购物`、`交通消费/汽车消费/加油费`；并选择**资金来源**（现金/银行卡），银行卡需选择到具体银行账户。
- **统计**：按多维度聚合（分类、时间、同比/环比、月度折线等），统计应基于“已记账流水”可复算。
- **配置**：基础数据维护（用户、分类树、记账项、银行账户等），为记账与统计提供稳定的维表。

## 领域模型（建议按此命名）
- `User`：用户（支持多用户与登录；建议包含 `username`（唯一）、`passwordHash`、`isActive`、`timeZone` 等字段）。
- `Category`：分类节点（树形结构，收入/支出分别一棵树或用 `type` 区分）。
- `AccountItem`：具体记账项（叶子；可扩展；用于记账选择与统计归类）。
- `BankAccount`：银行账户（银行名称、账户别名/卡号后四位、启用/禁用等；**本阶段不做余额/对账**，仅用于选择与统计筛选）。
- `Transaction`：账目流水（收入/支出、金额、时间、所属记账项、资金来源：现金/银行卡、银行卡时关联银行账户、备注；必须关联 `userId`）。

## 关键业务规则（实现时要显式校验）
- 记账时 **必须选择叶子记账项**：不允许只选到中间分类。
- 收入/支出 **类型不可混用**：支出流水不能挂到收入树的项目上，反之亦然。
- 资金来源规则（收入/支出都适用）：
	- 选择 **现金**：`bankAccountId` 必须为空。
	- 选择 **银行卡**：`bankAccountId` 必填，且必须指向“启用”的 `BankAccount`。
- 分类/项目被禁用或删除时：既有流水 **保持可追溯**（建议保留快照字段或做软删除）。
- 银行账户被禁用/删除时：既有流水 **保持可追溯**（建议软删除或写入快照：银行名/别名/卡号后四位）。

## 数据与字段约定（避免统计误差）
- 金额：使用 **整数分**（或最小货币单位）存储与计算，展示时格式化。
- 时间：统一使用 `UTC` 存储 + 本地时区展示；统计按“用户时区”的自然月/年切分。
- 分类路径：统计展示用“路径字符串”或“祖先链”构建，例如 `交通消费/汽车消费/加油费`。
- 资金来源字段：建议 `fundingSource=cash|bank` + 可选 `bankAccountId`（仅当 `fundingSource=bank`）。
- 所有聚合统计必须可由流水重算；不要只存结果。

## 认证与多用户（约定）
- 后端鉴权：FastAPI 使用 **JWT Bearer Token**（`Authorization: Bearer <token>`）。
- 密码存储：只存 `passwordHash`（建议 `argon2` 或 `bcrypt`），严禁明文密码。
- 密钥与过期：JWT `secret`/`private key` 只从环境变量读取（示例：`IBOOKS_JWT_SECRET`），设置合理过期时间（例如 30-120 分钟），必要时再引入 refresh token。
- 接口权限：除登录/注册（若开放）外，所有记账/统计/配置接口默认要求已登录用户，并以 `userId` 做数据隔离。
- 前端携带 token：统一在 `ofetch` 的封装层/实例中注入 `Authorization` 头；TanStack Query 的所有请求复用该封装。
- 登录态策略：**关闭浏览器即退出**——token 只保存在内存（例如 React state/Context），不落盘到 `localStorage`/`sessionStorage`。

## 本地数据库（当前开发环境）
- 当前已在本机安装并启用 **SQL Server Express**，SSMS 可连接的实例为 `\.\SQLEXPRESS`。
- 建议优先使用 **Windows 身份验证** 连接本机实例；若必须使用 SQL 登录（例如 `sa`），凭据仅允许放在本机私有配置（环境变量/用户机密存储），禁止写入仓库。
- 连接字符串示例（按技术栈调整）：
	- Windows 身份验证：`Server=.\\SQLEXPRESS;Database=iBooks;Trusted_Connection=True;TrustServerCertificate=True;`
	- SQL 登录：`Server=.\\SQLEXPRESS;Database=iBooks;User Id=sa;Password=${IBOOKS_DB_PASSWORD};TrustServerCertificate=True;`
- 推荐统一用环境变量命名（示例）：`IBOOKS_DB_SERVER`、`IBOOKS_DB_NAME`、`IBOOKS_DB_USER`、`IBOOKS_DB_PASSWORD`。

## 统计需求拆解（优先用可组合的聚合查询）
- 按分类统计某年支出：`year` + `type=expense` + `groupBy(accountItem/categoryPath)`。
- 同比：`currentYear` 对比 `currentYear-1` 的同口径聚合。
- 环比：`currentMonth` 对比 `previousMonth` 的同口径聚合。
- 同一分类下一年内按月折线：固定一个 `category/accountItem`，按月份 `groupBy(month)`。

## Copilot 生成代码时的偏好
- 新增功能时先确认：**数据源/存储方案**（SQLite/文件/云 DB 等）、是否需要多用户、是否需要“银行卡账户”维度、是否需要后续扩展到“信用卡/账户余额/转账”。
- 任何“分类树/叶子选择”相关逻辑优先写成可复用函数（例如：`isLeaf(node)`、`getPath(nodeId)`）。
- 统计代码输出应是“图表友好”的结构：明确 `label`、`series`、`xAxis`、`yAxis` 字段；必要时支持按 `fundingSource` 或 `bankAccountId` 过滤/分组。

## 变更要求
- 修改分类/记账项结构时，优先保证：历史流水仍能正确统计/展示。
- 若引入迁移（schema migration），必须提供向后兼容或数据迁移脚本说明。

## checklist (每次完成一个功能/模块前请确认)
- 前端代码是否符合 React + TypeScript 最佳实践
- 前端代码是否符合 Ant Design 6 规范
- 前端代码使用 tsc 命令检查通过且无任何类型警告
- 后端代码是否符合 FastAPI 最佳实践
