import { SectionLayout } from './SectionLayout';
import { useAuth } from '../../auth/useAuth';

export function ConfigLayout() {
  const auth = useAuth();

  return (
    <SectionLayout
      items={[
        { key: 'bank', label: '银行账户', to: '/config/bank-accounts' },
        { key: 'categories', label: '费用分类', to: '/config/categories' },
        ...(auth.user?.role === 'admin'
          ? [
              { key: 'auditLogs', label: '流水日志', to: '/config/transaction-audit-logs' },
              { key: 'users', label: '用户', to: '/config/users' }
            ]
          : [])
      ]}
    />
  );
}
