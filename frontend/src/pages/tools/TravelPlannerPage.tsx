import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Input, Select, Space, Typography, Badge } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import { api, getApiErrorMessage } from '../../lib/api';

import './travel-planner.css';

type DayPlan = {
  am?: string;
  pm?: string;
  isRestDay?: boolean;
};

type PlanMap = Record<string, DayPlan>;

function buildMonthCells(month: dayjs.Dayjs) {
  const first = month.startOf('month');
  const daysInMonth = month.daysInMonth();

  // dayjs().day(): 0=Sunday..6=Saturday; make Monday=0..Sunday=6
  const leading = (first.day() + 6) % 7;
  const total = leading + daysInMonth;
  const rows = Math.ceil(total / 7);
  const cells = rows * 7;

  return {
    leading,
    daysInMonth,
    rows,
    cells
  };
}

export function TravelPlannerPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const [viewMonth, setViewMonth] = useState(() => dayjs().startOf('month'));
  const [editingDateKey, setEditingDateKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<{ am: string; pm: string } | null>(null);
  const [plans, setPlans] = useState<PlanMap>({});
  const [isArranging, setIsArranging] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const year = viewMonth.year();
  const monthIndex = viewMonth.month(); // 0-11

  type MonthOut = {
    year: number;
    month: number;
    items: Array<{ date: string; is_rest_day: boolean; am: string | null; pm: string | null }>;
  };

  const { leading, daysInMonth, cells } = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);
  const trailing = useMemo(() => cells - (leading + daysInMonth), [cells, daysInMonth, leading]);
  const calendarStart = useMemo(
    () => viewMonth.startOf('month').subtract(leading, 'day'),
    [viewMonth, leading]
  );

  const currentWeekIndex = useMemo(() => {
    const today = dayjs().startOf('day');
    const diff = today.diff(calendarStart, 'day');
    if (diff < 0 || diff >= cells) return -1;
    return Math.floor(diff / 7);
  }, [calendarStart, cells]);

  const prevMonth = useMemo(() => viewMonth.subtract(1, 'month').startOf('month'), [viewMonth]);
  const nextMonth = useMemo(() => viewMonth.add(1, 'month').startOf('month'), [viewMonth]);

  const monthQuery = useQuery({
    queryKey: ['tools', 'travel-plans', year, monthIndex + 1],
    queryFn: () =>
      api.get<MonthOut>(`/tools/travel-plans?year=${year}&month=${monthIndex + 1}`, {
        token: auth.token
      })
  });

  const prevMonthQuery = useQuery({
    queryKey: ['tools', 'travel-plans', prevMonth.year(), prevMonth.month() + 1],
    queryFn: () =>
      api.get<MonthOut>(`/tools/travel-plans?year=${prevMonth.year()}&month=${prevMonth.month() + 1}`, {
        token: auth.token
      }),
    enabled: leading > 0
  });

  const nextMonthQuery = useQuery({
    queryKey: ['tools', 'travel-plans', nextMonth.year(), nextMonth.month() + 1],
    queryFn: () =>
      api.get<MonthOut>(`/tools/travel-plans?year=${nextMonth.year()}&month=${nextMonth.month() + 1}`, {
        token: auth.token
      }),
    enabled: trailing > 0
  });

  const upsertMutation = useMutation({
    mutationFn: (payload: { date: string; is_rest_day: boolean; am: string | null; pm: string | null }) =>
      api.put('/tools/travel-plans', payload, { token: auth.token }),
    onError: (err) => {
      // Keep UI responsive; show a concise message.
      // (The local state already updated, user can retry by editing again.)
      // eslint-disable-next-line no-console
      console.error(err);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tools', 'travel-plans', year, monthIndex + 1] });
    }
  });

  useEffect(() => {
    // Populate local cache from server when relevant months load.
    // This allows out-of-month dates (grey cells) to still display their plans.
    const items = [
      ...(prevMonthQuery.data?.items ?? []),
      ...(monthQuery.data?.items ?? []),
      ...(nextMonthQuery.data?.items ?? [])
    ];

    const next: PlanMap = {};
    for (const it of items) {
      next[it.date] = {
        isRestDay: !!it.is_rest_day,
        am: it.am ?? undefined,
        pm: it.pm ?? undefined
      };
    }
    setPlans(next);
    setEditingDateKey(null);
    setEditingDraft(null);
    // Only depends on data; viewMonth changes are reflected by query keys.
  }, [monthQuery.data, nextMonthQuery.data, prevMonthQuery.data]);

  const yearOptions = useMemo(() => {
    const now = dayjs().year();
    const start = now - 10;
    const end = now + 10;
    const options: Array<{ value: number; label: string }> = [];
    for (let y = start; y <= end; y++) {
      options.push({ value: y, label: `${y}年` });
    }
    return options;
  }, []);

  const title = `${year}年${monthIndex + 1}月`;

  const weekHeaders = ['一', '二', '三', '四', '五', '六', '日'];

  const startEditing = (dateKey: string) => {
    const current = plans[dateKey] ?? {};
    if (current.isRestDay) return;
    setEditingDateKey(dateKey);
    setEditingDraft({ am: current.am ?? '', pm: current.pm ?? '' });
  };

  const cancelEditing = () => {
    setEditingDateKey(null);
    setEditingDraft(null);
  };

  const commitEditing = () => {
    if (!editingDateKey || !editingDraft) return;
    const dateKey = editingDateKey;

    const nextPlan: DayPlan = {
      ...(plans[dateKey] ?? {}),
      isRestDay: false,
      am: editingDraft.am,
      pm: editingDraft.pm
    };

    setPlans((prev) => ({
      ...prev,
      [dateKey]: nextPlan
    }));

    const am = (nextPlan.am ?? '').trim() || null;
    const pm = (nextPlan.pm ?? '').trim() || null;
    upsertMutation.mutate({ date: dateKey, is_rest_day: false, am, pm });

    cancelEditing();
  };

  const toggleRestDay = (dateKey: string) => {
    cancelEditing();

    const current = plans[dateKey] ?? {};
    const nextIsRestDay = !current.isRestDay;
    const nextPlan: DayPlan = nextIsRestDay
      ? { isRestDay: true, am: undefined, pm: undefined }
      : { ...current, isRestDay: false };

    setPlans((prev) => ({
      ...prev,
      [dateKey]: nextPlan
    }));

    const am = nextIsRestDay ? null : (nextPlan.am ?? '').trim() || null;
    const pm = nextIsRestDay ? null : (nextPlan.pm ?? '').trim() || null;
    upsertMutation.mutate({ date: dateKey, is_rest_day: nextIsRestDay, am, pm });
  };

  const isBlank = (v: string | undefined) => !(v ?? '').trim();

  const handleOneClickArrange = async () => {
    if (isArranging) return;
    cancelEditing();
    setIsArranging(true);

    try {
      const days = viewMonth.daysInMonth();
      const changed: Array<{ dateKey: string; next: DayPlan }> = [];

      for (let dayNumber = 1; dayNumber <= days; dayNumber++) {
        const date = viewMonth.date(dayNumber);
        const dateKey = date.format('YYYY-MM-DD');
        const dow = date.day(); // 0=Sun..6=Sat

        const current = plans[dateKey] ?? {};
        const isRestDay = !!current.isRestDay;
        const hasAnyPlan = !isBlank(current.am) || !isBlank(current.pm);
        const isEmptyPlan = !hasAnyPlan;

        // Rule 1: set Sat/Sun as rest day by default (avoid overwriting existing plans)
        if ((dow === 0 || dow === 6) && !isRestDay && isEmptyPlan) {
          changed.push({ dateKey, next: { isRestDay: true, am: undefined, pm: undefined } });
          continue;
        }

        // Rule 2: for days with no plans and not rest day
        if (isRestDay || !isEmptyPlan) continue;

        let nextAm: string | undefined;
        let nextPm: string | undefined;

        if (dow === 1) {
          // Monday
          nextAm = '上班 6:51';
          nextPm = '回家 19:15';
        } else if (dow === 2) {
          // Tuesday
          nextAm = '上班 8:01';
        } else if (dow === 5) {
          // Friday
          nextPm = '回家 19:21';
        }

        if (nextAm || nextPm) {
          changed.push({ dateKey, next: { ...current, isRestDay: false, am: nextAm, pm: nextPm } });
        }
      }

      if (!changed.length) return;

      // Update local state immediately.
      setPlans((prev) => {
        const next = { ...prev };
        for (const it of changed) next[it.dateKey] = it.next;
        return next;
      });

      // Persist (sequentially, to keep server load predictable)
      for (const it of changed) {
        const is_rest_day = !!it.next.isRestDay;
        const am = is_rest_day ? null : (it.next.am ?? '').trim() || null;
        const pm = is_rest_day ? null : (it.next.pm ?? '').trim() || null;
        // Use direct API call (avoid invalidating per-row via mutation callbacks)
        await api.put('/tools/travel-plans', { date: it.dateKey, is_rest_day, am, pm }, { token: auth.token });
      }

      await queryClient.invalidateQueries({ queryKey: ['tools', 'travel-plans', year, monthIndex + 1] });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(getApiErrorMessage(err));
    } finally {
      setIsArranging(false);
    }
  };

  const handleClearArrange = async () => {
    if (isClearing) return;
    cancelEditing();
    setIsClearing(true);

    try {
      const days = viewMonth.daysInMonth();
      const toDelete: string[] = [];

      for (let dayNumber = 1; dayNumber <= days; dayNumber++) {
        const date = viewMonth.date(dayNumber);
        const dateKey = date.format('YYYY-MM-DD');
        const current = plans[dateKey];
        if (!current) continue;

        const hasAnyPlan = !isBlank(current.am) || !isBlank(current.pm);
        const isRestDay = !!current.isRestDay;
        if (hasAnyPlan || isRestDay) toDelete.push(dateKey);
      }

      if (!toDelete.length) return;

      setPlans((prev) => {
        const next = { ...prev };
        for (const k of toDelete) delete next[k];
        return next;
      });

      for (const dateKey of toDelete) {
        await api.put(
          '/tools/travel-plans',
          { date: dateKey, is_rest_day: false, am: null, pm: null },
          { token: auth.token }
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['tools', 'travel-plans', year, monthIndex + 1] });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(getApiErrorMessage(err));
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="travelPlanner">
      <div className="travelPlanner__header">
        <Space size={10} wrap>
          <Button type="primary" loading={isArranging} onClick={handleOneClickArrange}>
            一键安排
          </Button>

          <Button loading={isClearing} onClick={handleClearArrange}>
            取消安排
          </Button>

          <Button
            aria-label="上一月"
            icon={<LeftOutlined />}
            onClick={() => {
              setViewMonth((m) => m.subtract(1, 'month').startOf('month'));
              cancelEditing();
            }}
          />

          <Typography.Text strong className="travelPlanner__title">{title}</Typography.Text>

          <Button
            aria-label="下一月"
            icon={<RightOutlined />}
            onClick={() => {
              setViewMonth((m) => m.add(1, 'month').startOf('month'));
              cancelEditing();
            }}
          />

          <Select
            value={year}
            style={{ width: 120 }}
            options={yearOptions}
            onChange={(nextYear) => {
              setViewMonth((m) => m.year(nextYear).startOf('month'));
              cancelEditing();
            }}
          />
        </Space>
      </div>

      <div className="travelPlanner__calendar">
        <div className="travelPlanner__weekRow">
          {weekHeaders.map((w) => (
            <div key={w} className="travelPlanner__weekHeader">
              {w}
            </div>
          ))}
        </div>

        <div className="travelPlanner__dates">
          <div className="travelPlanner__datesGrid">
            {Array.from({ length: cells }).map((_, i) => {
              const date = calendarStart.add(i, 'day');
              const inMonth = date.month() === viewMonth.month() && date.year() === viewMonth.year();

              const dateKey = date.format('YYYY-MM-DD');
              const plan = plans[dateKey] ?? {};
              const isEditing = editingDateKey === dateKey;
              const isRestDay = !!plan.isRestDay;
              const isDisabled = !inMonth;
              const cellWeekIndex = Math.floor(i / 7);
              const isCurrentWeek = currentWeekIndex >= 0 && cellWeekIndex === currentWeekIndex;

              const dayNumber = date.date();

              const cell = (
                <div
                  key={dateKey}
                  className={`travelPlanner__cell${isRestDay ? ' travelPlanner__cell--rest' : ''}${
                    isDisabled ? ' travelPlanner__cell--outMonth' : ''
                  }${isCurrentWeek ? ' travelPlanner__cell--currentWeek' : ''}`}
                  onDoubleClick={() => {
                    if (isDisabled) return;
                    startEditing(dateKey);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (isDisabled) return;
                    toggleRestDay(dateKey);
                  }}
                >
                  <div className="travelPlanner__cellTop">
                    <Typography.Text strong>{dayNumber}</Typography.Text>
                    {isRestDay ? (
                      <Typography.Text type="secondary" className="travelPlanner__restLabel">
                        休息日
                      </Typography.Text>
                    ) : null}
                  </div>

                  {isEditing && !isDisabled ? (
                    <div className="travelPlanner__editor">
                      <Input
                        value={editingDraft?.am ?? ''}
                        placeholder="上午"
                        disabled={isRestDay}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEditingDraft((prev) => ({ am: value, pm: prev?.pm ?? '' }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditing();
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitEditing();
                          }
                        }}
                      />

                      <Input
                        value={editingDraft?.pm ?? ''}
                        placeholder="下午"
                        disabled={isRestDay}
                        onChange={(e) => {
                          const value = e.target.value;
                          setEditingDraft((prev) => ({ am: prev?.am ?? '', pm: value }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditing();
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitEditing();
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="travelPlanner__summary">
                      {isRestDay ? (
                        <Typography.Text type="secondary" className="travelPlanner__restText">
                          休息日
                        </Typography.Text>
                      ) : (
                        <>
                          <div className="travelPlanner__summaryRow">
                            <Typography.Text type="secondary">上午</Typography.Text>
                            <Typography.Text className="travelPlanner__summaryText travelPlanner__summaryText--am">
                              {plan.am || '-'}
                            </Typography.Text>
                          </div>
                          <div className="travelPlanner__summaryRow">
                            <Typography.Text type="secondary">下午</Typography.Text>
                            <Typography.Text className="travelPlanner__summaryText travelPlanner__summaryText--pm">
                              {plan.pm || '-'}
                            </Typography.Text>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );

              // Show ribbon only on Mondays of the current week and place it on the right.
              const isMonday = date.day() === 1;
              if (isCurrentWeek && isMonday) {
                return (
                  <Badge.Ribbon text="本周" key={dateKey} placement="end">
                    {cell}
                  </Badge.Ribbon>
                );
              }

              return cell;
            })}
          </div>
        </div>
      </div>

      <Typography.Text type="secondary" className="travelPlanner__hint">
        双击某一天，填写上午/下午行程（按 ESC 退出编辑）；右键切换休息日
      </Typography.Text>
    </div>
  );
}
