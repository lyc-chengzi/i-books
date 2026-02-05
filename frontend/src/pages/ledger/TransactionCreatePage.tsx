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
  TreeSelect,
  type TreeSelectProps,
  type FormInstance
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import { FloatingFormActions } from '../../components/FloatingFormActions';
import { api, getApiErrorMessage } from '../../lib/api';

type BankAccount = {
  id: number;
  bankName: string;
  alias: string;
  last4: string | null;
  isActive: boolean;
};

type CategoryType = 'income' | 'expense';
type CategoryNode = {
  id: number;
  type: CategoryType;
  name: string;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
  isLeaf: boolean;
  children: CategoryNode[];
};

type FormValues = {
  type: 'expense' | 'income';
  amount: number;
  occurredAt: Dayjs;
  categoryId: number;
  fundingSource: 'cash' | 'bank';
  bankAccountId?: number;
  tagIds?: number[];
  note?: string;
};

type CategoryTagDto = {
  id: number;
  categoryId: number;
  name: string;
  isActive: boolean;
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

  const chipStyle: React.CSSProperties = {
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

function findPath(nodes: CategoryNode[], id: number): number[] | null {
  for (const n of nodes) {
    if (n.id === id) return [n.id];
    const child = findPath(n.children ?? [], id);
    if (child) return [n.id, ...child];
  }
  return null;
}

export function TransactionCreatePage() {
  const auth = useAuth();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);

  const [form] = Form.useForm<FormValues>();
  const currentType = Form.useWatch('type', form) ?? 'expense';
  const selectedCategoryId = Form.useWatch('categoryId', form);

  const bankQuery = useQuery({
    queryKey: ['bankAccounts', 'usage'],
    queryFn: () => api.get<BankAccount[]>('/config/bank-accounts?orderBy=usage', { token: auth.token })
  });


  const categoriesQuery = useQuery({
    queryKey: ['categoriesTree', currentType],
    queryFn: () => api.get<CategoryNode[]>(`/config/categories/tree?type=${currentType}`, { token: auth.token })
  });

  const topLevelExpenseCategoryId = useMemo(() => {
    if (currentType !== 'expense') return null;
    if (!selectedCategoryId) return null;
    const path = findPath(categoriesQuery.data ?? [], selectedCategoryId);
    if (!path || path.length < 2) return null;
    return path[1];
  }, [currentType, selectedCategoryId, categoriesQuery.data]);

  const tagsQuery = useQuery({
    queryKey: ['categoryTagsForCreate', topLevelExpenseCategoryId],
    enabled: currentType === 'expense' && !!topLevelExpenseCategoryId,
    queryFn: () => api.get<CategoryTagDto[]>(`/config/categories/${topLevelExpenseCategoryId}/tags`, { token: auth.token })
  });

  useEffect(() => {
    if (currentType !== 'expense') {
      form.setFieldValue('tagIds', []);
    }
  }, [currentType, form]);

  useEffect(() => {
    // When switching categories (and thus top-level), reset selected tags
    form.setFieldValue('tagIds', []);
  }, [topLevelExpenseCategoryId, form]);

  const treeData: TreeSelectProps['treeData'] = (categoriesQuery.data ?? []).map(function mapNode(n): any {
    return {
      value: n.id,
      title: `${n.name}${n.isActive ? '' : '（停用）'}`,
      disabled: !n.isActive || !n.isLeaf,
      children: (n.children ?? []).map(mapNode)
    };
  });

  return (
    <Card title="新增流水">
      <Form
        form={form}
        layout="vertical"
        style={{ paddingBottom: 96 }}
        initialValues={{
          type: 'expense',
          fundingSource: 'bank',
          occurredAt: dayjs()
        }}
        onFinish={async (values: FormValues) => {
          if (saving) return;
          setSaving(true);
          try {
            const payload = {
              type: values.type,
              amountCents: Math.round((values.amount as number) * 100),
              occurredAt: values.occurredAt.toISOString(),
              categoryId: values.categoryId,
              fundingSource: values.fundingSource,
              bankAccountId: values.fundingSource === 'bank' ? values.bankAccountId : null,
              tagIds: values.type === 'expense' ? values.tagIds ?? [] : [],
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
        <Form.Item label="收支类型" name="type" rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { label: '支出', value: 'expense' },
              { label: '收入', value: 'income' }
            ]}
            optionType="button"
            buttonStyle="solid"
          />
        </Form.Item>

        <Form.Item label="金额（元）" name="amount" rules={[{ required: true }]}>
          <InputNumber min={0} precision={2} style={{ width: 220 }} />
        </Form.Item>

        <Form.Item label="发生时间" name="occurredAt" rules={[{ required: true }]}>
          <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" style={{ width: 260 }} />
        </Form.Item>


        <Form.Item shouldUpdate noStyle>
          {(form: FormInstance<FormValues>) => {
            return (
              <Form.Item
                label={form.getFieldValue('type') === 'expense' ? '费用分类' : '分类（叶子）'}
                name="categoryId"
                rules={[{ required: true }]}
              >
                <TreeSelect
                  style={{ width: 520, maxWidth: '100%' }}
                  loading={categoriesQuery.isLoading}
                  treeData={treeData}
                  placeholder="请先在 配置/分类 中维护分类树"
                  treeDefaultExpandAll
                  showSearch
                  allowClear
                />
              </Form.Item>
            );
          }}
        </Form.Item>

        {currentType === 'expense' && topLevelExpenseCategoryId ? (
          <Form.Item label="标签" name="tagIds">
            <TagMultiSelect options={tagsQuery.data ?? []} />
          </Form.Item>
        ) : null}

        <Form.Item label="资金来源" name="fundingSource" rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { label: '现金', value: 'cash' },
              { label: '银行卡', value: 'bank' }
            ]}
            optionType="button"
            buttonStyle="solid"
          />
        </Form.Item>

        <Form.Item shouldUpdate noStyle>
          {(form: FormInstance<FormValues>) => {
            const getFieldValue = form.getFieldValue;
            const fundingSource = getFieldValue('fundingSource');
            if (fundingSource !== 'bank') return null;

            const options = (bankQuery.data ?? [])
              .filter((b: BankAccount) => b.isActive)
              .map((b: BankAccount) => ({
                value: b.id,
                label: (
                  <span>
                    <span style={{ fontWeight: 600 }}>{b.bankName}</span>
                    {` - ${b.alias}${b.last4 ? ` (${b.last4})` : ''}`}
                  </span>
                )
              }));

            return (
              <Form.Item label="银行账户" name="bankAccountId" rules={[{ required: true }]}>
                <Select
                  style={{ width: 360 }}
                  loading={bankQuery.isLoading}
                  options={options}
                  placeholder="请选择银行账户"
                />
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
