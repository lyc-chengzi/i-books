# iBooks 前端总体设计（frontend）

本文档只保留前端的总体设计、架构分层、公共约束与开发约定。

模块级页面能力、交互细节和业务规则统一拆到专项文档：
- 记账模块：[docs/ledger.md](ledger.md)
- 统计模块：[docs/stats.md](stats.md)
- 配置模块：[docs/config.md](config.md)
- 工具模块：[docs/tools.md](tools.md)

---

## 1. 设计目标

前端的职责是：
- 提供稳定清晰的业务操作入口。
- 把领域规则映射成一致的交互与状态流。
- 通过统一的数据访问层与后端通信。
- 保持页面结构、状态管理和视觉语言的一致性。

当前前端采用“按业务模块分区、按布局承载路由、按共享组件沉淀复用”的组织方式。

---

## 2. 技术栈

- React + TypeScript + Vite
- Ant Design 6
- ofetch
- TanStack Query
- ECharts
- dayjs

设计取向：
- React 负责视图与路由。
- TanStack Query 负责服务端状态与缓存失效。
- ofetch 负责统一请求封装与错误归一化。
- Ant Design 提供基础交互组件。
- ECharts 用于统计可视化。

---

## 3. 架构分层

### 3.1 路由与布局层

路由入口：
- [frontend/src/app/App.tsx](../frontend/src/app/App.tsx)

布局职责：
- `RootLayout`：顶部主导航、用户菜单、全局容器。
- `LedgerLayout`：记账场景的左右分栏布局。
- `StatsLayout` / `ConfigLayout` / `ToolsLayout`：承载各业务模块二级导航。
- `SectionLayout`：为多个模块复用统一二级导航外壳。

设计原则：
- 路由负责模块切分。
- 布局负责导航与页面骨架。
- 页面组件负责具体业务交互，不把布局写成业务组件。

### 3.2 页面层

页面目录：
- `frontend/src/pages/ledger/`
- `frontend/src/pages/stats/`
- `frontend/src/pages/config/`
- `frontend/src/pages/tools/`

设计原则：
- 页面组件负责一个明确业务视图。
- 同模块内共享逻辑优先下沉到模块内公共组件或 store。
- 跨模块共享逻辑优先下沉到 `components/`、`lib/` 或稳定公共抽象。

### 3.3 共享组件层

共享组件目录：
- `frontend/src/components/`

适合沉淀到共享组件的内容：
- 与业务弱相关但多处复用的 UI 封装。
- 带轻量交互规则的表单控件。
- 图表容器、悬浮操作栏、选择器等稳定部件。

### 3.4 数据访问层

数据访问入口：
- [frontend/src/lib/api.ts](../frontend/src/lib/api.ts)

职责：
- 统一 `baseURL: /api`
- 统一 cookie / bearer token 兼容策略
- 统一错误消息归一化

设计原则：
- 页面和组件不直接散落处理底层请求细节。
- 与服务端交互的缓存一致性由 TanStack Query 管理。

---

## 4. 状态管理约定

前端状态分为三类：

### 4.1 服务端状态

由 TanStack Query 管理：
- 列表数据
- 详情数据
- 聚合统计数据
- 配置维表数据

约定：
- 查询 key 要稳定、可组合。
- 写操作后优先做精确失效，不做无边界全量刷新。

### 4.2 本地界面状态

由页面组件或局部组件管理：
- 弹窗开关
- 筛选面板状态
- 表单草稿
- 当前选中项

约定：
- 仅在当前视图生命周期内有意义的状态，不提升为全局状态。

### 4.3 认证状态

入口：
- [frontend/src/auth/AuthProvider.tsx](../frontend/src/auth/AuthProvider.tsx)

负责：
- 当前用户信息
- 登录/退出
- 启动时登录态恢复

约定：
- 登录态以 cookie 为主。
- token 仅作为兼容层，不应落盘到 `localStorage` 或 `sessionStorage`。
- 浏览器关闭即退出，仍然是当前实现和文档约束。

---

## 5. 权限与导航约定

权限控制入口：
- [frontend/src/auth/RequireAuth.tsx](../frontend/src/auth/RequireAuth.tsx)
- [frontend/src/auth/RequireAdmin.tsx](../frontend/src/auth/RequireAdmin.tsx)

公共约束：
- 除登录页外，默认所有业务页面都要求已登录。
- 管理员专属页面必须同时满足“导航不可见”和“路由不可访问”。
- 权限控制以服务端为最终裁决，前端控制只负责 UX 与入口收敛。

---

## 6. 时间、金额与口径约定

### 6.1 金额

- 前端输入展示使用“元”。
- 与后端交互的金额字段以“分”为主。
- 前端只负责展示和转换，不擅自改变统计口径。

### 6.2 时间

- 表单和筛选使用 dayjs。
- 请求提交统一使用 ISO 8601。
- 展示层可以按本地时区格式化，但统计边界口径必须与后端保持一致。

### 6.3 业务口径

- 同一业务口径只能定义一次，并在各模块复用。
- 例如净支出、退款冲减、预约事实与计划分离等规则，应以专项模块文档或后端规则为准，不在多个页面各写一套。

---

## 7. 目录结构约定

核心目录：
- `frontend/src/app/`：路由和布局骨架
- `frontend/src/auth/`：认证与权限控制
- `frontend/src/components/`：跨模块共享组件
- `frontend/src/lib/`：基础设施封装
- `frontend/src/pages/`：按业务模块组织的页面

约定：
- 新功能优先放到所属业务模块目录。
- 只有在复用稳定后，才上提到共享目录。
- 不要把模块级业务细节塞回 `app/` 或全局基础设施目录。

---

## 8. 开发约束

### 8.1 组件与页面

- 页面组件保持聚焦，不承担过多跨页面复用责任。
- 共享逻辑优先抽成组件、hook 或模块内 store，而不是复制粘贴。
- 表单校验优先与后端规则保持同口径，前端只做必要的 UX 限制。

### 8.2 样式

- 全局样式集中在 [frontend/src/styles.css](../frontend/src/styles.css)。
- 主题 token 由 [frontend/src/main.tsx](../frontend/src/main.tsx) 中的 Antd ConfigProvider 统一控制。
- 页面级样式尽量收敛在模块内，不把业务样式泄漏到全局。

### 8.3 请求与缓存

- 所有接口调用走统一 API 封装。
- 不在页面中散落重复的错误解析逻辑。
- 写操作必须考虑相关 query 的失效刷新。

### 8.4 文档

- `docs/frontend.md` 只保留总体架构、公共约束和文档导航。
- 模块细节必须写到对应专项文档，不再回填到总文档。

---

## 9. 本地开发

在 `frontend/` 目录下常用命令：
- `pnpm install`
- `pnpm dev`
- `pnpm build`

开发环境约定：
- 默认端口 `5173`
- `/api` 通过 Vite 代理到后端 `8010`

---

## 10. 总体维护原则

- 总文档只讲“整体怎么组织、怎么约束、怎么协作”。
- 模块文档只讲“该模块做什么、有哪些规则、有哪些页面与交互”。
- 当总文档和模块文档冲突时：
  - 架构和公共约束以总文档为准。
  - 业务行为和模块规则以专项文档为准。
