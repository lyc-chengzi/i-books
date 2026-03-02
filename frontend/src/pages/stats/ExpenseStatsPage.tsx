import { useQuery } from '@tanstack/react-query';
import { Button, Card, DatePicker, Radio, Space, Statistic, TreeSelect, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';
import type { CategoryNode } from '../../components/CategoryLeafSelect';
import { EChart } from '../../components/EChart';
import { buildCategoryPathMap, formatYuan, getLeafName } from './statsUtils';

type ExpenseItemStatsOut = {
  scope: 'year' | 'month';
  year: number;
  month: number | null;
  categoryId: number;
  expenseCents: number;
  refundCents: number;
  netCents: number;
  totalCents: number;
  breakdown: Array<{ categoryId: number; amountCents: number }>;
};

function findNode(nodes: CategoryNode[], id: number): CategoryNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const child = findNode(n.children ?? [], id);
    if (child) return child;
  }
  return null;
}

function collectLeafIds(root: CategoryNode | null): Set<number> {
  const out = new Set<number>();
  if (!root) return out;

  const stack: CategoryNode[] = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.isLeaf) {
      out.add(cur.id);
    } else {
      for (const c of cur.children ?? []) stack.push(c);
    }
  }

  return out;
}

export function ExpenseStatsPage() {
  const auth = useAuth();

  const [mode, setMode] = useState<'year' | 'month'>('year');
  const [yearValue, setYearValue] = useState<number>(() => dayjs().year());
  const [monthValue, setMonthValue] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);

  const categoriesQuery = useQuery({
    queryKey: ['categoriesTree', 'expense'],
    queryFn: () => api.get<CategoryNode[]>('/config/categories/tree?type=expense', { token: auth.token })
  });

  const treeData = useMemo(() => {
    const mapNode = (n: CategoryNode): any => ({
      value: n.id,
      title: `${n.name}${n.isActive ? '' : '（停用）'}`,
      disabled: false,
      children: (n.children ?? []).map(mapNode)
    });

    return (categoriesQuery.data ?? []).map(mapNode);
  }, [categoriesQuery.data]);

  const pathMap = useMemo(() => buildCategoryPathMap(categoriesQuery.data ?? []), [categoriesQuery.data]);
  const selectedPath = categoryId ? pathMap.get(categoryId) ?? `#${categoryId}` : null;

  const selectedNode = useMemo(
    () => (categoryId ? findNode(categoriesQuery.data ?? [], categoryId) : null),
    [categoriesQuery.data, categoryId]
  );

  const leafIds = useMemo(() => collectLeafIds(selectedNode), [selectedNode]);

  const statsQuery = useQuery({
    queryKey: ['stats', 'expense-item', mode, yearValue, monthValue.format('YYYY-MM'), categoryId],
    queryFn: () => {
      const year = mode === 'year' ? yearValue : monthValue.year();
      const month = mode === 'year' ? null : monthValue.month() + 1;
      const qs = new URLSearchParams();
      qs.set('categoryId', String(categoryId));
      qs.set('year', String(year));
      if (month != null) qs.set('month', String(month));
      return api.get<ExpenseItemStatsOut>(`/stats/expense-item?${qs.toString()}`, { token: auth.token });
    },
    enabled: !!categoryId
  });

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Space size={12} wrap>
          <Radio.Group
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
            }}
            options={[
              { label: '按年', value: 'year' },
              { label: '按月', value: 'month' }
            ]}
            optionType="button"
            buttonStyle="solid"
          />

          {mode === 'year' ? (
            <DatePicker
              picker="year"
              value={dayjs(`${yearValue}-01-01`)}
              onChange={(v) => {
                if (v) setYearValue(v.year());
              }}
            />
          ) : (
            <DatePicker
              picker="month"
              value={monthValue}
              onChange={(v) => {
                if (v) setMonthValue(v.startOf('month'));
              }}
            />
          )}

          <TreeSelect
            style={{ width: 360, maxWidth: '100%' }}
            loading={categoriesQuery.isLoading}
            treeData={treeData}
            placeholder="选择记账项目（可选任意级）"
            treeDefaultExpandAll
            showSearch
            allowClear
            value={categoryId}
            onChange={(v) => {
              if (typeof v === 'number') setCategoryId(v);
              else if (typeof v === 'string') setCategoryId(Number(v));
              else setCategoryId(undefined);
            }}
          />

          <Button onClick={() => statsQuery.refetch()} disabled={!categoryId}>
            刷新
          </Button>
        </Space>

        {selectedPath ? (
          <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }} type="secondary">
            当前选择：{selectedPath}
          </Typography.Paragraph>
        ) : null}
      </Card>

      <Card>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">本期支出 / 本期退款 / 净支出</Typography.Text>
          <Space size={24} wrap>
            <Statistic
              title="本期支出"
              value={formatYuan(statsQuery.data?.expenseCents ?? 0)}
              prefix="¥"
            />
            <Statistic
              title="本期退款"
              value={formatYuan(statsQuery.data?.refundCents ?? 0)}
              prefix="¥"
            />
            <Statistic
              title="净支出"
              value={formatYuan(statsQuery.data?.netCents ?? 0)}
              prefix="¥"
              valueStyle={{ fontWeight: 700 }}
            />
          </Space>

          {statsQuery.isFetching ? <Typography.Text type="secondary">计算中…</Typography.Text> : null}
        </Space>
      </Card>

      <Card title="具体记账项合计（饼图）">
        {categoryId ? (
          <>
            <EChart
              option={{
                tooltip: {
                  trigger: 'item',
                  formatter: (p: any) => `${p.data.full}<br/>¥${formatYuan(p.value)}（${p.percent}%）`
                },
                legend: {
                  type: 'scroll',
                  bottom: 0
                },
                series: [
                  {
                    type: 'pie',
                    radius: ['35%', '70%'],
                    avoidLabelOverlap: true,
                    itemStyle: { borderRadius: 8, borderColor: 'rgba(255,255,255,0.9)', borderWidth: 2 },
                    label: { show: false },
                    emphasis: { label: { show: true, fontWeight: 700 } },
                    data: (statsQuery.data?.breakdown ?? [])
                      .filter((x) => leafIds.has(x.categoryId) && x.amountCents > 0)
                      .map((x) => {
                        const full = pathMap.get(x.categoryId) ?? `#${x.categoryId}`;
                        return { name: getLeafName(full), value: x.amountCents, full };
                      })
                  }
                ]
              }}
            />
            {(statsQuery.data?.breakdown ?? []).filter((x) => leafIds.has(x.categoryId) && x.amountCents > 0).length ===
            0 ? (
              <Typography.Text type="secondary">暂无数据</Typography.Text>
            ) : null}
          </>
        ) : (
          <Typography.Text type="secondary">请先选择记账项目</Typography.Text>
        )}
      </Card>
    </Space>
  );
}
