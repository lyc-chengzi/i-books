import { SectionLayout } from './SectionLayout';

export function ToolsLayout() {
  return (
    <SectionLayout
      items={[
        { key: 'travelPlanner', label: '行程规划', to: '/tools/travel-planner' },
        { key: 'commuteCards', label: '京津通勤卡', to: '/tools/commute-cards' },
        { key: 'ticketCommutes', label: '购票通勤', to: '/tools/ticket-commutes' }
      ]}
    />
  );
}
