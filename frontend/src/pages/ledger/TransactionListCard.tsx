import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeleteOutlined, EditOutlined, ReloadOutlined, RollbackOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Pagination, Radio, Select, Space, Switch, Table, Tag, Tooltip, Typography, version } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useRef, useState, type Key } from 'react';

import { CategoryLeafSelect, type CategoryNode, type CategoryType } from '../../components/CategoryLeafSelect';
import { useAuth } from '../../auth/useAuth';
import { api, getApiErrorMessage } from '../../lib/api';

alert(version);
type BankAccount = {
  id: number;
  bankName: string;
  alias: string;
  last4: string | null;
  kind: 'debit' | 'credit';
  balanceCents: number;
  isActive: boolean;
};

type TransactionRow = {
  id: number;
  type: 'income' | 'expense' | 'transfer' | 'refund';
  amountCents: number;
  occurredAt: string;
  createdAt: string;
  categoryId: number | null;
  fundingSource: 'cash' | 'bank';
  bankAccountId: number | null;
  toBankAccountId?: number | null;
  refundOfTransactionId?: number | null;
  refundedCents?: number | null;
  note: string | null;
  tagIds: number[];
  tagNames: string[];
  children?: TransactionRow[];
};

type TransactionListOut = {
  items: TransactionRow[];
  refundItems: TransactionRow[];
  total: number;
  incomeCents: number;
  expenseCents: number;
};

type CategoryTagDto = {
  id: number;
  categoryId: number;
  name: string;
  isActive: boolean;
};

type TypeFilter = 'all' | TransactionRow['type'];
type SourceFilter = 'all' | TransactionRow['fundingSource'];
type BankAccountFilter = 'all' | number;

type UiFlashRow = { id: number; at: number } | null;

type GroupRow = {
  key: string;
  isGroup: true;
  date: string; // YYYY-MM-DD
  incomeCents: number;
  expenseCents: number;
  count: number;
  children: TransactionRow[];
};

type TableRow = TransactionRow | GroupRow;

function isGroupRow(row: TableRow): row is GroupRow {
  return (row as GroupRow).isGroup === true;
}

