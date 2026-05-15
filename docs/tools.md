# iBooks 工具模块说明（tools）

本文档聚焦 `工具` 菜单下的页面与共享规则，说明当前已实现的功能、页面边界、公共交互、前后端接口以及关键业务口径。

当前工具模块包含 3 个页面：
- `行程规划`：`/tools/travel-planner`
- `京津通勤卡`：`/tools/commute-cards`
- `购票通勤`：`/tools/ticket-commutes`

工具二级菜单定义见 [frontend/src/app/layouts/ToolsLayout.tsx](../frontend/src/app/layouts/ToolsLayout.tsx)。

---

## 1. 模块目标

工具模块的核心目标是把“计划”和“实际发生”拆开管理：

- `行程规划` 管的是计划。
- `京津通勤卡` 和 `购票通勤` 管的是实际发生的预约事实。

这两类数据之间的关系是：
- 实际预约不会覆盖或回写计划内容。
- 实际预约会作为提示信息展示在行程规划中。
- 如果某一天已经存在实际预约，则该日期不能被设置为休息日。

---

## 2. 页面概览

### 2.1 行程规划

页面路径：`/tools/travel-planner`

用途：
- 以月历方式管理每天上午/下午的通勤计划。
- 支持双击进入编辑、右键切换休息日。
- 支持一键安排与取消安排。

当前能力：
- 按月读取并编辑计划内容。
- 工作日可填写上午/下午计划，休息日不允许保留计划文本。
- 周末可通过“一键安排”自动标记为休息日。
- 计划区右侧会显示实际预约提示徽标。
- 预约提示分来源展示：
  - `通勤卡预约`
  - `购票通勤`

共享规则：
- 若某日已存在实际预约，则不能设置为休息日。
- 预约提示仅用于展示事实，不会修改计划内容本身。

实现文件：
- [frontend/src/pages/tools/TravelPlannerPage.tsx](../frontend/src/pages/tools/TravelPlannerPage.tsx)
- [frontend/src/pages/tools/travel-planner.css](../frontend/src/pages/tools/travel-planner.css)

---

### 2.2 京津通勤卡

页面路径：`/tools/commute-cards`

用途：
- 管理 10/20/30/40 次通勤卡。
- 在卡片上下文中维护与该卡关联的预约。

当前能力：
- 新增通勤卡。
- 查看通勤卡状态、生效日期、截止日期、剩余次数。
- 按卡片打开预约管理抽屉。
- 新增、编辑、删除卡片预约。
- 删除卡片前必须先清空该卡下的全部预约。

统计口径：
- `已预约`：该卡全部预约数量。
- `剩余次数 = 总次数 - 已预约次数`
- `已使用`：预约时间早于当前时间的数量。
- `待使用`：预约时间晚于当前时间的数量。
- 首次预约日期作为生效日，生效日起第 30 天为截止日。

共享规则：
- 预约和购票通勤共享同一套时段冲突规则。
- 实际预约会进入行程规划提示与休息日校验。

实现文件：
- [frontend/src/pages/tools/BeijingTianjinCommuteCardPage.tsx](../frontend/src/pages/tools/BeijingTianjinCommuteCardPage.tsx)
- [frontend/src/pages/tools/beijing-tianjin-commute-card.css](../frontend/src/pages/tools/beijing-tianjin-commute-card.css)

---

### 2.3 购票通勤

页面路径：`/tools/ticket-commutes`

用途：
- 记录不依赖通勤卡、直接购票产生的通勤预约。

当前能力：
- 展示独立预约列表。
- 新增、编辑、删除购票通勤预约。
- 列表展示与通勤卡预约保持一致。
- `已出行 / 未出行` 判断口径与通勤卡页中的 `已使用 / 待使用` 保持一致，均基于 `乘车日期 + 车次时间` 与当前时间比较。

共享规则：
- 与通勤卡预约共用同一张预约表。
- 与通勤卡预约互相参与时段冲突校验。
- 同样会进入行程规划提示与休息日限制逻辑。

实现文件：
- [frontend/src/pages/tools/TicketCommutePage.tsx](../frontend/src/pages/tools/TicketCommutePage.tsx)

---

## 3. 公共前端组件与共享数据

当前工具模块已经抽出一层公共预约 UI：

### 3.1 公共组件

