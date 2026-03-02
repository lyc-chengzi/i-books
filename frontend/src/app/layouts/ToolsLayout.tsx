import { SectionLayout } from './SectionLayout';

export function ToolsLayout() {
  return (
    <SectionLayout
      items={[
        { key: 'travelPlanner', label: '行程规划', to: '/tools/travel-planner' }
      ]}
    />
  );
}
