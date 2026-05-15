# iBooks 记账模块说明（ledger）

本文档聚焦 `记账` 菜单下的页面、交互、共享口径与接口约定。

当前记账模块包含以下入口：
- `新增支出`：`/ledger/expense/new`
- `新增收入`：`/ledger/income/new`
- `转账/还款`：`/ledger/transfers/new`
- `流水列表`：作为记账页左侧常驻卡片显示

路由定义见 [frontend/src/app/App.tsx](../frontend/src/app/App.tsx)。

---

## 1. 模块目标

记账模块负责记录可追溯的账目事实，并提供围绕流水的查询、编辑、删除、复制和退款操作。

核心设计是：
- 录入页负责新增事实。
- 流水列表负责查看、筛选、编辑和二次操作。
- 统计口径最终以流水可重算结果为准。

---

## 2. 页面概览

### 2.1 新增支出

页面路径：`/ledger/expense/new`

能力：
- 录入金额、发生时间、费用分类、资金来源、银行账户、备注。
- 分类必须选择叶子节点。
- 当选择银行卡时，必须继续选择银行账户。
- 当费用分类确定后，会根据一级费用分类加载可用标签，支持多选。

实现文件：
- [frontend/src/pages/ledger/TransactionCreateExpensePage.tsx](../frontend/src/pages/ledger/TransactionCreateExpensePage.tsx)

### 2.2 新增收入

页面路径：`/ledger/income/new`

能力：
- 录入金额、发生时间、收入分类、资金来源、银行账户、备注。
- 分类同样要求叶子节点。

实现文件：
- [frontend/src/pages/ledger/TransactionCreateIncomePage.tsx](../frontend/src/pages/ledger/TransactionCreateIncomePage.tsx)

### 2.3 转账/还款

页面路径：`/ledger/transfers/new`

能力：
- 录入转出账户、转入账户、金额、发生时间、备注。
- 适用于账户间转账和信用卡还款场景。

实现文件：
- [frontend/src/pages/ledger/TransferCreatePage.tsx](../frontend/src/pages/ledger/TransferCreatePage.tsx)

### 2.4 流水列表

呈现方式：
- 作为记账页左侧常驻卡片显示，不是独立页面。

能力：
- 过滤：类型、资金来源、银行账户、日期范围、关键词。
- 排序：按发生时间升序/降序切换。
- 分组：支持按日期分组查看。
- 分页：服务端分页。
- 编辑：支持编辑非转账、非退款流水的时间、分类、标签、备注。
- 删除：删除单条流水。
- 复制：把已有流水复制回录入表单以便快速复用。
- 退款：仅支持银行卡支出发起全额或部分退款。

实现文件：
- [frontend/src/pages/ledger/TransactionListCard.tsx](../frontend/src/pages/ledger/TransactionListCard.tsx)
- [frontend/src/app/layouts/LedgerLayout.tsx](../frontend/src/app/layouts/LedgerLayout.tsx)

---

## 3. 关键业务口径

### 3.1 叶子分类选择

- 新增支出/收入时必须选择到叶子分类。
- 前端通过分类选择组件限制非叶子节点选择。

相关组件：
- [frontend/src/components/CategoryLeafSelect.tsx](../frontend/src/components/CategoryLeafSelect.tsx)

### 3.2 资金来源与银行账户

- 现金：不关联银行账户。
- 银行卡：必须选择具体银行账户。

### 3.3 支出口径（含退款）

为了保证流水列表和统计一致，当前统一采用 `净支出` 口径：

- 退款会以独立流水保存，类型为 `refund`。
- 退款通过 `refundOfTransactionId` 关联原始支出。
- 对任意支出流水 $E$：

$$
netExpense(E) = max(0, amount(E) - refundSum(E))
$$

其中 $refundSum(E)$ 表示与该支出关联的退款总额。

退款归属规则：
- 退款冲减原始支出发生日期所在时间桶，而不是退款自身发生日期。

UI 体现：
- 日期分组小计展示净支出。
- 列表顶部支出合计展示净支出。
- 原始支出行可带 `refundedCents`，并展示退款子行。

---

## 4. 路由与布局

记账相关路由：
- `/ledger/expense/new`
- `/ledger/income/new`
- `/ledger/transfers/new`

布局特点：
- 左侧：流水列表
- 右侧：当前录入表单或对应功能区
- 支持右侧面板收起/展开

实现文件：
- [frontend/src/app/layouts/LedgerLayout.tsx](../frontend/src/app/layouts/LedgerLayout.tsx)

---

## 5. 前后端交互约定

### 5.1 时间与金额

- 金额输入展示为“元”，接口中多以“分”为单位。
- 时间表单使用 dayjs，提交时统一使用 `toISOString()`。

### 5.2 常见查询缓存

常见 queryKey：
- `['transactions', { filters... }]`
- `['bankAccounts', 'usage']`
- `['categoriesTree', type]`

写操作后通常会触发：
- `transactions` 失效刷新
- `bankAccounts` 失效刷新

---

## 6. 相关文件

- [frontend/src/pages/ledger/TransactionCreateExpensePage.tsx](../frontend/src/pages/ledger/TransactionCreateExpensePage.tsx)
- [frontend/src/pages/ledger/TransactionCreateIncomePage.tsx](../frontend/src/pages/ledger/TransactionCreateIncomePage.tsx)
- [frontend/src/pages/ledger/TransferCreatePage.tsx](../frontend/src/pages/ledger/TransferCreatePage.tsx)
- [frontend/src/pages/ledger/TransactionListCard.tsx](../frontend/src/pages/ledger/TransactionListCard.tsx)
- [frontend/src/components/CategoryLeafSelect.tsx](../frontend/src/components/CategoryLeafSelect.tsx)
- [frontend/src/app/layouts/LedgerLayout.tsx](../frontend/src/app/layouts/LedgerLayout.tsx)