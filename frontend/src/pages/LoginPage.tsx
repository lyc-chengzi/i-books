import { Button, Card, Form, Input, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';

import './login.styles.css';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  return (
    <div className="authPage">
      <Card className="authCard appGlass appGlass--strong">
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          登录 iBooks
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          关闭浏览器将自动退出登录。
        </Typography.Paragraph>

        <Form
          layout="vertical"
          onFinish={async (values) => {
            await auth.login(values.username, values.password);
            navigate(from, { replace: true });
          }}
        >
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
