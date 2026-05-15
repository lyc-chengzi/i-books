# iBooks 统计模块说明（stats）

本文档聚焦 `统计` 菜单下的页面、筛选维度、图表能力和共享统计口径。

当前统计模块包含以下页面：
- `年度统计`：`/stats/year-category`
- `同比统计`：`/stats/yoy`
- `月度收支分析`：`/stats/category-monthly`
- `支出统计`：`/stats/expense`

路由定义见 [frontend/src/app/App.tsx](../frontend/src/app/App.tsx)。

---

## 1. 模块目标

统计模块负责基于已记账流水做可复算的聚合展示，提供分类、月份、年度、同比/环比等视角的图表化分析。

原则是：
- 不在前端持久化统计结果。
- 以前后端可重算的流水聚合为准。
- 与记账模块保持统一口径，尤其是退款对净支出的冲减逻辑。

---

## 2. 页面概览

### 2.1 年度统计

页面路径：`/stats/year-category`

能力：
- 切换年份。
- 切换收支类型（支出 / 收入）。
- 展示分类 TopN 饼图。
- 展示月度趋势折线。
- 支持点击某月做按月钻取，查看该月分类占比与月合计。

实现文件：
- [frontend/src/pages/stats/YearCategoryStatsPage.tsx](../frontend/src/pages/stats/YearCategoryStatsPage.tsx)

### 2.2 同比统计

页面路径：`/stats/yoy`

能力：
- 切换年份与收支类型。
- 展示本年与上年的月度对比折线。

实现文件：
- [frontend/src/pages/stats/YoYStatsPage.tsx](../frontend/src/pages/stats/YoYStatsPage.tsx)

### 2.3 月度收支分析

页面路径：`/stats/category-monthly`

能力：
- 选择起止月份。
- 展示月份范围内的收入/支出柱状对比。
- 展示支出趋势折线。
- 展示汇总合计。

实现文件：
- [frontend/src/pages/stats/CategoryMonthlyLinePage.tsx](../frontend/src/pages/stats/CategoryMonthlyLinePage.tsx)

### 2.4 支出统计

页面路径：`/stats/expense`

能力：
- 面向支出视角做明细化统计展示。
- 具体维度与后端 `expense-item` 接口保持一致。

实现文件：
- [frontend/src/pages/stats/ExpenseStatsPage.tsx](../frontend/src/pages/stats/ExpenseStatsPage.tsx)

---

## 3. 统计共享口径

### 3.1 退款冲减原始支出

统计必须与记账模块保持一致，采用 `净支出` 口径：

- 退款冲减原始支出，而不是单独记作新的负支出桶。
- 退款归属到原始支出发生日期所在时间桶。

这意味着：
- 同一时间范围内的支出统计，会受到该范围内原始支出的退款影响。
- 退款发生在范围外，也可能冲减范围内原始支出的金额。

### 3.2 时间口径

- 前端筛选使用 dayjs。
- 统计按自然年 / 自然月组织。
- 后端需要注意用户时区下的自然月边界，而不是简单按数据库 UTC-naive 时间直接 `year/month` 分桶。

### 3.3 图表友好结构

图表输出通常围绕以下字段组织：
- `label`
- `series`
- `xAxis`
- `yAxis`

图表容器组件：
- [frontend/src/components/EChart.tsx](../frontend/src/components/EChart.tsx)

---

## 4. 路由与布局

统计相关路由：
- `/stats/year-category`
- `/stats/yoy`
- `/stats/category-monthly`
- `/stats/expense`

布局特点：
- 使用统一二级导航布局。
- 统计页通常由筛选区 + 图表区构成。

实现文件：
- [frontend/src/app/layouts/StatsLayout.tsx](../frontend/src/app/layouts/StatsLayout.tsx)
- [frontend/src/app/layouts/SectionLayout.tsx](../frontend/src/app/layouts/SectionLayout.tsx)

---

## 5. 前后端交互约定

常见 queryKey：
- `['stats', ...]`

前端常见行为：
- 切换年份、月份或类型后重新请求统计接口。
- 按图表点击事件触发钻取或二次查询。

工具函数：
- [frontend/src/pages/stats/statsUtils.ts](../frontend/src/pages/stats/statsUtils.ts)

---

## 6. 相关文件

- [frontend/src/pages/stats/YearCategoryStatsPage.tsx](../frontend/src/pages/stats/YearCategoryStatsPage.tsx)
- [frontend/src/pages/stats/YoYStatsPage.tsx](../frontend/src/pages/stats/YoYStatsPage.tsx)
- [frontend/src/pages/stats/CategoryMonthlyLinePage.tsx](../frontend/src/pages/stats/CategoryMonthlyLinePage.tsx)
- [frontend/src/pages/stats/ExpenseStatsPage.tsx](../frontend/src/pages/stats/ExpenseStatsPage.tsx)
- [frontend/src/pages/stats/statsUtils.ts](../frontend/src/pages/stats/statsUtils.ts)
- [frontend/src/components/EChart.tsx](../frontend/src/components/EChart.tsx)
- [frontend/src/app/layouts/StatsLayout.tsx](../frontend/src/app/layouts/StatsLayout.tsx)