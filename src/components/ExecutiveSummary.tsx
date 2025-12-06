// src/components/ExecutiveSummary.tsx
import React, { useMemo, useState } from 'react';
import type { Lang, Scope } from '../App';
import type { PlatformKpi, SalesRow } from '../hooks/useDashboardData';

type Kpi = {
  current: number;
  previous: number | null;
  mom: number | null;
};

type RegionalKpi = {
  region: string; // BC / CA / ON
  current: number;
  previous: number | null;
  mom: number | null;
};

type Props = {
  language: Lang;
  selectedRegion: Scope;
  selectedMonth: string;
  currentMonth: string | null;
  prevMonth: string | null;
  revenueKpi: Kpi;
  ordersKpi: Kpi;
  aovKpi: Kpi;
  regionalRevenueKpis?: RegionalKpi[];
  regionalOrdersKpis?: RegionalKpi[];
  regionalAovKpis?: RegionalKpi[];

  // 先保留（目前計算已不用它們）
  platformRevenueKpis?: PlatformKpi[];
  platformOrdersKpis?: PlatformKpi[];
  platformAovKpis?: PlatformKpi[];

  // 任意時間區間計算用
  allMonths: string[];
  rawRows: SalesRow[];
};

type MetricKey = 'revenue' | 'orders' | 'aov';

type BreakdownRow = {
  key: string; // Platform
  current: number;
  share: number | null;
  previous: number | null;
  mom: number | null;
  yoy: number | null; // 保留計算，但目前不顯示
};

type SortKey = 'current' | 'share' | 'previous' | 'mom';
type SortDir = 'asc' | 'desc';

type TrendPoint = { month: string; value: number };
type TrendSeries = { platform: string; points: TrendPoint[] };

type PlatformTrendChartProps = {
  series: TrendSeries[];
  months: string[];
  monthLabelFn: (iso: string | null) => string;
  valueFormatter: (v: number | null | undefined) => string;
  isZh: boolean;
};

// ========= formatter =========
const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return '—';
  return `$${Math.round(value).toLocaleString()}`;
};

const formatNumber = (value: number | null | undefined) => {
  if (value == null) return '—';
  return value.toLocaleString();
};

const formatAov = (value: number | null | undefined) => {
  if (value == null) return '—';
  return `$${value.toFixed(1)}`;
};

const formatPercent = (value: number | null | undefined) => {
  if (value == null) return '—';
  const pct = (value * 100).toFixed(1);
  return `${pct.replace(/\.0$/, '')}%`;
};

const getDeltaClass = (value: number | null | undefined) => {
  if (value == null) return '';
  if (value > 0) return 'kpi-pos';
  if (value < 0) return 'kpi-neg';
  return '';
};

