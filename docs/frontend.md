# iBooks 前端说明（frontend）

本文档根据当前仓库中已实现的前端代码整理，目标是让新同学/未来的自己能快速了解：
- 前端目前有哪些功能与页面
- 目录结构与关键模块职责
- 与后端 API 的交互方式与重要约定
- 本地开发/构建/部署的基本说明与注意事项

> 技术栈：React + TypeScript + Vite；UI 为 Ant Design 6；请求封装 ofetch；缓存/请求状态用 TanStack Query；图表用 ECharts。

---

## 1. 功能概览

### 1.1 登录与权限
- 登录页：`/login`
- 登录态检测：应用启动后会调用 `GET /api/auth/me` 判断是否已登录。
- 退出登录：调用 `POST /api/auth/logout`（best-effort），并清理前端内存态。
- 权限控制：
  - 全站除 `/login` 外均需要登录（`RequireAuth`）。
  - `配置/用户` 仅管理员可见/可访问（`RequireAdmin`）。

### 1.2 记账（Ledger）
入口：顶部导航「记账」，默认落在 `新增支出`。

已实现页面：
- 新增支出：`/ledger/expense/new`
  - 选择：金额、发生时间、费用分类（必须叶子）、资金来源（现金/银行卡）、银行卡账户（仅当选择银行卡）、备注
  - 标签：当选择“费用分类”后，会自动识别其「一级费用分类」并加载该一级分类的标签，可多选
- 新增收入：`/ledger/income/new`
  - 选择：金额、发生时间、收入分类（必须叶子）、资金来源（现金/银行卡）、银行卡账户（仅当选择银行卡）、备注
- 转账/还款：`/ledger/transfers/new`
  - 选择：转出账户、转入账户、金额、发生时间、备注
- 流水列表：在记账页左侧常驻显示（不是单独路由页）

流水列表能力（当前实现为一个大卡片组件）：
- 查询与过滤：
  - 类型：全部/支出/收入/转账/退款
  - 资金来源：全部/现金/银行卡(含信用卡)
  - 银行账户：全部 或 指定账户
  - 日期范围：默认本月（支持快捷：今年/去年/本月/上月/本周等）
  - 关键词：按关键字搜索（后端支持的字段由后端决定）
- 分组展示：支持「按日期分组」展开/折叠
- 分页：服务端分页（page/pageSize）
- 编辑：支持对非转账、非退款行进行编辑（主要是时间/分类/标签）
- 删除：删除一条流水
- 退款：
  - 仅支持“银行卡支出”发起退款（支持全额/部分退款）
  - 退款会生成退款流水，并在原支出下作为子行展示

#### 1.2.1 支出口径（含退款）

为了保证“流水列表”和“统计”口径一致，本项目对**支出相关汇总**统一采用“净支出”口径：

- 退款的存储方式：退款会以一条独立流水保存（`type = refund`），并通过 `refundOfTransactionId` 关联到被退款的那条支出流水。
- 净支出定义：
  - 对于任意支出流水 $E$，其可被退款的金额为 $refundSum(E)$。
  - 在汇总统计里，该笔支出对“净支出”的贡献为：$max(0, amount(E) - refundSum(E))$。
- 退款的归属规则（非常重要）：
  - 退款会冲减**原始支出发生日期**所在的时间桶（按原始支出 `occurredAt` 归属），而不是退款发生日期。
  - 这意味着：即使退款发生在之后的日期，只要它退款的是筛选范围内的支出，该退款也会被计入扣减。

在 UI 上的体现：
- 流水列表按日期分组时，分组行的“支出小计”展示的是净支出。
- 流水列表顶部右上角的“支出合计”展示的是净支出。
- 单条支出行可能包含 `refundedCents`（该支出关联的退款总额），用于前端计算净支出与展示退款子行。

### 1.3 统计（Stats）
入口：顶部导航「统计」。

已实现页面：
- 年度统计：`/stats/year-category`
  - 支持切换年份与收支类型（支出/收入）
  - 展示：
    - 分类 TopN 饼图（合并“其他”）
    - 月度趋势折线
  - 支持“按月钻取”：点击折线某月后，加载该月分类饼图并显示月合计
- 同比统计：`/stats/yoy`
  - 切换年份与收支类型
  - 展示：按月两条折线（本年 vs 上年）
