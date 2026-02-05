import { BarChartOutlined, CreditCardOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Layout, Menu, Space, Typography } from 'antd';
import type { MouseEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/useAuth';

import './root-layout.css';

const { Header, Sider, Content } = Layout;

type TopKey = 'ledger' | 'stats' | 'config';

function getTopKey(pathname: string): TopKey {
  if (pathname.startsWith('/stats')) return 'stats';
  if (pathname.startsWith('/config')) return 'config';
  return 'ledger';
}

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();

  const selectedTopKey = getTopKey(location.pathname);

  const handleTopClick = ({ key }: { key: string }) => {
    if (key === 'ledger') navigate('/ledger/expense/new');
    if (key === 'stats') navigate('/stats/year-category');
    if (key === 'config') navigate('/config/bank-accounts');
  };

  return (
    <Layout className="appShell" style={{ height: '100vh', minHeight: '100vh' }}>
      <Sider
        width={160}
        theme="light"
        className="appSider"
        style={{ overflow: 'auto' }}
      >
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="appLogo" />
          <Typography.Title level={5} style={{ margin: 0 }}>
            iBooks
          </Typography.Title>
        </div>

        <Menu
          mode="inline"
          className="rootSiderMenu"
          selectedKeys={[selectedTopKey]}
          inlineIndent={10}
          items={[
            { key: 'ledger', label: '记账', icon: <CreditCardOutlined /> },
            { key: 'stats', label: '统计', icon: <BarChartOutlined /> },
            { key: 'config', label: '配置', icon: <SettingOutlined /> }
          ]}
          onClick={handleTopClick}
        />
      </Sider>

      <Layout style={{ minHeight: 0 }}>
        <Header
          className="appHeader"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Typography.Text type="secondary">个人记账系统</Typography.Text>

          <Space size={10} align="center">
            <Typography.Text type="secondary">{auth.user?.username ?? '-'}</Typography.Text>
            <Button
              type="link"
              onClick={(e: MouseEvent<HTMLElement>) => {
                e.preventDefault();
                auth.logout();
                navigate('/login');
              }}
              style={{ paddingInline: 0 }}
            >
              退出登录
            </Button>
          </Space>
        </Header>
        <Content className="appContent" style={{ overflow: 'hidden', minHeight: 0, display: 'flex' }}>
          <div className="appContentInner appMainPanel appGlass appGlass--strong">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
