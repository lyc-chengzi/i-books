import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef } from 'react';

export function EChart({
  option,
  style,
  className
}: {
  option: EChartsOption;
  style?: CSSProperties;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const mergedStyle = useMemo<CSSProperties>(
    () => ({ width: '100%', height: 360, ...style }),
    [style]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={containerRef} className={className} style={mergedStyle} />;
}