- [frontend/src/pages/tools/CommuteReservationModal.tsx](../frontend/src/pages/tools/CommuteReservationModal.tsx)
  - 预约表单弹窗
  - 负责方向、日期、时间、车次、车厢、座位号的输入 UI
  - 内含“方向变化自动带出默认时间”的交互

- [frontend/src/pages/tools/CommuteReservationList.tsx](../frontend/src/pages/tools/CommuteReservationList.tsx)
  - 预约列表展示
  - 负责时段标签、已出行/未出行标签、创建时间、车次/座位信息显示

### 3.2 共享 store

- [frontend/src/pages/tools/CommuteCardStore.tsx](../frontend/src/pages/tools/CommuteCardStore.tsx)

职责：
- 拉取通勤卡和购票通勤两类数据。
- 输出统一的 `reservations` 事实流，供行程规划复用。
- 输出 `ticketReservations`，供购票通勤页单独展示。
- 封装通勤卡预约、购票通勤预约、预约更新、预约删除等 API 调用。

设计意义：
- 行程规划不需要关心预约来自哪一个页面，只读取统一事实流即可。
- 两种预约都能走同一套展示和冲突规则。

---

## 4. 预约公共业务规则

### 4.1 预约字段

必填：
- 乘车方向
- 乘车日期
- 车次时间

选填：
- 车次
- 车厢
- 座位号

### 4.2 方向与默认时间

- `北京南-天津` 默认时间：`19:10`
- `天津-北京南` 默认时间：`06:39`

### 4.3 时段划分

- `12:00` 前：`am`
- `12:00` 及之后：`pm`

### 4.4 冲突规则

当前规则是：
- 同一用户、同一天、同一时段，只允许有一条预约。

这条规则对以下两类预约统一生效：
- 通勤卡预约
- 购票通勤预约

因此它们会互相冲突，而不是彼此隔离。

### 4.5 行程规划联动规则

- 任一预约创建后，都会作为“实际发生”展示在行程规划中。
- 行程规划中会区分来源：
  - 通勤卡预约：绿色通勤徽标
  - 购票通勤：蓝色钱符号徽标
- 已存在预约的日期，不能被设置为休息日。

---

## 5. 后端数据与接口

### 5.1 共用预约表

当前两类预约共享同一张表：
- `commute_reservations`

约定：
- `card_id != null`：表示该预约属于通勤卡
- `card_id == null`：表示该预约属于购票通勤

相关模型：
- [backend/app/models/commute_card.py](../backend/app/models/commute_card.py)
- [backend/app/models/commute_reservation.py](../backend/app/models/commute_reservation.py)

### 5.2 通勤卡接口

- `GET /api/tools/commute-cards`
- `POST /api/tools/commute-cards`
- `DELETE /api/tools/commute-cards/{cardId}`
- `POST /api/tools/commute-cards/{cardId}/reservations`
- `PATCH /api/tools/commute-cards/reservations/{reservationId}`
- `DELETE /api/tools/commute-cards/reservations/{reservationId}`

实现文件：
- [backend/app/api/routers/commute_cards.py](../backend/app/api/routers/commute_cards.py)

### 5.3 购票通勤接口

- `GET /api/tools/ticket-commutes`
- `POST /api/tools/ticket-commutes/reservations`
- `PATCH /api/tools/ticket-commutes/reservations/{reservationId}`
- `DELETE /api/tools/ticket-commutes/reservations/{reservationId}`

实现文件：
- [backend/app/api/routers/ticket_commutes.py](../backend/app/api/routers/ticket_commutes.py)

### 5.4 行程规划接口

- `GET /api/tools/travel-plans`
- `PUT /api/tools/travel-plans`

实现文件：
- [backend/app/api/routers/travel_plans.py](../backend/app/api/routers/travel_plans.py)

---

## 6. 当前实现建议

如果继续演进工具模块，优先级最高的几个方向是：

1. 抽取预约提交与冲突校验 hook
   - 当前弹窗和列表已经共用，提交逻辑仍分散在两页中。

2. 为工具模块补一组接口 smoke test
   - 尤其是通勤卡预约与购票通勤预约的互斥时段校验。

3. 继续补工具模块文档与操作示例
   - 例如：典型通勤卡生命周期、购票通勤与行程规划联动示例。