- 月度折线（范围内收入/支出）：`/stats/category-monthly`
  - 选择起止月份
  - 展示：范围内每月收入/支出两条折线 + 合计

### 1.4 配置（Config）
入口：顶部导航「配置」。

已实现页面：
- 银行账户：`/config/bank-accounts`
  - 新增账户：银行、别名、后四位、类型（借记卡/信用卡）、余额、（信用卡特有：出账日/还款日）、启用状态
  - 列表：展示账户信息，支持编辑
  - 说明：余额字段在前端有提示“用于支出/转账校验”，但真实校验逻辑取决于后端实现
- 分类树：`/config/categories`
  - 支持「费用/收入」两棵树切换
  - 树形维护：新增根节点/子节点、重命名、启用/停用
  - 拖拽排序：支持拖拽改变父子关系或同级顺序（通过后端 move 接口落库）
  - 删除（叶子）：只能对叶子节点执行删除/停用（是否软删由后端决定）
  - 标签（仅费用一级分类）：
    - 当选中“费用树的一级分类”时，可维护标签列表
    - 删除标签若已被引用，按 UI 文案会改为停用（具体以后端为准）
- 用户管理（仅管理员）：`/config/users`
  - 新增用户：用户名、初始密码、角色、时区、启用
  - 列表：编辑角色/时区/启用状态；可选重置密码

- 流水日志（仅管理员）：`/config/transaction-audit-logs`
  - 列表：按时间倒序展示“流水新增/修改/删除”的审计日志
  - 详情：展开行可查看 `before/after` 快照（JSON）
  - 说明：该页面数据来源于后端管理员接口 `GET /api/admin/transaction-audit-logs`

---

## 2. 路由与布局结构

路由集中在 frontend/src/app/App.tsx：
- `/login`：登录页
- `/`：需要登录（RequireAuth），加载 RootLayout
  - 默认重定向到 `/ledger/expense/new`
- `/ledger/*`：LedgerLayout（左侧流水列表 + 右侧子导航/表单）
  - `/ledger/expense/new`
  - `/ledger/income/new`
  - `/ledger/transfers/new`
- `/stats/*`：StatsLayout（子导航 + 内容）
  - `/stats/year-category`
  - `/stats/yoy`
  - `/stats/category-monthly`
- `/config/*`：ConfigLayout（子导航 + 内容）
  - `/config/bank-accounts`
  - `/config/categories`
  - `/config/users`（管理员）
  - `/config/transaction-audit-logs`（管理员）

布局说明：
- RootLayout：顶部主导航（记账/统计/配置）+ 用户菜单（退出登录）+ Drawer 侧边导航（移动端/窄屏）
- SectionLayout：为 stats/config 提供统一的二级横向菜单 + Outlet 内容区
- LedgerLayout：左侧常驻流水列表，右侧是“新增支出/新增收入/转账还款”的二级导航与表单区域，支持收起/展开右侧面板

---

## 3. 与后端交互方式（重要约定）

### 3.1 API 基础
- 前端所有 API 统一走 `baseURL: /api`（见 frontend/src/lib/api.ts）
- dev 环境代理：Vite 将 `/api` 代理到 `http://127.0.0.1:8000`（见 frontend/vite.config.ts）
- `credentials: 'include'`：前端请求默认携带 cookie（用于 cookie-based 登录态）

### 3.2 鉴权方式
- AuthProvider 登录后会保存 `access_token` 到内存 state（token 字段），但代码注释说明“目前鉴权以 cookie 为主，token 仅用于兼容部分调用”。
- 请求封装支持可选传入 `token`，若传入会自动加 `Authorization: Bearer <token>`。
- 登录态检查使用 `GET /api/auth/me`（未登录会被 catch 并标记 isReady）。

### 3.3 金额与时间
- 金额：前端以「元」输入展示；请求/响应中金额字段多以「分」为单位（`amountCents`、`balanceCents`）。
- 时间：表单使用 dayjs；提交时统一 `toISOString()`（ISO 8601，UTC 偏移由 dayjs 处理）。

### 3.4 React Query 缓存策略（简述）
- QueryClient 默认：不自动重试、窗口聚焦不自动 refetch
- 常见 queryKey：
  - `['transactions', {filters...}]`
  - `['bankAccounts', 'usage']`
  - `['categoriesTree', type]`
  - `['stats', ...]`
- 写操作后通常会 invalidate：`transactions`、`bankAccounts` 等，保证列表/余额可复算。

