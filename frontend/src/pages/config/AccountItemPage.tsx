import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Form, Input, Radio, Switch, Table } from 'antd';

import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';

type AccountItem = {
  id: number;
  type: 'income' | 'expense';
  name: string;
  path: string;
  isActive: boolean;
};

type CreateValues = {
  type: 'income' | 'expense';
  name: string;
  path: string;
  isActive: boolean;
};

export function AccountItemPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();

  const listQuery = useQuery({
    queryKey: ['accountItems'],
    queryFn: () => api.get<AccountItem[]>('/config/account-items', { token: auth.token })
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateValues) =>
      api.post<AccountItem>('/config/account-items', payload, { token: auth.token }),
    onSuccess: async () => {
      message.success('已创建');
      await queryClient.invalidateQueries({ queryKey: ['accountItems'] });
    }
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="新增记账项（叶子）">
        <Form
          layout="vertical"
          onFinish={(values: CreateValues) => createMutation.mutate(values)}
          initialValues={{ type: 'expense', isActive: true }}
        >
          <Form.Item label="类型" name="type" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: '支出', value: 'expense' },
                { label: '收入', value: 'income' }
              ]}
              optionType="button"
              buttonStyle="solid"
            />
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="例如：加油费" style={{ maxWidth: 420 }} />
          </Form.Item>
          <Form.Item
            label="路径（用于展示/统计）"
            name="path"
            rules={[{ required: true }]}
            extra="示例：交通消费/汽车消费/加油费"
          >
            <Input placeholder="交通消费/汽车消费/加油费" style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item label="启用" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
            创建
          </Button>
        </Form>
      </Card>

      <Card title="记账项列表">
        <Table
          rowKey="id"
          loading={listQuery.isLoading}
          dataSource={listQuery.data ?? []}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 80 },
            { title: '类型', dataIndex: 'type', render: (v) => (v === 'expense' ? '支出' : '收入') },
            { title: '名称', dataIndex: 'name' },
            { title: '路径', dataIndex: 'path' },
            { title: '状态', dataIndex: 'isActive', render: (v: boolean) => (v ? '启用' : '停用') }
          ]}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
