import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Tag,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

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
  billingDay: number | null;
  repaymentDay: number | null;
  isActive: boolean;
};

type CategoryTagDto = {
  id: number;
  categoryId: number;
  name: string;
  isActive: boolean;
};

type FormValues = {
  amount: number;
  occurredAt: Dayjs;
  categoryId: number;
  fundingSource: 'cash' | 'bank';
  bankAccountId?: number;
  tagIds?: number[];
  note?: string;
};

function TagMultiSelect({
  options,
  value,
  onChange
}: {
  options: Array<{ id: number; name: string; isActive: boolean }>;
  value?: number[];
  onChange?: (next: number[]) => void;
}) {
  const active = options.filter((t) => t.isActive);
  const selected = new Set((value ?? []).map((x) => Number(x)));

  if (active.length === 0) {
    return <span style={{ color: 'rgba(0,0,0,0.45)' }}>该一级分类暂无可用标签</span>;
  }

  const chipStyle: CSSProperties = {
    fontSize: 14,
    lineHeight: '22px',
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.10)',
    marginInlineEnd: 0,
    userSelect: 'none'
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {active.map((t) => (
          <Tag.CheckableTag
            key={t.id}
            checked={selected.has(t.id)}
            style={chipStyle}
            onChange={(checked) => {
              const next = new Set(selected);
              if (checked) next.add(t.id);
              else next.delete(t.id);
              onChange?.(Array.from(next.values()));
            }}
          >
            {t.name}
          </Tag.CheckableTag>
        ))}
      </div>
      <Space size={8}>
        <Button
          size="small"
          onClick={() => {
            onChange?.([]);
          }}
          disabled={(value ?? []).length === 0}
        >
          清空选择
        </Button>
        <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>可不选，可多选</span>
      </Space>
    </div>
  );
}

export function TransactionCreateExpensePage() {
  const auth = useAuth();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);

  const [form] = Form.useForm<FormValues>();
  const categoryId = Form.useWatch('categoryId', form);
  const [topLevelExpenseCategoryId, setTopLevelExpenseCategoryId] = useState<number | null>(null);

  const bankQuery = useQuery({
    queryKey: ['bankAccounts', 'usage'],
    queryFn: () => api.get<BankAccount[]>('/config/bank-accounts?orderBy=usage', { token: auth.token })
  });

  const tagsQuery = useQuery({
    queryKey: ['categoryTagsForCreate', topLevelExpenseCategoryId],
    enabled: !!topLevelExpenseCategoryId,
    queryFn: () => api.get<CategoryTagDto[]>(`/config/categories/${topLevelExpenseCategoryId}/tags`, { token: auth.token })
  });

  useEffect(() => {
    form.setFieldValue('tagIds', []);
  }, [categoryId, form]);

  return (
    <Card>
      <Form
        form={form}
        layout="vertical"
        style={{ paddingBottom: 96 }}
        initialValues={{
          fundingSource: 'bank',
          occurredAt: dayjs(),
          tagIds: []
        }}
        onFinish={async (values: FormValues) => {
          if (saving) return;
          setSaving(true);
          try {
            const payload = {
              type: 'expense',
              amountCents: Math.round((values.amount as number) * 100),
              occurredAt: values.occurredAt.toISOString(),
              categoryId: values.categoryId,
              fundingSource: values.fundingSource,
              bankAccountId: values.fundingSource === 'bank' ? values.bankAccountId : null,
              tagIds: values.tagIds ?? [],
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

        <Form.Item label="费用分类" name="categoryId" rules={[{ required: true }]}>
          <CategoryLeafSelect
            type="expense"
            style={{ width: 520, maxWidth: '100%' }}
            onTopLevelChange={(id) => setTopLevelExpenseCategoryId(id)}
          />
        </Form.Item>

        {topLevelExpenseCategoryId ? (
          <Form.Item label="标签" name="tagIds">
            <TagMultiSelect options={tagsQuery.data ?? []} />
          </Form.Item>
        ) : null}

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
        onReset={() => {
          form.resetFields();
          setTopLevelExpenseCategoryId(null);
        }}
        saveLoading={saving}
        disabled={saving}
      />
    </Card>
  );
}
