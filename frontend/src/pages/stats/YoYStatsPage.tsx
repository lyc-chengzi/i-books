import { useQuery } from '@tanstack/react-query';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Radio, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { EChart } from '../../components/EChart';
import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';
import { formatYuan } from './statsUtils';

type YoYMonthlyOut = {
  type: 'income' | 'expense';
  currentLabel: string;
  previousLabel: string;
  series: Array<{
    month: string; // YYYY-MM
    currentCents: number;
    previousCents: number;
    items: Array<{ categoryId: number; currentCents: number; previousCents: number }>;
  }>;
};

export function YoYStatsPage() {
  const auth = useAuth();

  const [year, setYear] = useState<number>(dayjs().year());
  const [type, setType] = useState<'expense' | 'income'>('expense');

  const monthlyQuery = useQuery({
    queryKey: ['stats', 'yoy-monthly', year, type],
    queryFn: () => api.get<YoYMonthlyOut>(`/stats/yoy-monthly?year=${year}&type=${type}`, { token: auth.token })
  });

  const monthly = useMemo(() => monthlyQuery.data?.series ?? [], [monthlyQuery.data?.series]);

  const totals = useMemo(() => {
    const cur = monthly.reduce((acc, x) => acc + (x.currentCents ?? 0), 0);
    const prev = monthly.reduce((acc, x) => acc + (x.previousCents ?? 0), 0);
    return { currentTotalCents: cur, previousTotalCents: prev };
  }, [monthly]);

  const monthlyLineOption = useMemo(
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
      xAxis: {
        type: 'category',
        data: monthly.map((x) => x.month),
        axisLabel: { formatter: (v: string) => v.slice(5) }
      },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${v}` } },
      series: [
        {
          name: monthlyQuery.data?.currentLabel ?? '本年',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: monthly.map((x) => Number((x.currentCents / 100).toFixed(2)))
        },
        {
          name: monthlyQuery.data?.previousLabel ?? '上年',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: monthly.map((x) => Number((x.previousCents / 100).toFixed(2)))
        }
      ]
    }),
    [monthly, monthlyQuery.data?.currentLabel, monthlyQuery.data?.previousLabel]
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card
        title="同比统计"
        extra={
          <Space size={12} align="center">
            <DatePicker
              picker="year"
              value={dayjs(`${year}-01-01`)}
              onChange={(v: Dayjs | null) => setYear(v ? v.year() : dayjs().year())}
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
                monthlyQuery.refetch();
              }}
              loading={monthlyQuery.isFetching}
            />
          </Space>
        }
      >
        <Space size={18} wrap>
          <Typography.Text type="secondary">{monthlyQuery.data?.currentLabel ?? year}</Typography.Text>
          <Typography.Text strong>¥{formatYuan(totals.currentTotalCents)}</Typography.Text>
          <Typography.Text type="secondary">对比 {monthlyQuery.data?.previousLabel ?? year - 1}</Typography.Text>
          <Typography.Text strong>¥{formatYuan(totals.previousTotalCents)}</Typography.Text>
        </Space>
      </Card>

      <Card title="按月度对比趋势" loading={monthlyQuery.isLoading}>
        <EChart option={monthlyLineOption as any} style={{ height: 420 }} />
      </Card>
    </div>
  );
}
