import { SectionLayout } from './SectionLayout';

import '../../pages/stats/stats.styles.css';

export function StatsLayout() {
  return (
    <SectionLayout
      items={[
        { key: 'year-category', label: '年度统计', to: '/stats/year-category' },
        { key: 'yoy', label: '同比', to: '/stats/yoy' },
        { key: 'category-monthly', label: '月度折线', to: '/stats/category-monthly' }
      ]}
    />
  );
}
