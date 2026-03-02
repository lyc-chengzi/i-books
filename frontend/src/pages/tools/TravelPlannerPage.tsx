import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Input, Select, Space, Typography } from 'antd';
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
  const [plans, setPlans] = useState<PlanMap>({});
  const [isArranging, setIsArranging] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const saveTimersRef = useRef<Record<string, number>>({});

  const year = viewMonth.year();
  const monthIndex = viewMonth.month(); // 0-11

  type MonthOut = {
    year: number;
    month: number;
    items: Array<{ date: string; is_rest_day: boolean; am: string | null; pm: string | null }>;
  };

  const monthQuery = useQuery({
    queryKey: ['tools', 'travel-plans', year, monthIndex + 1],
    queryFn: () =>
      api.get<MonthOut>(`/tools/travel-plans?year=${year}&month=${monthIndex + 1}`, {
        token: auth.token
      })
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
    // Populate local cache from server when month loads.
    const items = monthQuery.data?.items ?? [];
    const next: PlanMap = {};
    for (const it of items) {
      next[it.date] = {
        isRestDay: !!it.is_rest_day,
        am: it.am ?? undefined,
        pm: it.pm ?? undefined
      };
    }
    setPlans(next);
    // Only depends on data; viewMonth changes are reflected by query key.
  }, [monthQuery.data]);

  useEffect(() => {
    return () => {
      // Clear debounced timers on unmount
      for (const k of Object.keys(saveTimersRef.current)) {
        window.clearTimeout(saveTimersRef.current[k]);
      }
      saveTimersRef.current = {};
    };
  }, []);

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

  const { leading, daysInMonth, cells } = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);

  const title = `${year}年${monthIndex + 1}月`;

  const weekHeaders = ['一', '二', '三', '四', '五', '六', '日'];

  const scheduleSave = (dateKey: string, nextPlan: DayPlan) => {
    const isRestDay = !!nextPlan.isRestDay;
    const am = isRestDay ? null : (nextPlan.am ?? '').trim() || null;
    const pm = isRestDay ? null : (nextPlan.pm ?? '').trim() || null;

    const existingTimer = saveTimersRef.current[dateKey];
    if (existingTimer) window.clearTimeout(existingTimer);

    saveTimersRef.current[dateKey] = window.setTimeout(() => {
      upsertMutation.mutate({ date: dateKey, is_rest_day: isRestDay, am, pm });
      delete saveTimersRef.current[dateKey];
    }, 500);
  };

  const flushSave = (dateKey: string) => {
    const pending = saveTimersRef.current[dateKey];
    if (pending) {
      window.clearTimeout(pending);
      delete saveTimersRef.current[dateKey];
    }

    const plan = plans[dateKey] ?? {};
    const isRestDay = !!plan.isRestDay;
    const am = isRestDay ? null : (plan.am ?? '').trim() || null;
    const pm = isRestDay ? null : (plan.pm ?? '').trim() || null;
    upsertMutation.mutate({ date: dateKey, is_rest_day: isRestDay, am, pm });
  };

  const toggleRestDay = (dateKey: string) => {
    setEditingDateKey(null);

    const current = plans[dateKey] ?? {};
    const nextIsRestDay = !current.isRestDay;
    const nextPlan: DayPlan = nextIsRestDay
      ? { isRestDay: true, am: undefined, pm: undefined }
      : { ...current, isRestDay: false };

    setPlans((prev) => ({
      ...prev,
      [dateKey]: nextPlan
    }));

    // Persist immediately (not debounced) to keep the right-click action predictable.
    const pending = saveTimersRef.current[dateKey];
    if (pending) {
      window.clearTimeout(pending);
      delete saveTimersRef.current[dateKey];
    }

    const am = nextIsRestDay ? null : (nextPlan.am ?? '').trim() || null;
    const pm = nextIsRestDay ? null : (nextPlan.pm ?? '').trim() || null;
    upsertMutation.mutate({ date: dateKey, is_rest_day: nextIsRestDay, am, pm });
  };

  const isBlank = (v: string | undefined) => !(v ?? '').trim();

  const handleOneClickArrange = async () => {
    if (isArranging) return;
    setEditingDateKey(null);
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
          nextAm = '上班';
          nextPm = '回家';
        } else if (dow === 2) {
          // Tuesday
          nextAm = '上班';
        } else if (dow === 5) {
          // Friday
          nextPm = '回家';
        }

        if (nextAm || nextPm) {
          changed.push({ dateKey, next: { ...current, isRestDay: false, am: nextAm, pm: nextPm } });
        }
      }

      if (!changed.length) return;

      // Cancel pending debounced saves for affected dates.
      for (const it of changed) {
        const pending = saveTimersRef.current[it.dateKey];
        if (pending) {
          window.clearTimeout(pending);
          delete saveTimersRef.current[it.dateKey];
        }
      }

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
    setEditingDateKey(null);
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

      for (const dateKey of toDelete) {
        const pending = saveTimersRef.current[dateKey];
        if (pending) {
          window.clearTimeout(pending);
          delete saveTimersRef.current[dateKey];
        }
      }

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
              setEditingDateKey(null);
            }}
          />

          <Typography.Text strong>{title}</Typography.Text>

          <Button
            aria-label="下一月"
            icon={<RightOutlined />}
            onClick={() => {
              setViewMonth((m) => m.add(1, 'month').startOf('month'));
              setEditingDateKey(null);
            }}
          />

          <Select
            value={year}
            style={{ width: 120 }}
            options={yearOptions}
            onChange={(nextYear) => {
              setViewMonth((m) => m.year(nextYear).startOf('month'));
              setEditingDateKey(null);
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
              const dayNumber = i - leading + 1;
              const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

              if (!inMonth) {
                return <div key={i} className="travelPlanner__cell travelPlanner__cell--empty" />;
              }

              const date = viewMonth.date(dayNumber);
              const dateKey = date.format('YYYY-MM-DD');
              const plan = plans[dateKey] ?? {};
              const isEditing = editingDateKey === dateKey;
              const isRestDay = !!plan.isRestDay;

              return (
                <div
                  key={dateKey}
                  className={`travelPlanner__cell${isRestDay ? ' travelPlanner__cell--rest' : ''}`}
                  onDoubleClick={() => {
                    if (!isRestDay) setEditingDateKey(dateKey);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
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

                  {isEditing ? (
                    <div className="travelPlanner__editor">
                      <Input
                        value={plan.am ?? ''}
                        placeholder="上午"
                        disabled={isRestDay}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPlans((prev) => ({
                            ...prev,
                            [dateKey]: {
                              ...prev[dateKey],
                              am: value
                            }
                          }));
                          scheduleSave(dateKey, { ...plan, am: value, isRestDay });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape' || e.key === 'Enter') {
                            e.preventDefault();
                            flushSave(dateKey);
                            setEditingDateKey(null);
                          }
                        }}
                        onBlur={() => flushSave(dateKey)}
                      />

                      <Input
                        value={plan.pm ?? ''}
                        placeholder="下午"
                        disabled={isRestDay}
                        onChange={(e) => {
                          const value = e.target.value;
                          setPlans((prev) => ({
                            ...prev,
                            [dateKey]: {
                              ...prev[dateKey],
                              pm: value
                            }
                          }));
                          scheduleSave(dateKey, { ...plan, pm: value, isRestDay });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape' || e.key === 'Enter') {
                            e.preventDefault();
                            flushSave(dateKey);
                            setEditingDateKey(null);
                          }
                        }}
                        onBlur={() => flushSave(dateKey)}
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
