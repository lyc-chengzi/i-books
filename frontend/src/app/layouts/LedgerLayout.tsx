import { SectionLayout } from './SectionLayout';
import { TransactionListCard } from '../../pages/ledger/TransactionListCard';
import { Button, Tooltip } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { useState } from 'react';

import './ledger-layout.css';
import '../../pages/ledger/ledger.styles.css';

export function LedgerLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={collapsed ? 'ledgerTabsWithList ledgerTabsWithList--collapsed' : 'ledgerTabsWithList'}>
      <TransactionListCard />

      <div className="ledgerTabsWithList__right">
        {collapsed ? (
          <div className="ledgerTabsWithList__collapsedBar">
            <Tooltip title="展开">
              <Button type="text" icon={<LeftOutlined />} onClick={() => setCollapsed(false)} />
            </Tooltip>
          </div>
        ) : (
          <div className="ledgerTabsWithList__panel">
            <div className="ledgerTabsWithList__collapseBtn">
              <Tooltip title="收起">
                <Button type="text" icon={<RightOutlined />} onClick={() => setCollapsed(true)} />
              </Tooltip>
            </div>
            <SectionLayout
              items={[
                { key: 'new-expense', label: '新增支出', to: '/ledger/expense/new' },
                { key: 'new-income', label: '新增收入', to: '/ledger/income/new' },
                { key: 'transfer', label: '转账/还款', to: '/ledger/transfers/new' }
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
