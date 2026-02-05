import { SectionLayout } from './SectionLayout';

export function ConfigLayout() {
  return (
    <SectionLayout
      items={[
        { key: 'bank', label: '银行账户', to: '/config/bank-accounts' },
        { key: 'categories', label: '费用分类', to: '/config/categories' },
        { key: 'users', label: '用户', to: '/config/users' }
      ]}
    />
  );
}
