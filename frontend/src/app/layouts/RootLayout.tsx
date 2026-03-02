import { BarChartOutlined, CreditCardOutlined, MenuOutlined, SettingOutlined, ToolOutlined } from '@ant-design/icons';
import { Avatar, Button, Drawer, Dropdown, Menu, Space, Typography } from 'antd';
import type { MouseEvent } from 'react';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/useAuth';

import './root-layout.css';

type TopKey = 'ledger' | 'stats' | 'config' | 'tools';

function getTopKey(pathname: string): TopKey {
  if (pathname.startsWith('/stats')) return 'stats';
  if (pathname.startsWith('/config')) return 'config';
  if (pathname.startsWith('/tools')) return 'tools';
  return 'ledger';
}

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();

  const [navOpen, setNavOpen] = useState(false);

  const selectedTopKey = getTopKey(location.pathname);

  const topMenuItems = useMemo(
    () => [
      { key: 'ledger', label: '记账', icon: <CreditCardOutlined /> },
      { key: 'stats', label: '统计', icon: <BarChartOutlined /> },
      { key: 'config', label: '配置', icon: <SettingOutlined /> },
      { key: 'tools', label: '工具', icon: <ToolOutlined /> }
    ],
    []
  );

  const handleTopClick = ({ key }: { key: string }) => {
    if (key === 'ledger') navigate('/ledger/expense/new');
    if (key === 'stats') navigate('/stats/year-category');
    if (key === 'config') navigate('/config/bank-accounts');
    if (key === 'tools') navigate('/tools/travel-planner');
    setNavOpen(false);
  };

  const username = auth.user?.username ?? '-';
  const userInitial = (username && username !== '-' ? username.trim()[0] : 'U').toUpperCase();

  return (
    <div className="appShell appFrame">
      <div className="appTopBar appGlass appGlass--strong">
        <div className="appTopBarLeft">
          <Button
            className="appNavToggle"
            type="text"
            aria-label="打开导航"
            icon={<MenuOutlined />}
            onClick={() => setNavOpen(true)}
          />

          <div className="appBrand" onClick={() => navigate('/ledger/expense/new')} role="button" tabIndex={0}>
            <div className="appLogo" aria-hidden="true" />
            <div className="appBrandText">
              <Typography.Text strong>iBooks</Typography.Text>
              <Typography.Text type="secondary" className="appBrandSub">
                个人记账
              </Typography.Text>
            </div>
          </div>
        </div>

        <Menu
          mode="horizontal"
          className="rootTopMenu"
          selectedKeys={[selectedTopKey]}
          items={topMenuItems}
          onClick={handleTopClick}
        />

        <div className="appUserBar">
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: [
                { key: 'user', label: <span style={{ fontWeight: 600 }}>{username}</span>, disabled: true },
                { type: 'divider' },
                {
                  key: 'logout',
                  danger: true,
                  label: '退出登录',
                  onClick: () => {
                    auth.logout();
                    navigate('/login');
                  }
                }
              ]
            }}
          >
            <button className="appUserButton" type="button">
              <Avatar size={30} className="appUserAvatar">
                {userInitial}
              </Avatar>
              <span className="appUserName">{username}</span>
            </button>
          </Dropdown>
        </div>
      </div>

      <Drawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        placement="left"
        size={280}
        title={
          <Space size={10} align="center">
            <div className="appLogo" aria-hidden="true" />
            <span>iBooks</span>
          </Space>
        }
      >
        <Menu
          mode="inline"
          selectedKeys={[selectedTopKey]}
          items={topMenuItems}
          onClick={handleTopClick}
        />

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text type="secondary">{username}</Typography.Text>
          <Button
            danger
            onClick={(e: MouseEvent<HTMLElement>) => {
              e.preventDefault();
              auth.logout();
              navigate('/login');
            }}
          >
            退出登录
          </Button>
        </div>
      </Drawer>

      <div className="appContent">
        <div className="appContentInner appMainPanel appGlass appGlass--strong">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
