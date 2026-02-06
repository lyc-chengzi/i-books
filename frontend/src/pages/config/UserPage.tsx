import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag } from 'antd';
import { useMemo, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';

type UserRow = {
  id: number;
  username: string;
  role: 'admin' | 'user';
  isActive: boolean;
  timeZone: string;
};

type CreateValues = {
  username: string;
  password: string;
  role: 'admin' | 'user';
  isActive: boolean;
  timeZone: string;
};

type UpdateValues = {
  role: 'admin' | 'user';
  isActive: boolean;
  timeZone: string;
  password?: string;
};

export function UserPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm] = Form.useForm<UpdateValues>();

  const roleOptions = useMemo(
    () => [
      { value: 'admin', label: '管理员' },
      { value: 'user', label: '普通用户' }
    ],
    []
  );

  const listQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserRow[]>('/config/users', { token: auth.token })
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post<UserRow>('/config/users', payload, { token: auth.token }),
    onSuccess: async () => {
      message.success('已创建');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => api.patch<UserRow>(`/config/users/${id}`, payload, { token: auth.token }),
    onSuccess: async () => {
      message.success('已更新');
      setEditOpen(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="新增用户">
        <Form
          layout="inline"
          initialValues={{ role: 'user', isActive: true, timeZone: 'Asia/Shanghai' }}
          onFinish={(values: CreateValues) => {
            createMutation.mutate({
              username: values.username,
              password: values.password,
              role: values.role,
              isActive: values.isActive,
              timeZone: values.timeZone
            });
          }}
        >
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
            <Input placeholder="例如：zhangsan" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password placeholder="初始密码" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select options={roleOptions} style={{ width: 130 }} />
          </Form.Item>
          <Form.Item label="时区" name="timeZone" tooltip="统计按用户时区切自然月">
            <Input style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="启用" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
            创建
          </Button>
        </Form>
      </Card>

      <Card title="用户列表">
        <Table
          rowKey="id"
          loading={listQuery.isLoading}
          dataSource={listQuery.data ?? []}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 80 },
            { title: '用户名', dataIndex: 'username', render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
            {
              title: '角色',
              dataIndex: 'role',
              render: (v: UserRow['role']) => (v === 'admin' ? <Tag color="gold">管理员</Tag> : <Tag>普通用户</Tag>)
            },
            { title: '时区', dataIndex: 'timeZone', render: (v: string) => v ?? '-' },
            { title: '状态', dataIndex: 'isActive', render: (v: boolean) => (v ? '启用' : '停用') },
            {
              title: '操作',
              render: (_: any, row: UserRow) => (
                <Space>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditing(row);
                      editForm.setFieldsValue({ role: row.role, isActive: row.isActive, timeZone: row.timeZone, password: '' });
                      setEditOpen(true);
                    }}
                  >
                    编辑
                  </Button>
                  {row.id === auth.user?.id ? <Tag>当前登录</Tag> : null}
                </Space>
              )
            }
          ]}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editing ? `编辑用户：${editing.username}` : '编辑用户'}
        open={editOpen}
        okText="保存"
        cancelText="取消"
        confirmLoading={updateMutation.isPending}
        onCancel={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        onOk={async () => {
          if (!editing) return;
          const values = await editForm.validateFields();
          const payload: any = {
            role: values.role,
            isActive: values.isActive,
            timeZone: values.timeZone
          };
          const pwd = (values.password ?? '').trim();
          if (pwd) payload.password = pwd;
          updateMutation.mutate({ id: editing.id, payload });
        }}
      >
        <Form form={editForm} layout="vertical" initialValues={{ role: 'user', isActive: true, timeZone: 'Asia/Shanghai' }}>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item label="时区" name="timeZone">
            <Input />
          </Form.Item>
          <Form.Item label="启用" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="重置密码（可选）" name="password" tooltip="不填则不修改密码">
            <Input.Password placeholder="新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