export function TransactionListCard({ title = '流水列表' }: { title?: string }) {
  const auth = useAuth();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [bankAccountFilter, setBankAccountFilter] = useState<BankAccountFilter>('all');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [keyword, setKeyword] = useState('');

  const [groupByDate, setGroupByDate] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [flashRowId, setFlashRowId] = useState<number | null>(null);

  const [expandedRowKeys, setExpandedRowKeys] = useState<Key[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [editTopLevelExpenseCategoryId, setEditTopLevelExpenseCategoryId] = useState<number | null>(null);
  const [editForm] = Form.useForm<{ occurredAt: Dayjs; categoryId: number; tagIds?: number[] }>();

  const [refundOpen, setRefundOpen] = useState(false);
  const [refunding, setRefunding] = useState<TransactionRow | null>(null);
  const [refundForm] = Form.useForm<{ mode: 'full' | 'partial'; amount?: number }>();

  const listQuery = useQuery<TransactionListOut>({
    queryKey: [
      'transactions',
      {
        typeFilter,
        sourceFilter,
        bankAccountFilter,
        start: dateRange?.[0]?.toISOString() ?? null,
        end: dateRange?.[1]?.toISOString() ?? null,
        keyword,
        page,
        pageSize
      }
    ],
    queryFn: () => {
      const [start, end] = dateRange;
      const params = new URLSearchParams();
      params.set('type', typeFilter);
      params.set('fundingSource', sourceFilter);
      if (bankAccountFilter !== 'all') params.set('bankAccountId', String(bankAccountFilter));
      if (start) params.set('start', start.startOf('day').toISOString());
      if (end) params.set('end', end.endOf('day').toISOString());
      if (keyword.trim()) params.set('keyword', keyword.trim());
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      return api.get<TransactionListOut>(`/ledger/transactions?${params.toString()}`, { token: auth.token });
    },
    placeholderData: (prev) => prev
  });

  const flashQuery = useQuery({
    queryKey: ['ui', 'transactions', 'flashRow'],
    queryFn: async () => null as UiFlashRow,
    enabled: false,
    initialData: null as UiFlashRow,
    staleTime: Infinity,
    gcTime: Infinity
  });

  const bankQuery = useQuery({
    queryKey: ['bankAccounts', 'usage'],
    queryFn: () => api.get<BankAccount[]>('/config/bank-accounts?orderBy=usage', { token: auth.token })
  });

  const categoriesExpenseQuery = useQuery({
    queryKey: ['categoriesTree', 'expense'],
    queryFn: () => api.get<CategoryNode[]>(`/config/categories/tree?type=expense`, { token: auth.token })
  });

  const categoriesIncomeQuery = useQuery({
    queryKey: ['categoriesTree', 'income'],
    queryFn: () => api.get<CategoryNode[]>(`/config/categories/tree?type=income`, { token: auth.token })
  });

  const editTagsQuery = useQuery({
    queryKey: ['categoryTagsForEdit', editTopLevelExpenseCategoryId],
    enabled: !!editTopLevelExpenseCategoryId,
    queryFn: () =>
      api.get<CategoryTagDto[]>(
        `/config/categories/${editTopLevelExpenseCategoryId}/tags?activeOnly=false`,
        { token: auth.token }
      )
  });

  const bankMap = new Map((bankQuery.data ?? []).map((b) => [b.id, b] as const));

  const categoryPathMap = useMemo(() => {
    const map = new Map<number, string>();
    const walk = (nodes: CategoryNode[], prefix: string[]) => {
      for (const n of nodes) {
        const nextPrefix = [...prefix, n.name];
        map.set(n.id, nextPrefix.join('/'));
        walk(n.children ?? [], nextPrefix);
      }
    };

    walk(categoriesExpenseQuery.data ?? [], []);
    walk(categoriesIncomeQuery.data ?? [], []);
    return map;
  }, [categoriesExpenseQuery.data, categoriesIncomeQuery.data]);

  // Week calculations: make week start on Monday
  const thisWeekStart = useMemo(() => {
    const now = dayjs();
    const offset = (now.day() + 6) % 7; // days since Monday
    return now.subtract(offset, 'day').startOf('day');
  }, []);
  const thisWeekEnd = useMemo(() => thisWeekStart.add(6, 'day').endOf('day'), [thisWeekStart]);

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: number; occurredAt?: string; categoryId?: number; tagIds?: number[] }) => {
      return api.patch<TransactionRow>(`/ledger/transactions/${payload.id}`, {
        occurredAt: payload.occurredAt,
        categoryId: payload.categoryId,
        tagIds: payload.tagIds
      }, { token: auth.token });
    },
    onSuccess: async () => {
      message.success('已保存');
      setEditOpen(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/ledger/transactions/${id}`, { token: auth.token }),
    onSuccess: async () => {
      message.success('已删除');
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err));
    }
  });

  const refundMutation = useMutation({
    mutationFn: async (payload: { id: number; mode: 'full' | 'partial'; amountCents?: number }) => {
      return api.post<TransactionRow>(`/ledger/transactions/${payload.id}/refund`, {
        mode: payload.mode,
        amountCents: payload.mode === 'partial' ? payload.amountCents : null
      }, { token: auth.token });
    },
    onSuccess: async (created) => {
      message.success('已退款');
      setRefundOpen(false);
      setRefunding(null);
      refundForm.resetFields();
      queryClient.setQueryData(['ui', 'transactions', 'flashRow'], { id: created.id, at: Date.now() });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
    },
    onError: (err) => {
      message.error(getApiErrorMessage(err));
    }
  });

  const paged = useMemo(() => {
    const items = listQuery.data?.items ?? [];
    const refunds = listQuery.data?.refundItems ?? [];

    const map = new Map<number, TransactionRow[]>();
    for (const r of refunds) {
      const parentId = r.refundOfTransactionId ?? null;
      if (!parentId) continue;
      const list = map.get(parentId);
      if (list) list.push(r);
      else map.set(parentId, [r]);
    }

    return items.map((it) => {
      const children = map.get(it.id) ?? [];
      if (!children.length) return it;
      return { ...it, children };
    });
  }, [listQuery.data?.items, listQuery.data?.refundItems]);

  const groupedPaged = useMemo((): GroupRow[] => {
    const groups = new Map<string, TransactionRow[]>();
    for (const row of paged ?? []) {
      const d = dayjs(row.occurredAt);
      const key = d.isValid() ? d.format('YYYY-MM-DD') : '未知日期';
      const list = groups.get(key);
      if (list) list.push(row);
      else groups.set(key, [row]);
    }

    return Array.from(groups.entries()).map(([date, children]) => {
      let incomeCents = 0;
      let expenseCents = 0;
      for (const r of children) {
        if (r.type === 'income') incomeCents += r.amountCents ?? 0;
        else if (r.type === 'expense') expenseCents += r.amountCents ?? 0;
      }
      return {
        key: `date:${date}`,
        isGroup: true,
        date,
        incomeCents,
        expenseCents,
        count: children.length,
        children
      };
    });
  }, [paged]);

  // When filters change and results shrink, go back to first page
  useEffect(() => {
    setPage(1);
  }, [typeFilter, sourceFilter, bankAccountFilter, dateRange, keyword]);

  useEffect(() => {
    const flashId = flashQuery.data?.id ?? null;
    if (!flashId) return;
    setFlashRowId(flashId);
    const timer = window.setTimeout(() => {
      setFlashRowId(null);
      queryClient.setQueryData(['ui', 'transactions', 'flashRow'], null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [flashQuery.data?.id, queryClient]);

  useEffect(() => {
    // With server-side paging, we don't auto-jump to the page containing the flash row.
    // Keep the highlight if the row is in the current page.
  }, []);

  const totals = useMemo(() => {
    return {
      income: listQuery.data?.incomeCents ?? 0,
      expense: listQuery.data?.expenseCents ?? 0
    };
  }, [listQuery.data?.expenseCents, listQuery.data?.incomeCents]);

  useEffect(() => {
    const allKeys = groupedPaged.map((g) => g.key);
    if (!groupByDate) return;
    // Default to fully expanded date groups for the current page, but preserve other expanded keys.
    setExpandedRowKeys((prev) => {
      const txKeys = (prev ?? []).filter((k) => typeof k === 'number');
      return [...txKeys, ...allKeys];
    });
  }, [groupByDate, groupedPaged]);

  const tableData = useMemo((): TableRow[] => {
    return groupByDate ? (groupedPaged as TableRow[]) : (paged as TableRow[]);
  }, [groupByDate, groupedPaged, paged]);

  return (
    <Card
      className="appCard--static"
      title={
        <Space size={12} align="center">
          <span>{title}</span>
          <Space size={6} align="center">
            <Switch checked={groupByDate} onChange={(v) => setGroupByDate(v)} />
            <Typography.Text type="secondary">按日期分组</Typography.Text>
          </Space>
        </Space>
      }
      extra={
        <Space size={12}>
          <Typography.Text style={{ color: '#3f8600', fontWeight: 600 }}>收入: ¥{(totals.income / 100).toFixed(2)}</Typography.Text>
          <Typography.Text style={{ color: '#cf1322', fontWeight: 600 }}>支出: ¥{(totals.expense / 100).toFixed(2)}</Typography.Text>
        </Space>
      }
      styles={{
        header: {
          flex: 'none'
        },
        body: {
          padding: 12,
          minHeight: 0,
          overflow: 'hidden',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          flex: 1
        }
      }}
      style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <Space wrap size={8} style={{ width: '100%', flex: 'none', marginBottom: 8 }}>
          <Select
            value={typeFilter}
            style={{ width: 120 }}
            options={[
              { value: 'all', label: '全部类型' },
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
              { value: 'transfer', label: '转账' },
              { value: 'refund', label: '退款' }
            ]}
            onChange={(v) => setTypeFilter(v)}
          />
          <Select
            value={sourceFilter}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: '全部来源' },
              { value: 'cash', label: '现金' },
              { value: 'bank', label: '银行卡/信用卡' }
            ]}
            onChange={(v) => setSourceFilter(v)}
          />
          <Select
            value={bankAccountFilter}
            style={{ width: 240 }}
            options={[
              { value: 'all', label: '全部银行账户' },
              ...(bankQuery.data ?? []).map((b) => ({
                value: b.id,
                label: `${b.bankName}-${b.alias}${b.last4 ? `(${b.last4})` : ''}${b.isActive ? '' : '（停用）'}`
              }))
            ]}
            onChange={(v) => setBankAccountFilter(v as BankAccountFilter)}
          />
          <DatePicker.RangePicker
            value={dateRange}
            // date-only picker for filter (day precision)
            format="YYYY-MM-DD"
            presets={[
              { label: '今年', value: [dayjs().startOf('year'), dayjs().endOf('year')] },
              {
                label: '去年',
                value: [dayjs().subtract(1, 'year').startOf('year'), dayjs().subtract(1, 'year').endOf('year')]
              },
              { label: '本月', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
              {
                label: '上月',
                value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')]
              },
              { label: '近三个月', value: [dayjs().subtract(2, 'month').startOf('month'), dayjs().endOf('month')] },
              { label: '本周', value: [thisWeekStart, thisWeekEnd] },
              { label: '上周', value: [thisWeekStart.subtract(7, 'day'), thisWeekStart.subtract(1, 'day')] }
            ]}
            onChange={(v) => setDateRange(v ?? [null, null])}
            style={{ width: 260 }}
          />
          <Input
            placeholder="搜索备注/标签"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 180 }}
            allowClear
          />
          <Button
            onClick={() => {
              setTypeFilter('all');
              setSourceFilter('all');
              setBankAccountFilter('all');
              setDateRange([dayjs().startOf('month'), dayjs().endOf('month')]);
              setKeyword('');
            }}
          >
            重置
          </Button>
          <Button
            icon={<ReloadOutlined />}
            aria-label="刷新"
            title="刷新"
            loading={listQuery.isFetching || bankQuery.isFetching || categoriesExpenseQuery.isFetching || categoriesIncomeQuery.isFetching}
            onClick={() => {
              void listQuery.refetch();
              void bankQuery.refetch();
              void categoriesExpenseQuery.refetch();
              void categoriesIncomeQuery.refetch();
            }}
          />
        </Space>

        <div ref={tableScrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <Table
            rowKey={(record: TableRow) => (isGroupRow(record) ? record.key : record.id)}
            loading={listQuery.isLoading}
            dataSource={tableData}
            className="tx-transactions-table"
            sticky={{ getContainer: () => tableScrollRef.current ?? document.body }}
            scroll={{ x: 1810 }}
            expandable={{
              expandedRowKeys,
              onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as Key[]),
              expandRowByClick: true,
              showExpandColumn: true
            }}
            rowClassName={(record: TableRow, index: number) => {
              const classes: string[] = [];
              if (isGroupRow(record)) {
                classes.push('tx-row-group');
                return classes.join(' ');
              }
              if (record.id === flashRowId) classes.push('tx-row-flash');
              if (record.id === selectedRowId) classes.push('tx-row-selected');
              return classes.join(' ');
            }}
            onRow={(record: TableRow) => ({
              onClick: () => {
                if (isGroupRow(record)) return;
                setSelectedRowId(record.id);
              }
            })}
            columns={[
            {
              title: '发生时间',
              dataIndex: 'occurredAt',
              width: 220,
              fixed: 'left',
              render: (_v: unknown, record: TableRow) => {
                if (isGroupRow(record)) {
                  return (
                    <Typography.Text strong>
                      {record.date}（{record.count}条）
                    </Typography.Text>
                  );
                }
                const v = record.occurredAt;
                if (!v) return '-';
                const d = dayjs(v);
                const short = d.format('YYYY-MM-DD');
                const full = d.format('YYYY-MM-DD HH:mm');

                const hasRefundChild = record.type === 'expense' && (record.children ?? []).some((c) => c.type === 'refund');
                return (
                  <Space size={8} align="center">
                    <span title={full}>{short}</span>
                    {hasRefundChild ? <Tag>退款</Tag> : null}
                  </Space>
                );
              }
            },
            {
              title: '项目',
              width: 300,
              fixed: 'left',
              render: (_: any, row: TableRow) => {
                if (isGroupRow(row)) return '-';
                if (row.type === 'transfer') return '转账/还款';
                if (row.type === 'refund') return '退款';
                if (!row.categoryId) return '-';
                const path = categoryPathMap.get(row.categoryId) ?? `#${row.categoryId}`;
                const parts = path.split('/');
                if (parts.length === 0) return path;
                if (parts.length === 1) return <span className="tx-category-leaf">{parts[0]}</span>;
                const leaf = parts[parts.length - 1];
                const prefix = parts.slice(0, parts.length - 1).join('/');
                return (
                  <span>
                    <span>{prefix}/</span>
                    <span className="tx-category-leaf">{leaf}</span>
                  </span>
                );
              }
            },
            {
              title: '金额',
              dataIndex: 'amountCents',
              width: 230,
              fixed: 'left',
              render: (_v: unknown, row: TableRow) => {
                if (isGroupRow(row)) {
                  return (
                    <Space size={8}>
                      <Typography.Text style={{ color: '#3f8600', fontWeight: 600 }}>
                        收入 ¥{(row.incomeCents / 100).toFixed(2)}
                      </Typography.Text>
                      <Typography.Text style={{ color: '#cf1322', fontWeight: 600 }}>
                        支出 ¥{(row.expenseCents / 100).toFixed(2)}
                      </Typography.Text>
                    </Space>
                  );
                }
                const cents = row.amountCents ?? 0;
                const display = (cents / 100).toFixed(2);
                const isLarge = Math.abs(cents) > 100 * 100; // > 100元
                return <span className={isLarge ? 'tx-amount-large' : undefined}>{display}</span>;
              }
            },
            {
              title: '来源',
              dataIndex: 'fundingSource',
              width: 150,
              render: (v, row: TableRow) => {
                if (isGroupRow(row)) return '-';
                if (row.type === 'transfer') return '转账';
                if (row.type === 'refund') return '退款';
                return v === 'cash' ? '现金' : '银行卡/信用卡';
              }
            },
            {
              title: '账户',
              width: 220,
              render: (_: any, row: TableRow) => {
                if (isGroupRow(row)) return '-';
                if (row.type === 'transfer') {
                  const from = row.bankAccountId ? bankMap.get(row.bankAccountId) : null;
                  const to = row.toBankAccountId ? bankMap.get(row.toBankAccountId) : null;
                  const fromLabel = from
                    ? `${from.bankName}-${from.alias}${from.last4 ? `(${from.last4})` : ''}`
                    : '-';
                  const toLabel = to
                    ? `${to.bankName}-${to.alias}${to.last4 ? `(${to.last4})` : ''}`
                    : '-';
                  return `${fromLabel} → ${toLabel}`;
                }
                if (row.fundingSource === 'cash') return '现金';
                const b = row.bankAccountId ? bankMap.get(row.bankAccountId) : null;
                return b ? `${b.bankName}-${b.alias}${b.last4 ? `(${b.last4})` : ''}` : '-';
              }
            },
            {
              title: '标签',
              dataIndex: 'tagNames',
              width: 120,
              render: (_v: unknown, row: TableRow) => {
                if (isGroupRow(row)) return '-';
                const v = row.tagNames;
                return v && v.length ? v.join('、') : '-';
              }
            },
            {
              title: '备注',
              dataIndex: 'note',
              width: 200,
              render: (_v: unknown, row: TableRow) => {
                if (isGroupRow(row)) return '-';
                const note = row.note?.trim() ?? '';
                if (!note) return '-';
                return (
                  <Tooltip title={note} placement="topLeft">
                    <Typography.Text
                      ellipsis={{ tooltip: false }}
                      style={{ display: 'inline-block', maxWidth: '100%' }}
                    >
                      {note}
                    </Typography.Text>
                  </Tooltip>
                );
              }
            }
            ,
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              width: 150,
              render: (_v: unknown, row: TableRow) => {
                if (isGroupRow(row)) return '-';
                const v = row.createdAt;
                return v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-';
              }
            },
            {
              title: '操作',
              width: 150,
              fixed: 'right',
              render: (_: any, row: TableRow) => {
                if (isGroupRow(row)) return null;
                const isRefund = !!row.refundOfTransactionId;
                const editable = row.type !== 'transfer' && !isRefund;

                const canRefundBase = row.type === 'expense' && row.fundingSource === 'bank' && !isRefund && (row.amountCents ?? 0) > 0;
                const refunded = row.refundedCents ?? 0;
                const remaining = (row.amountCents ?? 0) - refunded;
                const canRefund = canRefundBase && remaining > 0;

                const refundTip = canRefundBase
                  ? remaining <= 0
                    ? '已全额退款'
                    : `可退款 ¥${(remaining / 100).toFixed(2)}`
                  : '仅支持银行卡支出退款';
                return (
                  <Space size={0}>
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      disabled={!editable}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!editable) {
                          if (row.type === 'transfer') message.info('暂不支持编辑转账');
                          else message.info('退款流水不支持编辑');
                          return;
                        }
                        setEditing(row);
                        setEditOpen(true);
                        setEditTopLevelExpenseCategoryId(null);
                        editForm.setFieldsValue({
                          occurredAt: dayjs(row.occurredAt),
                          categoryId: row.categoryId ?? undefined,
                          tagIds: row.tagIds ?? []
                        } as any);
                      }}
                    />
                    <Tooltip title={refundTip}>
                      <span>
                        <Button
                          type="link"
                          size="small"
                          icon={<RollbackOutlined />}
                          disabled={!canRefund}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!canRefund) {
                              if (canRefundBase && remaining <= 0) message.info('该记录已全额退款');
                              else message.info('仅支持对“银行卡支出”进行退款');
                              return;
                            }
                            setRefunding(row);
                            setRefundOpen(true);
                            refundForm.setFieldsValue({ mode: 'full', amount: undefined });
                          }}
                        />
                      </span>
                    </Tooltip>
                    <Button
                      type="link"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        modal.confirm({
                          title: '确认删除这条流水？',
                          content: '删除会同步回滚相关银行账户余额。',
                          okText: '删除',
                          okButtonProps: { danger: true },
                          cancelText: '取消',
                          onOk: async () => {
                            return deleteMutation.mutateAsync(row.id);
                          }
                        });
                      }}
                      loading={deleteMutation.isPending}
                    />
                  </Space>
                );
              }
            }
            ]}
            pagination={false}
            size="small"
          />
        </div>

        <div
          style={{
            flex: 'none',
            paddingTop: 8,
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: '1px solid #f0f0f0',
            background: '#fff'
          }}
        >
          <Pagination
            current={page}
            pageSize={pageSize}
            total={listQuery.data?.total ?? 0}
            showSizeChanger
            pageSizeOptions={['20', '50', '100', '200']}
            onChange={(nextPage, nextPageSize) => {
              if (nextPageSize !== pageSize) {
                setPageSize(nextPageSize);
                setPage(1);
                return;
              }
              setPage(nextPage);
            }}
            showTotal={(total) => `共 ${total} 条`}
          />
        </div>

        <Modal
          open={editOpen}
          title="编辑流水"
          okText="保存"
          cancelText="取消"
          confirmLoading={updateMutation.isPending}
          onCancel={() => {
            setEditOpen(false);
            setEditing(null);
          }}
          onOk={async () => {
            try {
              const v = await editForm.validateFields();
              if (!editing) return;

              const payload: any = {
                id: editing.id,
                occurredAt: v.occurredAt?.toISOString(),
                categoryId: v.categoryId
              };
              if (editing.type === 'expense') payload.tagIds = v.tagIds ?? [];

              await updateMutation.mutateAsync(payload);
            } catch {
              // onError already shows friendly message
            }
          }}
        >
          <Form form={editForm} layout="vertical">
            <Form.Item label="发生时间" name="occurredAt" rules={[{ required: true }]}>
              <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label={editing?.type === 'income' ? '收入分类' : '费用分类'} name="categoryId" rules={[{ required: true }]}>
              <CategoryLeafSelect
                type={(editing?.type ?? 'expense') as CategoryType}
                style={{ width: '100%' }}
                allowClear={false}
                onChange={(id) => {
                  editForm.setFieldValue('categoryId', id);
                }}
                onTopLevelChange={(id) => {
                  setEditTopLevelExpenseCategoryId(id);
                }}
              />
            </Form.Item>

            {editing?.type === 'expense' ? (
              <Form.Item label="标签" name="tagIds">
                <Select
                  mode="multiple"
                  placeholder={editTopLevelExpenseCategoryId ? '可多选' : '请先选择费用分类'}
                  disabled={!editTopLevelExpenseCategoryId}
                  loading={editTagsQuery.isLoading}
                  options={(editTagsQuery.data ?? []).map((t) => ({
                    value: t.id,
                    label: t.isActive ? t.name : `${t.name}（停用）`,
                    disabled: !t.isActive && !(editForm.getFieldValue('tagIds') ?? []).includes(t.id)
                  }))}
                />
              </Form.Item>
            ) : null}
          </Form>
        </Modal>

        <Modal
          open={refundOpen}
          title="退款"
          okText="确认退款"
          cancelText="取消"
          confirmLoading={refundMutation.isPending}
          onCancel={() => {
            setRefundOpen(false);
            setRefunding(null);
            refundForm.resetFields();
          }}
          onOk={async () => {
            if (!refunding) return;

            const refunded = refunding.refundedCents ?? 0;
            const remaining = (refunding.amountCents ?? 0) - refunded;
            if (remaining <= 0) {
              message.info('该记录已全额退款');
              return;
            }

            const v = await refundForm.validateFields();
            if (v.mode === 'full') {
              await refundMutation.mutateAsync({ id: refunding.id, mode: 'full' });
              return;
            }

            const amt = Number(v.amount ?? 0);
            const cents = Math.round(amt * 100);
            await refundMutation.mutateAsync({ id: refunding.id, mode: 'partial', amountCents: cents });
          }}
        >
          <Form
            form={refundForm}
            layout="vertical"
            initialValues={{ mode: 'full' }}
          >
            <Typography.Paragraph style={{ marginBottom: 12 }}>
              可退款金额：
              <Typography.Text strong>
                ¥{(
                  refunding
                    ? Math.max(0, (refunding.amountCents ?? 0) - (refunding.refundedCents ?? 0)) / 100
                    : 0
                ).toFixed(2)}
              </Typography.Text>
            </Typography.Paragraph>

            <Form.Item label="退款方式" name="mode" rules={[{ required: true }]}>
              <Radio.Group
                options={[
                  { label: '全额退款', value: 'full' },
                  { label: '部分退款', value: 'partial' }
                ]}
                optionType="button"
                buttonStyle="solid"
              />
            </Form.Item>

            <Form.Item noStyle dependencies={['mode']}>
              {({ getFieldValue }) => {
                const mode = getFieldValue('mode') as 'full' | 'partial' | undefined;
                if (mode !== 'partial') return null;

                const remainingCents = refunding
                  ? Math.max(0, (refunding.amountCents ?? 0) - (refunding.refundedCents ?? 0))
                  : 0;
                const remainingYuan = remainingCents / 100;

                return (
                  <Form.Item
                    label="退款金额（元）"
                    name="amount"
                    rules={[
                      { required: true, message: '请输入退款金额' },
                      {
                        validator: async (_rule, value) => {
                          const n = Number(value);
                          if (!Number.isFinite(n) || n <= 0) throw new Error('退款金额必须大于 0');
                          if (Math.round(n * 100) > remainingCents) throw new Error('退款金额不能超过可退款金额');
                        }
                      }
                    ]}
                  >
                    <InputNumber min={0} precision={2} max={remainingYuan} style={{ width: 220 }} />
                  </Form.Item>
                );
              }}
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </Card>
  );
}
