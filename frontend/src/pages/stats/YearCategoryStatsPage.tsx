import { useQuery } from '@tanstack/react-query';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Radio, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';
import { EChart } from '../../components/EChart';
import type { CategoryNode } from '../../components/CategoryLeafSelect';
import { buildCategoryPathMap, formatYuan, getLeafName } from './statsUtils';

type StatsOut = {
  year: number;
  type: 'income' | 'expense';
  totalCents: number;
  breakdown: Array<{ categoryId: number; amountCents: number }>;
  monthlyTotals: Array<{ month: string; amountCents: number }>;
};

type MonthStatsOut = {
  month: string;
  type: 'income' | 'expense';
  totalCents: number;
  breakdown: Array<{ categoryId: number; amountCents: number }>;
};

export function YearCategoryStatsPage() {
  const auth = useAuth();

  const [year, setYear] = useState<number>(dayjs().year());
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [drillMonth, setDrillMonth] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categoriesTree', type],
    queryFn: () => api.get<CategoryNode[]>(`/config/categories/tree?type=${type}`, { token: auth.token })
  });

  const statsQuery = useQuery({
    queryKey: ['stats', 'year-category', year, type],
    queryFn: () => api.get<StatsOut>(`/stats/year-category?year=${year}&type=${type}`, { token: auth.token })
  });

  const monthStatsQuery = useQuery({
    queryKey: ['stats', 'month-category', drillMonth, type],
    queryFn: () => api.get<MonthStatsOut>(`/stats/month-category?month=${encodeURIComponent(drillMonth ?? '')}&type=${type}`, { token: auth.token }),
    enabled: !!drillMonth
  });

  const pathMap = useMemo(() => buildCategoryPathMap(categoriesQuery.data ?? []), [categoriesQuery.data]);

  const breakdownSorted = useMemo(() => {
    const items = (statsQuery.data?.breakdown ?? [])
      .map((x) => ({
        categoryId: x.categoryId,
        amountCents: x.amountCents,
        path: pathMap.get(x.categoryId) ?? `#${x.categoryId}`
      }))
      .filter((x) => x.amountCents > 0);

    items.sort((a, b) => b.amountCents - a.amountCents);
    return items;
  }, [pathMap, statsQuery.data?.breakdown]);

  const pieData = useMemo(() => {
    const topN = 10;
    const top = breakdownSorted.slice(0, topN);
    const rest = breakdownSorted.slice(topN);
    const restSum = rest.reduce((acc, x) => acc + x.amountCents, 0);
    const out = top.map((x) => ({ name: getLeafName(x.path), value: x.amountCents, full: x.path }));
    if (restSum > 0) out.push({ name: '其他', value: restSum, full: '其他' });
    return out;
  }, [breakdownSorted]);

  const months = useMemo(() => {
    const byMonth = new Map((statsQuery.data?.monthlyTotals ?? []).map((x) => [x.month, x.amountCents] as const));
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const key = `${year}-${String(m).padStart(2, '0')}`;
      return { month: key, amountCents: byMonth.get(key) ?? 0 };
    });
  }, [statsQuery.data?.monthlyTotals, year]);

  const pieOption = useMemo(
    () => ({
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
          data: pieData
        }
      ]
    }),
    [pieData]
  );

  const lineOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 18, top: 24, bottom: 32 },
      xAxis: {
        type: 'category',
        data: months.map((x) => x.month),
        axisLabel: {
          formatter: (v: string) => v.slice(5)
        }
      },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${v}` } },
      series: [
        {
          name: '月度合计',
          type: 'line',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.12 },
          data: months.map((x) => Number((x.amountCents / 100).toFixed(2)))
        }
      ]
    }),
    [months]
  );

  const monthBreakdownSorted = useMemo(() => {
    const items = (monthStatsQuery.data?.breakdown ?? [])
      .map((x) => ({
        categoryId: x.categoryId,
        amountCents: x.amountCents,
        path: pathMap.get(x.categoryId) ?? `#${x.categoryId}`
      }))
      .filter((x) => x.amountCents > 0);
    items.sort((a, b) => b.amountCents - a.amountCents);
    return items;
  }, [monthStatsQuery.data?.breakdown, pathMap]);

  const monthPieData = useMemo(() => {
    const topN = 12;
    const top = monthBreakdownSorted.slice(0, topN);
    const rest = monthBreakdownSorted.slice(topN);
    const restSum = rest.reduce((acc, x) => acc + x.amountCents, 0);
    const out = top.map((x) => ({ name: getLeafName(x.path), value: x.amountCents, full: x.path }));
    if (restSum > 0) out.push({ name: '其他', value: restSum, full: '其他' });
    return out;
  }, [monthBreakdownSorted]);

  const monthPieOption = useMemo(
    () => ({
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
          data: monthPieData
        }
      ]
    }),
    [monthPieData]
  );

  const handleLineClick = (params: unknown) => {
    const anyP = params as any;
    const monthName: string | undefined = typeof anyP?.name === 'string' ? anyP.name : undefined;
    if (!monthName) return;
    if (!/^\d{4}-\d{2}$/.test(monthName)) return;
    setDrillMonth(monthName);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card
        title="年度统计"
        extra={
          <Space size={12} align="center">
            <DatePicker
              picker="year"
              value={dayjs(`${year}-01-01`)}
              onChange={(v: Dayjs | null) => {
                setYear(v ? v.year() : dayjs().year());
                setDrillMonth(null);
              }}
              allowClear={false}
            />
            <Radio.Group
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setDrillMonth(null);
              }}
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
                statsQuery.refetch();
                categoriesQuery.refetch();
              }}
              loading={statsQuery.isFetching || categoriesQuery.isFetching}
            />
          </Space>
        }
      >
        <Space size={12} wrap>
          <Typography.Text type="secondary">总计</Typography.Text>
          <Typography.Text strong>¥{formatYuan(statsQuery.data?.totalCents ?? 0)}</Typography.Text>
        </Space>
      </Card>

      <div className="statsGridTwo">
        <Card title="费用项目分布" loading={statsQuery.isLoading || categoriesQuery.isLoading}>
          <EChart option={pieOption as any} style={{ height: 420 }} />
        </Card>

        <Card
          title={drillMonth ? `${drillMonth} 费用项目` : '月度趋势'}
          loading={drillMonth ? monthStatsQuery.isLoading : statsQuery.isLoading}
          extra={
            drillMonth ? (
              <Button onClick={() => setDrillMonth(null)} type="link">
                返回
              </Button>
            ) : null
          }
        >
          {drillMonth ? (
            <>
              <Space size={12} wrap style={{ marginBottom: 8 }}>
                <Typography.Text type="secondary">月合计</Typography.Text>
                <Typography.Text strong>¥{formatYuan(monthStatsQuery.data?.totalCents ?? 0)}</Typography.Text>
              </Space>
              <EChart option={monthPieOption as any} style={{ height: 420 }} />
            </>
          ) : (
            <EChart option={lineOption as any} style={{ height: 420 }} onClick={handleLineClick} />
          )}
        </Card>
      </div>
    </div>
  );
}
