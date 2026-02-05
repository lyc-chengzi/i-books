import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table } from 'antd';
import { useMemo, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';

type BankAccount = {
  id: number;
  bankName: string;
  alias: string;
  last4: string | null;
  kind: 'debit' | 'credit';
  balanceCents: number;
  billingDay: number | null;
  repaymentDay: number | null;
  isActive: boolean;
};

type CreateValues = {
  bankName: string;
  alias: string;
  last4?: string;
  kind: 'debit' | 'credit';
  balance: number;
  billingDay?: number;
  repaymentDay?: number;
  isActive: boolean;
};

type UpdateValues = CreateValues;

export function BankAccountPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);

  const [editForm] = Form.useForm<UpdateValues>();

  const listQuery = useQuery({
    queryKey: ['bankAccounts', 'usage'],
    queryFn: () => api.get<BankAccount[]>('/config/bank-accounts?orderBy=usage', { token: auth.token })
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post<BankAccount>('/config/bank-accounts', payload, { token: auth.token }),
    onSuccess: async () => {
      message.success('已创建');
      await queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => api.patch<BankAccount>(`/config/bank-accounts/${id}`, payload, { token: auth.token }),
    onSuccess: async () => {
      message.success('已更新');
      setEditOpen(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
    }
  });

  const kindOptions = useMemo(
    () => [
      { value: 'debit', label: '储蓄卡/借记卡' },
      { value: 'credit', label: '信用卡' }
    ],
    []
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card title="新增银行账户">
        <Form
          layout="inline"
          onFinish={(values: CreateValues) => {
            const payload = {
              bankName: values.bankName,
              alias: values.alias,
              last4: values.last4 ?? null,
              kind: values.kind,
              balanceCents: Math.round((values.balance ?? 0) * 100),
              billingDay: values.kind === 'credit' ? values.billingDay ?? null : null,
              repaymentDay: values.kind === 'credit' ? values.repaymentDay ?? null : null,
              isActive: values.isActive
            };
            createMutation.mutate(payload);
          }}
          initialValues={{ isActive: true, kind: 'debit', balance: 0 }}
        >
          <Form.Item label="银行" name="bankName" rules={[{ required: true }]}>
            <Input placeholder="例如：招商银行" style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="别名" name="alias" rules={[{ required: true }]}>
            <Input placeholder="例如：工资卡" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="后四位" name="last4" rules={[{ len: 4, message: '请输入 4 位' }]}>
            <Input placeholder="1234" style={{ width: 110 }} maxLength={4} />
          </Form.Item>
          <Form.Item label="类型" name="kind" rules={[{ required: true }]}>
            <Select options={kindOptions} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item label="余额(元)" name="balance" tooltip="储蓄卡余额会用于支出/转账校验；信用卡可为负数">
            <InputNumber style={{ width: 140 }} precision={2} />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => {
              const kind = getFieldValue('kind');
              if (kind !== 'credit') return null;
              return (
                <Space>
                  <Form.Item label="出账日" name="billingDay" rules={[{ required: true }]}>
                    <InputNumber min={1} max={31} style={{ width: 110 }} />
                  </Form.Item>
                  <Form.Item label="还款日" name="repaymentDay" rules={[{ required: true }]}>
                    <InputNumber min={1} max={31} style={{ width: 110 }} />
                  </Form.Item>
                </Space>
              );
            }}
          </Form.Item>
          <Form.Item label="启用" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
            创建
          </Button>
        </Form>
      </Card>

      <Card title="银行账户列表">
        <Table
          rowKey="id"
          loading={listQuery.isLoading}
          dataSource={listQuery.data ?? []}
          columns={[
            {
              title: '银行',
              dataIndex: 'bankName',
              render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>
            },
            { title: '别名', dataIndex: 'alias' },
            { title: '后四位', dataIndex: 'last4', render: (v) => v ?? '-' },
            { title: '类型', dataIndex: 'kind', render: (v: BankAccount['kind']) => (v === 'credit' ? '信用卡' : '储蓄卡') },
            {
              title: '余额(元)',
              dataIndex: 'balanceCents',
              render: (v: number) => (v / 100).toFixed(2)
            },
            {
              title: '账单',
              render: (_: any, row: BankAccount) =>
                row.kind === 'credit' ? `出账日${row.billingDay ?? '-'} / 还款日${row.repaymentDay ?? '-'}` : '-'
            },
            {
              title: '状态',
              dataIndex: 'isActive',
              render: (v: boolean) => (v ? '启用' : '停用')
            },
            {
              title: '操作',
              render: (_: any, row: BankAccount) => (
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(row);
                    editForm.setFieldsValue({
                      bankName: row.bankName,
                      alias: row.alias,
                      last4: row.last4 ?? undefined,
                      kind: row.kind,
                      balance: (row.balanceCents ?? 0) / 100,
                      billingDay: row.billingDay ?? undefined,
                      repaymentDay: row.repaymentDay ?? undefined,
                      isActive: row.isActive
                    });
                    setEditOpen(true);
                  }}
                >
                  编辑
                </Button>
              )
            }
          ]}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title="编辑银行账户"
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
          const payload = {
            bankName: values.bankName,
            alias: values.alias,
            last4: values.last4 ?? null,
            kind: values.kind,
            balanceCents: Math.round((values.balance ?? 0) * 100),
            billingDay: values.kind === 'credit' ? values.billingDay ?? null : null,
            repaymentDay: values.kind === 'credit' ? values.repaymentDay ?? null : null,
            isActive: values.isActive
          };
          updateMutation.mutate({ id: editing.id, payload });
        }}
      >
        <Form form={editForm} layout="vertical" initialValues={{ isActive: true, kind: 'debit', balance: 0 }}>
          <Form.Item label="银行" name="bankName" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="别名" name="alias" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="后四位" name="last4" rules={[{ len: 4, message: '请输入 4 位' }]}>
            <Input maxLength={4} />
          </Form.Item>
          <Form.Item label="类型" name="kind" rules={[{ required: true }]}>
            <Select options={kindOptions} />
          </Form.Item>
          <Form.Item label="余额(元)" name="balance">
            <InputNumber precision={2} style={{ width: 220 }} />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {({ getFieldValue }) => {
              const kind = getFieldValue('kind');
              if (kind !== 'credit') return null;
              return (
                <Space>
                  <Form.Item label="出账日" name="billingDay" rules={[{ required: true }]}>
                    <InputNumber min={1} max={31} style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item label="还款日" name="repaymentDay" rules={[{ required: true }]}>
                    <InputNumber min={1} max={31} style={{ width: 120 }} />
                  </Form.Item>
                </Space>
              );
            }}
          </Form.Item>
          <Form.Item label="启用" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
