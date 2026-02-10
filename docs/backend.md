# iBooks 后端说明（backend）

本文档基于当前仓库的后端实现整理，目标是让维护者快速了解：
- 后端技术栈与目录结构
- 配置项（环境变量）与本地运行方式
- 数据库（SQL Server）连接方式与迁移策略
- 鉴权机制与 API 路由概览
- 关键业务规则（叶子分类、资金来源、退款/转账等）
- 统计口径（尤其是“支出扣退款”的净额口径）

---

## 1. 技术栈与依赖

后端位于 `backend/`，主要依赖见 `backend/requirements.txt`：
- Web 框架：FastAPI + Uvicorn
- ORM：SQLAlchemy 2.x
- 迁移：Alembic
- 数据库：SQL Server（通过 `mssql+pyodbc`）
- DTO/校验：Pydantic v2 + pydantic-settings
- 鉴权：JWT（HS256，python-jose）
- 密码：bcrypt（passlib + bcrypt）

---

## 2. 目录结构

- `backend/app/main.py`
  - FastAPI 入口：CORS、挂载路由、可选静态托管前端 dist、SPA fallback
  - 启动时执行 `ensure_seed_data`

- `backend/app/core/config.py`
  - `Settings`：所有环境变量配置（前缀 `IBOOKS_`）

- `backend/app/core/security.py`
  - 密码 hash/verify（bcrypt）
  - JWT token create/decode（HS256）

- `backend/app/db/session.py`
  - SQL Server 连接串构造（ODBC Connection String）
  - SQLAlchemy engine / SessionLocal

- `backend/app/db/init_db.py`
  - 启动自检/初始化：创建默认 admin、初始化默认分类根

- `backend/app/api/routers/*`
  - 各模块 API 路由（统一挂载到 `/api`）

- `backend/app/models/*`
  - SQLAlchemy 模型

- `backend/alembic/`
  - Alembic 配置与迁移脚本（`versions/`）

---

## 3. 配置与环境变量（Settings）

配置类：`backend/app/core/config.py`，统一使用前缀 `IBOOKS_`，支持从 `.env` 加载。

### 3.1 数据库

- `IBOOKS_DB_SERVER`：默认 `.\SQLEXPRESS`
- `IBOOKS_DB_NAME`：默认 `iBooks`
- `IBOOKS_DB_TRUSTED_CONNECTION`：默认 `True`（Windows 身份验证）
- `IBOOKS_DB_USER` / `IBOOKS_DB_PASSWORD`：当 `Trusted_Connection=False` 时必填
- `IBOOKS_DB_DRIVER`：默认 `ODBC Driver 17 for SQL Server`

连接方式：`backend/app/db/session.py` 使用 ODBC 连接串并通过 `quote_plus` 组装到 SQLAlchemy URL：
- `mssql+pyodbc:///?odbc_connect=<ODBC_STRING>`

### 3.2 鉴权

- `IBOOKS_JWT_SECRET`：JWT 密钥（默认值仅用于开发；部署时必须替换）
- `IBOOKS_JWT_EXPIRE_MINUTES`：默认 60

Cookie 模式（用于本地部署体验）：
- `IBOOKS_AUTH_COOKIE_NAME`：默认 `ibooks_auth`
- `IBOOKS_AUTH_COOKIE_SAMESITE`：默认 `lax`
- `IBOOKS_AUTH_COOKIE_SECURE`：默认 `False`

说明：后端同时支持两种 token 传递方式：
- `Authorization: Bearer <token>`（HTTP Bearer）
- HttpOnly Cookie（`ibooks_auth`）

### 3.3 CORS 与静态托管前端

- `IBOOKS_CORS_ORIGINS`：逗号分隔；默认允许本地 5173/8000
- `IBOOKS_SERVE_FRONTEND`：是否由后端托管 Vite 构建产物（默认 `False`）
- `IBOOKS_FRONTEND_DIST_DIR`：默认 `../frontend/dist`（支持相对/绝对路径）

---

## 4. 本地运行与迁移

### 4.1 迁移（Alembic）

后端依赖 Alembic 维护 schema：
- 迁移脚本：`backend/alembic/versions/*.py`
- 多数迁移脚本不支持 downgrade（`raise NotImplementedError`），建议仅“向前迁移”。

启动时的自检：`backend/app/db/init_db.py` 会检查 `users.role` 是否存在；若缺失会直接抛错提示执行：
- `alembic upgrade head`

### 4.2 启动初始化（seed）

`ensure_seed_data` 做两件事：
- 若用户表为空：创建默认管理员（`admin/admin`）
- 若分类表存在且当前用户没有任何分类：创建默认收入/支出根与默认子类

### 4.3 启动服务

常见命令（在 `backend/` 目录）：
- `uvicorn app.main:app --reload`

---

## 5. 鉴权与权限模型

### 5.1 JWT + Cookie

- 登录成功后会签发 JWT（sub 为 user.id），并：
  - 返回 `access_token`
  - 同时写入 HttpOnly Cookie（默认 `ibooks_auth`），用于刷新页面后仍保持登录

### 5.2 当前用户解析

依赖注入：`backend/app/api/deps.py`
- 优先从 Bearer Token 取 token
- 否则从 Cookie 取 token
- 校验 token 后按 user_id 加载用户，并要求 `is_active=True`

### 5.3 管理员权限

