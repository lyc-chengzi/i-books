# iBooks 配置模块说明（config）

本文档聚焦 `配置` 菜单下的页面、数据维护职责、权限边界和共享约定。

当前配置模块包含以下页面：
- `银行账户`：`/config/bank-accounts`
- `分类树`：`/config/categories`
- `用户管理`：`/config/users`
- `流水日志`：`/config/transaction-audit-logs`

路由定义见 [frontend/src/app/App.tsx](../frontend/src/app/App.tsx)。

---

## 1. 模块目标

配置模块负责维护为记账和统计提供支撑的基础数据。

这些数据包括：
- 银行账户
- 收支分类树
- 费用一级分类标签
- 用户与权限
- 流水审计日志

原则是：
- 配置数据优先服务记账与统计。
- 管理动作尽量保持可追溯。
- 涉及权限与审计的页面仅管理员可用。

---

## 2. 页面概览

### 2.1 银行账户

页面路径：`/config/bank-accounts`

能力：
- 新增账户：银行、别名、后四位、类型、余额、启用状态。
- 信用卡可补充出账日、还款日。
- 列表查看与编辑账户信息。

说明：
- 余额字段在前端有提示，主要用于支出/转账相关体验与校验辅助。
- 是否做强校验最终以后端实现为准。

实现文件：
- [frontend/src/pages/config/BankAccountPage.tsx](../frontend/src/pages/config/BankAccountPage.tsx)

### 2.2 分类树

页面路径：`/config/categories`

能力：
- 切换费用树 / 收入树。
- 维护树节点：新增、重命名、启用、停用。
- 拖拽排序：调整层级关系与同级顺序。
- 叶子删除：仅允许对叶子执行删除或停用。

标签能力：
- 仅在费用树的一级分类上维护标签。
- 标签可被记账页在新增支出时加载并多选使用。
- 删除标签若已被引用，前端文案会引导为停用处理。

实现文件：
- [frontend/src/pages/config/CategoryPage.tsx](../frontend/src/pages/config/CategoryPage.tsx)

### 2.3 用户管理

页面路径：`/config/users`

权限：
- 仅管理员可访问。

能力：
- 新增用户：用户名、初始密码、角色、时区、启用状态。
- 编辑用户：角色、时区、启用状态。
- 可选执行密码重置。

实现文件：
- [frontend/src/pages/config/UserPage.tsx](../frontend/src/pages/config/UserPage.tsx)
- [frontend/src/auth/RequireAdmin.tsx](../frontend/src/auth/RequireAdmin.tsx)

### 2.4 流水审计日志

页面路径：`/config/transaction-audit-logs`

权限：
- 仅管理员可访问。

能力：
- 展示流水新增、修改、删除审计日志。
- 按时间倒序浏览。
- 展开查看 `before / after` JSON 快照。

数据来源：
- `GET /api/admin/transaction-audit-logs`

实现文件：
- [frontend/src/pages/config/TransactionAuditLogPage.tsx](../frontend/src/pages/config/TransactionAuditLogPage.tsx)

---

## 3. 权限与共享约定

### 3.1 管理员限制

以下页面仅管理员可访问：
- 用户管理
- 流水审计日志

前端通过以下组件控制：
- [frontend/src/auth/RequireAdmin.tsx](../frontend/src/auth/RequireAdmin.tsx)

### 3.2 记账依赖

配置模块维护的数据会被记账模块直接消费：
- 银行账户：用于资金来源和账户选择。
- 分类树：用于收入/支出分类选择。
- 费用标签：用于支出标签选择。

### 3.3 统计依赖

统计模块会依赖分类树和账户等配置维度做分组或筛选。

---

## 4. 路由与布局

配置相关路由：
- `/config/bank-accounts`
- `/config/categories`
- `/config/users`
- `/config/transaction-audit-logs`

布局特点：
- 使用统一二级导航布局。
- 页面以维护类表单、表格、树结构为主。

实现文件：
- [frontend/src/app/layouts/ConfigLayout.tsx](../frontend/src/app/layouts/ConfigLayout.tsx)
- [frontend/src/app/layouts/SectionLayout.tsx](../frontend/src/app/layouts/SectionLayout.tsx)

---

## 5. 前后端交互约定

常见接口方向：
- 银行账户：`/api/config/bank-accounts`
- 分类树：`/api/config/categories`
- 用户：`/api/config/users`
- 审计日志：`/api/admin/transaction-audit-logs`

常见 queryKey：
- `['bankAccounts', ...]`
- `['categoriesTree', type]`
- `['users', ...]`
- `['admin', 'transaction-audit-logs', ...]`

写操作后通常需要让相关维表重新失效刷新，以保证记账页和统计页读到最新配置。

---

## 6. 相关文件

- [frontend/src/pages/config/BankAccountPage.tsx](../frontend/src/pages/config/BankAccountPage.tsx)
- [frontend/src/pages/config/CategoryPage.tsx](../frontend/src/pages/config/CategoryPage.tsx)
- [frontend/src/pages/config/UserPage.tsx](../frontend/src/pages/config/UserPage.tsx)
- [frontend/src/pages/config/TransactionAuditLogPage.tsx](../frontend/src/pages/config/TransactionAuditLogPage.tsx)
- [frontend/src/app/layouts/ConfigLayout.tsx](../frontend/src/app/layouts/ConfigLayout.tsx)
- [frontend/src/auth/RequireAdmin.tsx](../frontend/src/auth/RequireAdmin.tsx)