const PlatformTrendChart: React.FC<PlatformTrendChartProps> = ({
  series,
  months,
  monthLabelFn,
  valueFormatter,
  isZh,
}) => {
  if (!months.length || !series.length) {
    return (
      <div className="platform-trend-empty">
        {isZh ? '暫無趨勢數據。' : 'No trend data for this period.'}
      </div>
    );
  }

  const flatValues = series.flatMap((s) => s.points.map((p) => p.value));
  const maxValue = Math.max(...flatValues, 0);

  if (maxValue <= 0) {
    return (
      <div className="platform-trend-empty">
        {isZh ? '暫無趨勢數據。' : 'No trend data for this period.'}
      </div>
    );
  }

  const width = 420;
  const height = 220;
  const margin = { top: 16, right: 16, bottom: 40, left: 40 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const xStep =
    months.length > 1 ? chartWidth / (months.length - 1) : chartWidth / 2;

  const getX = (idx: number) =>
    margin.left + (months.length === 1 ? chartWidth / 2 : xStep * idx);

  const getY = (value: number) => {
    if (maxValue === 0) return margin.top + chartHeight;
    const ratio = value / maxValue;
    return margin.top + chartHeight - ratio * chartHeight;
  };

  const COLORS = ['#4C9DFF', '#6EE7B7', '#F97373', '#FBBF24'];

  const formatShort = (v: number) => {
    const raw = valueFormatter(v); // 可能是 $12,345 或 12,345

    // 先抓出數字部分
    const numeric = Number(
      String(raw).replace(/[^0-9.-]/g, ''),
    );
    const num = Number.isNaN(numeric) ? Math.abs(v) : Math.abs(numeric);

    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (num >= 10_000) {
      return `${(num / 1000).toFixed(0)}k`;
    }
    return raw;
  };

  return (
    <div className="platform-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {/* Y 軸 */}
        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={margin.top + chartHeight}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />
        {/* X 軸 */}
        <line
          x1={margin.left}
          y1={margin.top + chartHeight}
          x2={margin.left + chartWidth}
          y2={margin.top + chartHeight}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />

        {/* 橫向 grid 線（3 條） */}
        {[0.33, 0.66, 1].map((r) => {
          const y = margin.top + chartHeight - r * chartHeight;
          return (
            <line
              key={r}
              x1={margin.left}
              y1={y}
              x2={margin.left + chartWidth}
              y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          );
        })}

        {/* X 軸月份標籤 */}
        {months.map((m, idx) => {
          const x = getX(idx);
          const y = margin.top + chartHeight + 20;
          return (
            <text
              key={m}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={11}
              fill="rgba(255,255,255,0.5)"
            >
              {monthLabelFn(m)}
            </text>
          );
        })}

        {/* 線條 + 點 + 數字 */}
        {series.map((s, si) => {
          const color = COLORS[si % COLORS.length];

          const pathD = s.points
            .map((p, idx) => {
              const x = getX(idx);
              const y = getY(p.value);
              return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .join(' ');

          return (
            <g key={s.platform}>
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
              />
              {s.points.map((p, idx) => {
                const x = getX(idx);
                const y = getY(p.value);
                return (
                  <g key={idx}>
                    <circle
                      cx={x}
                      cy={y}
                      r={3.5}
                      fill={color}
                      stroke="#020617"
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={y - 10}
                      textAnchor="middle"
                      fontSize={11}
                      fill={color}
                    >
                      {formatShort(p.value)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="platform-trend-legend">
        {series.map((s, si) => {
          const color = COLORS[si % COLORS.length];
          return (
            <div key={s.platform} className="platform-trend-legend-item">
              <span
                className="platform-trend-legend-dot"
                style={{ backgroundColor: color }}
              />
              <span>{s.platform}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ExecutiveSummary: React.FC<Props> = ({
  language,
  selectedRegion,
  selectedMonth,
  currentMonth,
  prevMonth,
  revenueKpi,
  ordersKpi,
  aovKpi,
  regionalRevenueKpis,
  regionalOrdersKpis,
  regionalAovKpis,
  allMonths,
  rawRows,
}) => {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('revenue');
  const [sortKey, setSortKey] = useState<SortKey>('current');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const isZh = language === 'zh';
  const isOverview = false;

  const monthLabel = (iso: string | null) => {
    if (!iso) return '—';
    const short = iso.slice(0, 7); // "YYYY-MM"
    const [year, month] = short.split('-');
    const mNum = Number(month);
    if (!year || !mNum || Number.isNaN(mNum)) return short;

    if (isZh) {
      return `${year}年${month}月`;
    }

    const MONTHS = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${MONTHS[mNum - 1]} ${year}`;
  };

  // ========= 原 regional arrays（現在主要用在空資料 fallback） =========
  const revenueRegions = regionalRevenueKpis || [];
  const ordersRegions = regionalOrdersKpis || [];
  const aovRegions = regionalAovKpis || [];

  const selectedIndex = useMemo(
    () => allMonths.findIndex((m) => m === selectedMonth),
    [allMonths, selectedMonth],
  );

  const prevMonthSelection = useMemo(() => {
    if (selectedIndex <= 0) return null;
    return allMonths[selectedIndex - 1];
  }, [allMonths, selectedIndex]);

  const yoyMonthSelection = useMemo(() => {
    if (selectedIndex < 12) return null;
    return allMonths[selectedIndex - 12];
  }, [allMonths, selectedIndex]);

  const periodMonths = useMemo(() => {
    if (selectedIndex === -1) return [] as string[];
    const start = Math.max(0, selectedIndex - 2);
    return allMonths.slice(start, selectedIndex + 1);
  }, [allMonths, selectedIndex]);

  const prevMonths = useMemo(
    () => (prevMonthSelection ? [prevMonthSelection] : []),
    [prevMonthSelection],
  );

  const yoyMonths = useMemo(
    () => (yoyMonthSelection ? [yoyMonthSelection] : []),
    [yoyMonthSelection],
  );

  const periodInfo = useMemo(
    () => ({
      currentLabel: monthLabel(selectedMonth),
      previousLabel: prevMonthSelection
        ? monthLabel(prevMonthSelection)
        : isZh
        ? '無前期'
        : 'No prev month',
      momTitle: 'MoM',
      yoyTitle: 'YoY',
    }),
    [isZh, prevMonthSelection, selectedMonth],
  );

  // ========= 加總工具 =========
  const sumForMonths = (
    months: string[],
    predicate: (row: SalesRow) => boolean,
  ) => {
    if (!months.length) return { revenue: 0, orders: 0 };
    const set = new Set(months);
    let revenue = 0;
    let orders = 0;
    for (const r of rawRows) {
      if (!set.has(r.month)) continue;
      if (!predicate(r)) continue;
      revenue += Number(r.revenue) || 0;
      orders += Number(r.orders) || 0;
    }
    return { revenue, orders };
  };

  // ========= 上方 KPI（總營收 / 總訂單 / Global AOV） =========
  const cardKpis = useMemo(() => {
    if (!selectedMonth) {
      return {
        revenue: revenueKpi,
        orders: ordersKpi,
        aov: aovKpi,
      };
    }

    const scopeFilter = (row: SalesRow) => row.region === selectedRegion;

    const currAgg = sumForMonths(periodMonths, scopeFilter);
    const prevAgg = sumForMonths(prevMonths, scopeFilter);

    const currAov =
      currAgg.orders > 0 ? currAgg.revenue / currAgg.orders : 0;
    const prevAov =
      prevAgg.orders > 0 ? prevAgg.revenue / prevAgg.orders : 0;

    const makeKpi = (curr: number, prev: number) => ({
      current: curr,
      previous: prev,
      mom: !prev || prev === 0 ? null : (curr - prev) / prev,
    });

    return {
      revenue: makeKpi(currAgg.revenue, prevAgg.revenue),
      orders: makeKpi(currAgg.orders, prevAgg.orders),
      aov: makeKpi(currAov, prevAov),
    };
  }, [
    aovKpi,
    selectedRegion,
    selectedMonth,
    ordersKpi,
    periodMonths,
    prevMonths,
    revenueKpi,
    rawRows,
  ]);

  // ========= 下方表格（Platform breakdown） =========
  const breakdownRows: BreakdownRow[] = useMemo(() => {
    if (!periodMonths.length) return [];

    const groups = Array.from(
      new Set(
        rawRows
          .filter((r) => r.region === selectedRegion)
          .map((r) => r.platform),
      ),
    ).sort();

    const rows: BreakdownRow[] = [];

    for (const key of groups) {
      const filterFn = (row: SalesRow) =>
        row.region === selectedRegion && row.platform === key;

      const currAgg = sumForMonths(periodMonths, filterFn);
      const prevAgg = sumForMonths(prevMonths, filterFn);
      const yoyAgg = sumForMonths(yoyMonths, filterFn);

      const pickMetric = (agg: { revenue: number; orders: number }) => {
        if (activeMetric === 'revenue') return agg.revenue;
        if (activeMetric === 'orders') return agg.orders;
        return agg.orders > 0 ? agg.revenue / agg.orders : 0;
      };

      const currVal = pickMetric(currAgg);
      const prevVal = prevMonths.length ? pickMetric(prevAgg) : null;
      const yoyVal = yoyMonths.length ? pickMetric(yoyAgg) : null;

      const mom =
        prevVal == null || prevVal === 0
          ? null
          : (currVal - prevVal) / prevVal;

      const yoy =
        yoyVal == null || yoyVal === 0
          ? null
          : (currVal - yoyVal) / yoyVal;

      rows.push({
        key,
        current: currVal,
        share: null, // 先佔位，下面統一算
        previous: prevVal,
        mom,
        yoy,
      });
    }

    const totalCurrent = rows.reduce((sum, row) => sum + row.current, 0);

    if (totalCurrent <= 0) {
      return rows.map((row) => ({ ...row, share: null }));
    }

    return rows.map((row) => ({
      ...row,
      share: row.current / totalCurrent,
    }));
  }, [
    activeMetric,
    periodMonths,
    prevMonths,
    yoyMonths,
    rawRows,
    selectedRegion,
  ]);

  // ========= 近三個月各平台趨勢 =========
  const platformTrendSeries: TrendSeries[] = useMemo(() => {
    if (!periodMonths.length) return [];

    const monthsSet = new Set(periodMonths);

    const platforms = Array.from(
      new Set(
        rawRows
          .filter(
            (r) => r.region === selectedRegion && monthsSet.has(r.month),
          )
          .map((r) => r.platform),
      ),
    ).sort();

    if (!platforms.length) return [];

    const pickMetric = (agg: { revenue: number; orders: number }) => {
      if (activeMetric === 'revenue') return agg.revenue;
      if (activeMetric === 'orders') return agg.orders;
      return agg.orders > 0 ? agg.revenue / agg.orders : 0;
    };

    const series: TrendSeries[] = platforms.map((platform) => {
      const points: TrendPoint[] = periodMonths.map((month) => {
        let revenue = 0;
        let orders = 0;
        for (const r of rawRows) {
          if (
            r.region === selectedRegion &&
            r.platform === platform &&
            r.month === month
          ) {
            revenue += Number(r.revenue) || 0;
            orders += Number(r.orders) || 0;
          }
        }
        const value = pickMetric({ revenue, orders });
        return { month, value };
      });

      return { platform, points };
    });

    const maxVal = Math.max(
      ...series.flatMap((s) => s.points.map((p) => p.value)),
      0,
    );
    if (maxVal <= 0) return [];

    return series;
  }, [activeMetric, periodMonths, rawRows, selectedRegion]);

  // 排序後的 rows
  const sortedBreakdownRows = useMemo(() => {
    const rows = [...breakdownRows];

    const dirFactor = sortDir === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];

      if (va == null && vb == null) return 0;
      if (va == null) return 1; // null 一律排在後面
      if (vb == null) return -1;

      if (va === vb) return 0;
      return va > vb ? dirFactor : -dirFactor;
    });

    return rows;
  }, [breakdownRows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc'); // 預設新欄位先用 desc
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return (
        <span
          style={{
            marginLeft: 4,
            opacity: 0.3,
            fontSize: 10,
          }}
        >
          ↕
        </span>
      );
    }
    return (
      <span
        style={{
          marginLeft: 4,
          fontSize: 10,
        }}
      >
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  // ========= 文案 + formatter =========
  const metricConfig: Record<
    MetricKey,
    {
      labelEn: string;
      labelZh: string;
      formatter: (v: number | null | undefined) => string;
    }
  > = {
    revenue: {
      labelEn: 'Total Revenue',
      labelZh: '總營收',
      formatter: formatCurrency,
    },
    orders: {
      labelEn: 'Total Orders',
      labelZh: '總訂單數',
      formatter: formatNumber,
    },
    aov: {
      labelEn: 'Global AOV',
      labelZh: '整體客單價',
      formatter: formatAov,
    },
  };

  const activeFormatter = metricConfig[activeMetric].formatter;

  const platformTitleMap: Record<MetricKey, { en: string; zh: string }> = {
    revenue: {
      en: 'Platform breakdown — Total revenue',
      zh: '平台拆分 — 總營收',
    },
    orders: {
      en: 'Platform breakdown — Total orders',
      zh: '平台拆分 — 訂單數',
    },
    aov: {
      en: 'Platform breakdown — Global AOV',
      zh: '平台拆分 — 客單價',
    },
  };

  const firstColumnLabel = isZh ? '平台' : 'Platform';

  const cardTitle = isZh
    ? platformTitleMap[activeMetric].zh
    : platformTitleMap[activeMetric].en;

  const effectiveRevenueKpi = cardKpis.revenue;
  const effectiveOrdersKpi = cardKpis.orders;
  const effectiveAovKpi = cardKpis.aov;

  return (
    <div className="exec-wrapper">
      {/* ===== 上方 bar：顯示目前範圍 ===== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="scope-pill scope-pill-active">{selectedRegion}</span>
          <span className="scope-pill">{periodInfo.currentLabel}</span>
          {prevMonthSelection && (
            <span className="scope-pill" style={{ opacity: 0.9 }}>
              {isZh ? '對比 ' : 'vs '} {monthLabel(prevMonthSelection)}
            </span>
          )}
        </div>
      </div>

      {/* ===== KPI Row ===== */}
      <div className="kpi-grid">
        {/* Revenue */}
        <div className="kpi-card" onClick={() => setActiveMetric('revenue')}>
          <div className="kpi-title">
            {isZh
              ? metricConfig.revenue.labelZh
              : metricConfig.revenue.labelEn}
          </div>
          <div className="kpi-value">
            {formatCurrency(effectiveRevenueKpi.current)}
          </div>
          <div className="kpi-sub">
            {isZh ? '對比' : 'vs'} {periodInfo.previousLabel}
            {' · '}
            <span className={getDeltaClass(effectiveRevenueKpi.mom)}>
              {formatPercent(effectiveRevenueKpi.mom)}
            </span>
          </div>
        </div>

        {/* Orders */}
        <div className="kpi-card" onClick={() => setActiveMetric('orders')}>
          <div className="kpi-title">
            {isZh
              ? metricConfig.orders.labelZh
              : metricConfig.orders.labelEn}
          </div>
          <div className="kpi-value">
            {formatNumber(effectiveOrdersKpi.current)}
          </div>
          <div className="kpi-sub">
            {isZh ? '對比' : 'vs'} {periodInfo.previousLabel}
            {' · '}
            <span className={getDeltaClass(effectiveOrdersKpi.mom)}>
              {formatPercent(effectiveOrdersKpi.mom)}
            </span>
          </div>
        </div>

        {/* AOV */}
        <div className="kpi-card" onClick={() => setActiveMetric('aov')}>
          <div className="kpi-title">
            {isZh ? metricConfig.aov.labelZh : metricConfig.aov.labelEn}
          </div>
          <div className="kpi-value">
            {formatAov(effectiveAovKpi.current)}
          </div>
          <div className="kpi-sub">
            {isZh ? '對比' : 'vs'} {periodInfo.previousLabel}
            {' · '}
            <span className={getDeltaClass(effectiveAovKpi.mom)}>
              {formatPercent(effectiveAovKpi.mom)}
            </span>
          </div>
        </div>
      </div>

      {/* ===== Platform Breakdown ===== */}
      <div className="region-card">
        <div className="region-header">
          <div>
            <div className="region-title">{cardTitle}</div>
            <div className="region-subtitle">
              {`${isZh ? '當月：' : 'Current: '} ${
                periodInfo.currentLabel
              } · ${isZh ? '前一月：' : 'Prev: '} ${
                periodInfo.previousLabel
              } · ${isZh ? '區域：' : 'Region: '} ${selectedRegion}`}
            </div>
          </div>

          <div className="metric-tabs">
            <button
              className={
                'metric-tab' +
                (activeMetric === 'revenue' ? ' metric-tab-active' : '')
              }
              onClick={() => setActiveMetric('revenue')}
            >
              {isZh ? '營收' : 'Revenue'}
            </button>
            <button
              className={
                'metric-tab' +
                (activeMetric === 'orders' ? ' metric-tab-active' : '')
              }
              onClick={() => setActiveMetric('orders')}
            >
              {isZh ? '訂單' : 'Orders'}
            </button>
            <button
              className={
                'metric-tab' +
                (activeMetric === 'aov' ? ' metric-tab-active' : '')
              }
              onClick={() => setActiveMetric('aov')}
            >
              {isZh ? '客單價' : 'AOV'}
            </button>
          </div>
        </div>

        <div className="region-table-wrapper">
          <table className="region-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>{firstColumnLabel}</th>

                <th style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => handleSort('current')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {periodInfo.currentLabel}
                    {renderSortIcon('current')}
                  </button>
                </th>

                <th style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => handleSort('share')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {isZh
                      ? `${periodInfo.currentLabel} 平台占比`
                      : `${periodInfo.currentLabel} share`}
                    {renderSortIcon('share')}
                  </button>
                </th>

                <th style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => handleSort('previous')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {periodInfo.previousLabel}
                    {renderSortIcon('previous')}
                  </button>
                </th>

                <th style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => handleSort('mom')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {periodInfo.momTitle}
                    {renderSortIcon('mom')}
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {sortedBreakdownRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.key}</td>
                  <td style={{ textAlign: 'right' }}>
                    {activeFormatter(row.current)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {row.share == null
                      ? isZh
                        ? '暫無數據'
                        : 'No data'
                      : formatPercent(row.share)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {row.previous == null
                      ? isZh
                        ? '暫無數據'
                        : 'No data'
                      : activeFormatter(row.previous)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={`region-mom ${getDeltaClass(row.mom)}`}>
                      {row.previous == null
                        ? isZh
                          ? '暫無數據'
                          : 'No data'
                        : formatPercent(row.mom)}
                    </span>
                  </td>
                </tr>
              ))}

              {sortedBreakdownRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: 'center', opacity: 0.6 }}
                  >
                    {isZh ? '暫無資料。' : 'No data for selected period.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 近三個月平台趨勢折線圖 */}
        {platformTrendSeries.length > 0 && (
          <div className="platform-trend-section">
            <div className="platform-trend-header">
              <div className="platform-trend-title">
                {isZh
                  ? '近三個月各平台業績趨勢'
                  : '3-month platform performance trend'}
              </div>
              <div className="platform-trend-subtitle">
                {isZh
                  ? `地區：${selectedRegion} · 期間：${monthLabel(
                      periodMonths[0],
                    )} – ${monthLabel(periodMonths[periodMonths.length - 1])}`
                  : `Region: ${selectedRegion} · Period: ${monthLabel(
                      periodMonths[0],
                    )} – ${monthLabel(
                      periodMonths[periodMonths.length - 1],
                    )}`}
              </div>
            </div>

            <PlatformTrendChart
              series={platformTrendSeries}
              months={periodMonths}
              monthLabelFn={monthLabel}
              valueFormatter={activeFormatter}
              isZh={isZh}
            />
          </div>
        )}
      </div>
    </div>
  );
};

