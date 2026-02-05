import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AntdApp, Card, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

import { useAuth } from '../../auth/useAuth';
import { FloatingFormActions } from '../../components/FloatingFormActions';
import { api, getApiErrorMessage } from '../../lib/api';

type BankAccount = {
  id: number;
  bankName: string;
  alias: string;
  last4: string | null;
  kind: 'debit' | 'credit';
  balanceCents: number;
  isActive: boolean;
};

type FormValues = {
  fromBankAccountId: number;
  toBankAccountId: number;
  amount: number;
  occurredAt: Dayjs;
  note?: string;
};

export function TransferCreatePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { message } = AntdApp.useApp();

  const [form] = Form.useForm<FormValues>();

  const bankQuery = useQuery({
    queryKey: ['bankAccounts', 'usage'],
    queryFn: () => api.get<BankAccount[]>('/config/bank-accounts?orderBy=usage', { token: auth.token })
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/ledger/transfers', payload, { token: auth.token }),
    onSuccess: async () => {
      message.success('转账已保存');
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err));
    }
  });

  const options = (bankQuery.data ?? [])
    .filter((b) => b.isActive)
    .map((b) => ({
      value: b.id,
      label: (
        <span>
          <span style={{ fontWeight: 600 }}>{b.bankName}</span>
          {` - ${b.alias}${b.last4 ? ` (${b.last4})` : ''} · ${b.kind === 'credit' ? '信用卡' : '储蓄卡'} · 余额 ${(b.balanceCents / 100).toFixed(2)}`}
        </span>
      )
    }));

  return (
    <Card>
      <Form
        form={form}
        layout="vertical"
        style={{ paddingBottom: 96 }}
        initialValues={{ occurredAt: dayjs() }}
        onFinish={(values: FormValues) => {
          const payload = {
            fromBankAccountId: values.fromBankAccountId,
            toBankAccountId: values.toBankAccountId,
            amountCents: Math.round((values.amount as number) * 100),
            occurredAt: values.occurredAt.toISOString(),
            note: values.note ?? null
          };
          createMutation.mutate(payload);
        }}
      >
        <Form.Item label="转出账户" name="fromBankAccountId" rules={[{ required: true }]}>
          <Select style={{ width: 520, maxWidth: '100%' }} options={options} loading={bankQuery.isLoading} />
        </Form.Item>
        <Form.Item label="转入账户" name="toBankAccountId" rules={[{ required: true }]}>
          <Select style={{ width: 520, maxWidth: '100%' }} options={options} loading={bankQuery.isLoading} />
        </Form.Item>
        <Form.Item label="金额（元）" name="amount" rules={[{ required: true }]}>
          <InputNumber min={0} precision={2} style={{ width: 220 }} />
        </Form.Item>
        <Form.Item label="发生时间" name="occurredAt" rules={[{ required: true }]}>
          <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" style={{ width: 260 }} />
        </Form.Item>
        <Form.Item label="备注" name="note">
          <Input.TextArea rows={3} style={{ maxWidth: 520 }} />
        </Form.Item>
      </Form>

      <FloatingFormActions
        onSave={() => form.submit()}
        onReset={() => form.resetFields()}
        saveLoading={createMutation.isPending}
        disabled={createMutation.isPending}
      />
    </Card>
  );
}
