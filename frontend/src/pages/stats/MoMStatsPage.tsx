import { useQuery } from '@tanstack/react-query';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Radio, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { EChart } from '../../components/EChart';
import type { CategoryNode } from '../../components/CategoryLeafSelect';
import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';
import { buildCategoryPathMap, formatYuan, getLeafName } from './statsUtils';

type CompareOut = {
  type: 'income' | 'expense';
  currentLabel: string;
  previousLabel: string;
  currentTotalCents: number;
  previousTotalCents: number;
  items: Array<{ categoryId: number; currentCents: number; previousCents: number }>;
};

export function MoMStatsPage() {
  const auth = useAuth();

  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
  const [type, setType] = useState<'expense' | 'income'>('expense');

  const year = month.year();
  const mm = month.month() + 1;

  const categoriesQuery = useQuery({
    queryKey: ['categoriesTree', type],
    queryFn: () => api.get<CategoryNode[]>(`/config/categories/tree?type=${type}`, { token: auth.token })
  });

  const query = useQuery({
    queryKey: ['stats', 'mom', year, mm, type],
    queryFn: () => api.get<CompareOut>(`/stats/mom?year=${year}&month=${mm}&type=${type}`, { token: auth.token })
  });

  const pathMap = useMemo(() => buildCategoryPathMap(categoriesQuery.data ?? []), [categoriesQuery.data]);

  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    return items
      .map((x) => {
        const path = pathMap.get(x.categoryId) ?? `#${x.categoryId}`;
        return {
          categoryId: x.categoryId,
          path,
          name: getLeafName(path),
          currentCents: x.currentCents,
          previousCents: x.previousCents
        };
      })
      .filter((x) => x.currentCents !== 0 || x.previousCents !== 0)
      .slice(0, 30);
  }, [pathMap, query.data?.items]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const p0 = params?.[0];
          const idx = p0?.dataIndex ?? 0;
          const r = rows[idx];
          const title = r ? r.path : params?.[0]?.axisValue;
          const lines = (params ?? []).map((p: any) => `${p.marker}${p.seriesName}: ¥${p.data}`);
          return [title, ...lines].join('<br/>');
        }
      },
      legend: { top: 0 },
      grid: { left: 42, right: 18, top: 36, bottom: 80 },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 24 }],
      xAxis: {
        type: 'category',
        data: rows.map((x) => x.name),
        axisLabel: { rotate: 28, interval: 0 }
      },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${v}` } },
      series: [
        {
          name: query.data?.currentLabel ?? '本月',
          type: 'bar',
          barMaxWidth: 28,
          data: rows.map((x) => Number((x.currentCents / 100).toFixed(2)))
        },
        {
          name: query.data?.previousLabel ?? '上月',
          type: 'bar',
          barMaxWidth: 28,
          data: rows.map((x) => Number((x.previousCents / 100).toFixed(2)))
        },
        {
          name: `${query.data?.currentLabel ?? '本月'}（折线）`,
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: rows.map((x) => Number((x.currentCents / 100).toFixed(2)))
        },
        {
          name: `${query.data?.previousLabel ?? '上月'}（折线）`,
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: rows.map((x) => Number((x.previousCents / 100).toFixed(2)))
        }
      ]
    }),
    [query.data?.currentLabel, query.data?.previousLabel, rows]
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card
        title="环比统计"
        extra={
          <Space size={12} align="center">
            <DatePicker
              picker="month"
              value={month}
              onChange={(v: Dayjs | null) => setMonth(v ?? dayjs().startOf('month'))}
              allowClear={false}
            />
            <Radio.Group
              value={type}
              onChange={(e) => setType(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: '支出', value: 'expense' },
                { label: '收入', value: 'income' }
              ]}
            />
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => {
                query.refetch();
                categoriesQuery.refetch();
              }}
              loading={query.isFetching || categoriesQuery.isFetching}
            />
          </Space>
        }
      >
        <Space size={18} wrap>
          <Typography.Text type="secondary">{query.data?.currentLabel ?? month.format('YYYY-MM')}</Typography.Text>
          <Typography.Text strong>¥{formatYuan(query.data?.currentTotalCents ?? 0)}</Typography.Text>
          <Typography.Text type="secondary">对比 {query.data?.previousLabel ?? month.add(-1, 'month').format('YYYY-MM')}</Typography.Text>
          <Typography.Text strong>¥{formatYuan(query.data?.previousTotalCents ?? 0)}</Typography.Text>
        </Space>
      </Card>

      <Card title="按费用项目对比（Top 30）" loading={query.isLoading || categoriesQuery.isLoading}>
        <EChart option={option as any} style={{ height: 520 }} />
      </Card>
    </div>
  );
}