---

## 4. 目录结构说明（frontend/src）

- app/
  - App.tsx：路由定义与页面骨架
  - layouts/
    - RootLayout.tsx：顶部主导航 + 用户菜单 + 主容器
    - LedgerLayout.tsx：记账页布局（左列表右表单）
    - StatsLayout.tsx / ConfigLayout.tsx：统计/配置二级菜单
    - SectionLayout.tsx：二级菜单通用布局
- auth/
  - AuthProvider.tsx：登录态初始化、login/logout、用户信息（/auth/me）
  - RequireAuth.tsx：未登录跳转 /login
  - RequireAdmin.tsx：非管理员跳转到 /config/bank-accounts
  - useAuth.ts：AuthContext 访问 hook
- components/
  - CategoryLeafSelect.tsx：分类叶子选择器（TreeSelect），禁用非叶子/停用项
  - EChart.tsx：ECharts React 包装（ResizeObserver + click 事件）
  - FloatingFormActions.tsx：表单底部悬浮保存/重置按钮
- lib/
  - api.ts：ofetch client + token header 兼容 + FastAPI 错误信息归一化
- pages/
  - LoginPage.tsx：登录页
  - ledger/：记账相关页面与列表组件
    - TransactionCreateExpensePage.tsx / TransactionCreateIncomePage.tsx：新增支出/收入
    - TransferCreatePage.tsx：转账/还款
    - TransactionListCard.tsx：流水列表（过滤、分组、编辑、删除、退款等）
  - stats/：统计页面与工具
    - YearCategoryStatsPage.tsx：年度统计（饼图 + 折线 + 钻取）
    - YoYStatsPage.tsx：同比
    - CategoryMonthlyLinePage.tsx：范围内月度折线
    - statsUtils.ts：金额格式化、分类路径 map 等
  - config/：配置页面
    - BankAccountPage.tsx：银行账户维护
    - CategoryPage.tsx：分类树维护 +（费用一级）标签维护
    - UserPage.tsx：用户管理（管理员）

全局样式：
- frontend/src/styles.css：全局视觉语言（glass、阴影、圆角），并对部分 Antd 组件做全局细节调整
- 主题 token：在 frontend/src/main.tsx 的 Antd ConfigProvider 中配置（主色、圆角、控件高度等）

---

## 5. 本地开发与构建

### 5.1 开发
在 frontend 目录：
- 安装依赖：`pnpm install`
- 启动：`pnpm dev`

默认：
- 前端端口：5173
- `/api` 代理到后端 8000

### 5.2 构建
- `pnpm build` 会先 `tsc -b` 再 `vite build`

---

## 6. 当前代码中“已实现但未接入路由”的页面/功能

这部分不代表产品需求，仅表示“代码已存在但当前 App 路由未挂载”：
- 配置：frontend/src/pages/config/AccountItemPage.tsx（记账项维护）
- 统计：frontend/src/pages/stats/MoMStatsPage.tsx（环比统计）
- 记账：frontend/src/pages/ledger/TransactionCreatePage.tsx（通用新增流水页面，包含收支类型切换）

如果需要开放入口，通常需要：
- 在 frontend/src/app/App.tsx 增加路由
- 在对应 Layout 的二级菜单（SectionLayout items）里增加导航项

---

## 7. 已知注意点 / 开发备注

- frontend/src/pages/ledger/TransactionListCard.tsx 顶部存在 `alert(version);`（Antd version debug），会导致页面加载弹窗；建议在上线/正常开发时移除。
- 登录态策略：UI 文案与实现均强调“关闭浏览器自动退出登录”，因此不应把 token 落盘到 localStorage/sessionStorage。
- 分类选择：CategoryLeafSelect 会禁用非叶子节点与停用节点；实际业务上“必须选择叶子”主要由后端强校验，前端只做 UX 限制。

---

## 8. 快速使用路径（按现状）

1) 启动后端 + 前端，访问 `/login` 登录（默认账号见仓库 README）。
2) 配置 → 银行账户：创建至少一个启用的账户（若记账要选银行卡）。
3) 配置 → 费用分类/收入分类：维护分类树，并确保用于记账的分类是叶子节点。
4) 记账 → 新增支出/新增收入：录入流水；可在左侧流水列表中查看、筛选、编辑、删除、对银行卡支出发起退款。
5) 统计 → 年度统计/同比/月度折线：查看聚合结果。
