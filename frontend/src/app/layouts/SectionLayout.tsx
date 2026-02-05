import { Card, Menu } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import './section-layout.css';

export type SubNavItem = {
  key: string;
  label: string;
  to: string;
};

export function SectionLayout(props: { items: SubNavItem[] }) {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey =
    props.items.find((it) => location.pathname.startsWith(it.to))?.key ?? props.items[0]?.key;

  return (
    <Card
      className="sectionCard appGlass appGlass--strong"
      styles={{ body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column' } }}
      style={{ height: '100%' }}
    >
      <div className="sectionMenuBar">
        <Menu
          mode="horizontal"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={props.items.map((it) => ({ key: it.key, label: it.label }))}
          onClick={({ key }) => {
            const item = props.items.find((it) => it.key === key);
            if (item) navigate(item.to);
          }}
        />
      </div>

      <div className="sectionBody">
        <Outlet />
      </div>
    </Card>
  );
}
