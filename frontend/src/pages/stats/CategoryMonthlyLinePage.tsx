import { useQuery } from '@tanstack/react-query';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { EChart } from '../../components/EChart';
import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';
import { formatYuan } from './statsUtils';

type MonthlyRangeOut = {
  startMonth: string; // YYYY-MM
  endMonth: string; // YYYY-MM
  series: Array<{ month: string; incomeCents: number; expenseCents: number }>;
};

export function CategoryMonthlyLinePage() {
  const auth = useAuth();

  const [startMonth, setStartMonth] = useState<Dayjs>(dayjs().add(-11, 'month').startOf('month'));
  const [endMonth, setEndMonth] = useState<Dayjs>(dayjs().startOf('month'));

  const start = startMonth.format('YYYY-MM');
  const end = endMonth.format('YYYY-MM');

  const query = useQuery({
    queryKey: ['stats', 'monthly-range', start, end],
    queryFn: () => api.get<MonthlyRangeOut>(`/stats/monthly-range?startMonth=${start}&endMonth=${end}`, { token: auth.token })
  });

  const derived = useMemo(() => {
    const series = query.data?.series ?? [];
    const months = series.map((x) => x.month);
    const incomeCents = series.map((x) => x.incomeCents);
    const expenseCents = series.map((x) => x.expenseCents);
    const incomeTotalCents = incomeCents.reduce((acc, v) => acc + (v ?? 0), 0);
    const expenseTotalCents = expenseCents.reduce((acc, v) => acc + (v ?? 0), 0);
    return { months, incomeCents, expenseCents, incomeTotalCents, expenseTotalCents };
  }, [query.data?.series]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const axis = params?.[0]?.axisValue ?? '';
          const lines = (params ?? []).map((p: any) => `${p.marker}${p.seriesName}: ¥${p.data}`);
          return [axis, ...lines].join('<br/>');
        }
      },
      legend: { top: 0 },
      grid: { left: 42, right: 18, top: 36, bottom: 42 },
      xAxis: { type: 'category', data: derived.months },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${v}` } },
      series: [
        {
          name: '收入',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: derived.incomeCents.map((c) => Number((c / 100).toFixed(2)))
        },
        {
          name: '支出',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: derived.expenseCents.map((c) => Number((c / 100).toFixed(2)))
        }
      ]
    }),
    [derived.expenseCents, derived.incomeCents, derived.months]
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card
        title="月度折线（范围内收入/支出）"
        extra={
          <Space size={12} align="center">
            <DatePicker
              picker="month"
              value={startMonth}
              onChange={(v: Dayjs | null) => setStartMonth(v ?? dayjs().add(-11, 'month').startOf('month'))}
              allowClear={false}
            />
            <Typography.Text type="secondary">至</Typography.Text>
            <DatePicker
              picker="month"
              value={endMonth}
              onChange={(v: Dayjs | null) => setEndMonth(v ?? dayjs().startOf('month'))}
              allowClear={false}
            />
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => query.refetch()}
              loading={query.isFetching}
            />
          </Space>
        }
      >
        <Space size={18} wrap>
          <Typography.Text type="secondary">收入合计</Typography.Text>
          <Typography.Text strong>¥{formatYuan(derived.incomeTotalCents)}</Typography.Text>
          <Typography.Text type="secondary">支出合计</Typography.Text>
          <Typography.Text strong>¥{formatYuan(derived.expenseTotalCents)}</Typography.Text>
        </Space>
      </Card>

      <Card title="趋势" loading={query.isLoading}>
        <EChart option={option as any} style={{ height: 520 }} />
      </Card>
    </div>
  );
}