- `require_admin_user`：仅 `User.role == admin` 通过
- 用户管理与注册接口需要管理员

---

## 6. 数据库设计（核心表）

### 6.1 users

- `id`, `username`(唯一), `password_hash`, `is_active`, `time_zone`, `role`(admin/user)

### 6.2 categories（分类树）

- `id`, `user_id`, `type`(income/expense), `name`, `parent_id`, `sort_order`, `is_active`
- 分类树在后端以“父子关系 + 排序字段”维护

### 6.3 bank_accounts（银行账户）

- `id`, `user_id`, `bank_name`, `alias`, `last4`, `kind`(debit/credit), `balance_cents`
- 信用卡字段：`billing_day`, `repayment_day`
- `is_active`

### 6.4 transactions（流水）

- `id`, `user_id`
- `type`：`income | expense | transfer | refund`
- `amount_cents`（整数分）
- `occurred_at`（UTC naive datetime；前端以 ISO8601 提交）
- `created_at`（数据库 `SYSUTCDATETIME()` 默认值）
- 分类：`category_id`（当前主口径）
- 资金来源：`funding_source`（cash/bank）
- 银行账户：`bank_account_id`（bank 时必有）
- 转账目标：`to_bank_account_id`（transfer 时使用）
- 退款关联：`refund_of_transaction_id`（refund 指向被退款的 expense）
- `note`

说明：
- `account_item_id` 为历史字段（保留以兼容迁移）；当前业务主要使用 `category_id`。

### 6.5 标签

- `category_tags`：绑定到“费用一级分类（expense 根的直接子类）”
- `transaction_tags`：流水与标签多对多（联合主键：`transaction_id + tag_id`）

---

## 7. API 路由概览

所有路由统一前缀：`/api`（见 `backend/app/main.py`）。

### 7.1 auth

- `POST /api/auth/login`：登录（写 cookie，返回 token）
- `POST /api/auth/logout`：清 cookie
- `GET /api/auth/me`：当前用户
- `POST /api/auth/register`：创建新用户（管理员）

### 7.2 config

- `GET/POST/PATCH /api/config/bank-accounts`：银行账户增删改查
- `GET /api/config/categories/tree`：分类树
- `POST/PATCH/DELETE /api/config/categories`：分类节点维护
- `GET/POST/DELETE /api/config/categories/{id}/tags`：费用一级分类的标签维护
- `GET/POST/PATCH /api/config/users`：用户管理（管理员）

### 7.3 ledger

- `GET /api/ledger/transactions`：流水列表（服务端分页），并返回顶部汇总 `incomeCents/expenseCents`
- `POST /api/ledger/transactions`：新增收入/支出
- `PATCH /api/ledger/transactions/{id}`：编辑（不支持 transfer/refund）
- `DELETE /api/ledger/transactions/{id}`：删除
- `POST /api/ledger/transactions/{id}/refund`：对“银行卡支出”发起退款
- `POST /api/ledger/transfers`：转账（在 transactions 中写一条 `type=transfer` 记录）

### 7.4 stats

- `GET /api/stats/year-category`：年度分类统计（收入/支出）
- `GET /api/stats/month-category`：月度分类统计（收入/支出）
- `GET /api/stats/yoy-monthly`：同比（按月 + 分类）
- `GET /api/stats/monthly-range`：月份范围内按月收入/支出折线

---

## 8. 关键业务规则（后端强校验）

### 8.1 叶子分类必选

创建/编辑支出或收入时：
- 分类必须存在、属于当前用户、且启用
- 必须是叶子节点（通过查询是否存在子节点判定）

### 8.2 收入/支出类型不可混用

- 支出流水只能挂到 expense 分类树
- 收入流水只能挂到 income 分类树

### 8.3 资金来源与银行账户

创建流水时：
- `funding_source=cash`：`bank_account_id` 必须为空
- `funding_source=bank`：`bank_account_id` 必填且账户必须启用

余额校验（借记卡）：
- 借记卡（`kind=debit`）支出/转账会校验余额不能为负
- 退款会增加余额

### 8.4 转账

- `fromBankAccountId != toBankAccountId`
- 两个账户都必须启用
- 借记卡转出不得透支

### 8.5 退款

- 仅支持对 `type=expense` 且 `funding_source=bank` 的流水退款
- 退款会生成一条 `type=refund` 的流水，并通过 `refund_of_transaction_id` 指向原支出
- 支持全额/部分退款；退款总额不得超过原始支出金额

---

## 9. 统计与“支出扣退款”的口径

本项目对“支出相关汇总/统计”统一采用**净支出**口径（见 docs/frontend.md 的口径说明），后端实现要点：

- 退款以独立流水 `type=refund` 保存
- 支出统计/汇总时，退款会冲减被退款的那条支出
- 退款的归属按“原始支出发生日期（expense.occurred_at）”落桶，而不是 refund.occurred_at

在后端接口层面的体现：
- `GET /api/ledger/transactions` 返回的 `expenseCents` 为净支出
- `GET /api/stats/*` 中 `type=expense` 的各类聚合，均按原始支出日期归属退款扣减

---

## 10. 静态托管与 SPA fallback

当 `IBOOKS_SERVE_FRONTEND=true` 且 `frontend/dist` 存在时：
- 后端会将 dist 挂载到 `/`
- 对非 `/api` 的 404 路径，会尝试回退到 `index.html`（用于 React Router 客户端路由）

