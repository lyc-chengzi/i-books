import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useState } from 'react';

import { CategoryLeafSelect } from '../../components/CategoryLeafSelect';
import { FloatingFormActions } from '../../components/FloatingFormActions';
import { useAuth } from '../../auth/useAuth';
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
  amount: number;
  occurredAt: Dayjs;
  categoryId: number;
  fundingSource: 'cash' | 'bank';
  bankAccountId?: number;
  note?: string;
};

export function TransactionCreateIncomePage() {
  const auth = useAuth();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);

  const [form] = Form.useForm<FormValues>();

  const bankQuery = useQuery({
    queryKey: ['bankAccounts', 'usage'],
    queryFn: () => api.get<BankAccount[]>('/config/bank-accounts?orderBy=usage', { token: auth.token })
  });

  return (
    <Card>
      <Form
        form={form}
        layout="vertical"
        style={{ paddingBottom: 96 }}
        initialValues={{
          fundingSource: 'bank',
          occurredAt: dayjs()
        }}
        onFinish={async (values: FormValues) => {
          if (saving) return;
          setSaving(true);
          try {
            const payload = {
              type: 'income',
              amountCents: Math.round((values.amount as number) * 100),
              occurredAt: values.occurredAt.toISOString(),
              categoryId: values.categoryId,
              fundingSource: values.fundingSource,
              bankAccountId: values.fundingSource === 'bank' ? values.bankAccountId : null,
              tagIds: [],
              note: values.note ?? null
            };
            const created = await api.post<{ id: number }>('/ledger/transactions', payload, { token: auth.token });
            message.success('已保存');
            queryClient.setQueryData(['ui', 'transactions', 'flashRow'], { id: created.id, at: Date.now() });
            await queryClient.invalidateQueries({ queryKey: ['transactions'] });
            await queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
          } catch (err) {
            message.error(getApiErrorMessage(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item label="金额（元）" name="amount" rules={[{ required: true }]}>
          <InputNumber min={0} precision={2} style={{ width: 220 }} />
        </Form.Item>

        <Form.Item label="发生时间" name="occurredAt" rules={[{ required: true }]}>
          <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" style={{ width: 260 }} />
        </Form.Item>

        <Form.Item label="收入分类" name="categoryId" rules={[{ required: true }]}>
          <CategoryLeafSelect type="income" style={{ width: 520, maxWidth: '100%' }} />
        </Form.Item>

        <Form.Item label="资金来源" name="fundingSource" rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { label: '现金', value: 'cash' },
              { label: '银行卡/信用卡', value: 'bank' }
            ]}
            optionType="button"
            buttonStyle="solid"
          />
        </Form.Item>

        <Form.Item noStyle dependencies={['fundingSource']}>
          {({ getFieldValue }) => {
            const fundingSource = getFieldValue('fundingSource');
            if (fundingSource !== 'bank') return null;

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
              <Form.Item label="银行账户" name="bankAccountId" rules={[{ required: true }]}>
                <Select style={{ width: 520, maxWidth: '100%' }} loading={bankQuery.isLoading} options={options} />
              </Form.Item>
            );
          }}
        </Form.Item>

        <Form.Item label="备注" name="note">
          <Input.TextArea rows={3} style={{ maxWidth: 520 }} />
        </Form.Item>

      </Form>

      <FloatingFormActions
        onSave={() => form.submit()}
        onReset={() => form.resetFields()}
        saveLoading={saving}
        disabled={saving}
      />
    </Card>
  );
}
