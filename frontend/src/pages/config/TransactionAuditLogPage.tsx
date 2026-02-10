import { useQuery } from '@tanstack/react-query';
import { Card, DatePicker, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';

import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';

type AuditLogAction = 'create' | 'update' | 'delete';
type TxType = 'income' | 'expense' | 'transfer' | 'refund';

type AuditLogRow = {
  id: number;
  action: AuditLogAction;
  actorUserId: number;
  targetUserId: number;
  transactionId: number | null;
  txType: TxType | null;
  createdAt: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
};

type ListOut = {
  items: AuditLogRow[];
  total: number;
};

type UserRow = {
  id: number;
  username: string;
};

function actionLabel(v: AuditLogAction): string {
  if (v === 'create') return '新增';
  if (v === 'update') return '修改';
  return '删除';
}

function typeLabel(v: TxType | null): string {
  if (!v) return '-';
  if (v === 'income') return '收入';
  if (v === 'expense') return '支出';
  if (v === 'transfer') return '转账';
  return '退款';
}

export function TransactionAuditLogPage() {
  const auth = useAuth();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [txType, setTxType] = useState<TxType | 'all'>('all');

  const usersQuery = useQuery({
    queryKey: ['users', 'idMap'],
    queryFn: () => api.get<UserRow[]>('/config/users', { token: auth.token })
  });

  const usernameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of usersQuery.data ?? []) map.set(u.id, u.username);
    return map;
  }, [usersQuery.data]);

  const startIso = dateRange[0] ? dateRange[0].startOf('day').toISOString() : null;
  const endIso = dateRange[1] ? dateRange[1].endOf('day').toISOString() : null;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    params.set('order', 'asc');
    if (txType !== 'all') params.set('txType', txType);
    if (startIso) params.set('start', startIso);
    if (endIso) params.set('end', endIso);
    return params.toString();
  }, [page, pageSize, txType, startIso, endIso]);

  const listQuery = useQuery({
    queryKey: ['transactionAuditLogs', queryString],
    queryFn: () =>
      api.get<ListOut>(`/admin/transaction-audit-logs?${queryString}`, {
        token: auth.token
      })
  });

  const columns: ColumnsType<AuditLogRow> = useMemo(
    () => [
      {
        title: '时间',
        dataIndex: 'createdAt',
        width: 190,
        render: (v: string) => {
          const d = new Date(v);
          return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
        }
      },
      {
        title: '操作',
        dataIndex: 'action',
        width: 90,
        render: (v: AuditLogAction) => {
          if (v === 'create') return <Tag color="green">新增</Tag>;
          if (v === 'update') return <Tag color="blue">修改</Tag>;
          return <Tag color="red">删除</Tag>;
        }
      },
      {
        title: '类型',
        dataIndex: 'txType',
        width: 90,
        render: (v: TxType | null) => typeLabel(v)
      },
      {
        title: '交易ID',
        dataIndex: 'transactionId',
        width: 100,
        render: (v: number | null) => v ?? '-'
      },
      {
        title: '操作人',
        dataIndex: 'actorUserId',
        width: 140,
        render: (id: number) => usernameById.get(id) ?? String(id)
      },
      {
        title: '账本用户',
        dataIndex: 'targetUserId',
        width: 140,
        render: (id: number) => usernameById.get(id) ?? String(id)
      }
    ],
    [usernameById]
  );

  return (
    <Card title="流水日志（管理员）">
      <div style={{ marginBottom: 12 }}>
        <Space wrap>
          <div style={{ fontWeight: 600 }}>日期范围</div>
          <DatePicker.RangePicker
            value={dateRange}
            allowClear
            format="YYYY-MM-DD"
            onChange={(v) => {
              setPage(1);
              setDateRange(v ?? [null, null]);
            }}
          />

          <div style={{ fontWeight: 600 }}>类型</div>
          <Select
            value={txType}
            style={{ width: 140 }}
            options={[
              { value: 'all', label: '全部' },
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
              { value: 'transfer', label: '转账' },
              { value: 'refund', label: '退款' }
            ]}
            onChange={(v) => {
              setPage(1);
              setTxType(v);
            }}
          />
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={listQuery.isLoading}
        dataSource={listQuery.data?.items ?? []}
        columns={columns}
        pagination={{
          current: page,
          pageSize,
          total: listQuery.data?.total ?? 0,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            if (typeof nextSize === 'number' && nextSize !== pageSize) setPageSize(nextSize);
          }
        }}
        expandable={{
          expandedRowRender: (row) => {
            const before = row.before ? JSON.stringify(row.before, null, 2) : '-';
            const after = row.after ? JSON.stringify(row.after, null, 2) : '-';
            const title = `${actionLabel(row.action)} ${typeLabel(row.txType)} 交易${row.transactionId ?? ''}`.trim();
            return (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontWeight: 600 }}>{title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>Before</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{before}</pre>
                  </div>
                  <div>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>After</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{after}</pre>
                  </div>
                </div>
              </div>
            );
          }
        }}
      />
    </Card>
  );
}
