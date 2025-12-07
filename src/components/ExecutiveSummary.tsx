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
  region: string;
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
  platformRevenueKpis?: PlatformKpi[];
  platformOrdersKpis?: PlatformKpi[];
  platformAovKpis?: PlatformKpi[];
  allMonths: string[];
  rawRows: SalesRow[];
};

type MetricKey = 'revenue' | 'orders' | 'aov';

type BreakdownRow = {
  key: string; // platform name
  current: number;
  share: number | null;
  previous: number | null;
  mom: number | null;
  yoy: number | null;
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

// ========= formatters =========
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

/**
 * 近三個月平台趨勢折線圖
 * - UBER = 藍, Fantuan = 綠, Doordash = 黃（固定顏色）
 * - Y 軸用 min/max + padding，線條不要貼頂
 * - 字級略縮小，避免擠在一起
 */
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

  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const maxValue = Math.max(...allValues, 0);
  const minValue = Math.min(...allValues);

  if (maxValue <= 0) {
    return (
      <div className="platform-trend-empty">
        {isZh ? '暫無趨勢數據。' : 'No trend data for this period.'}
      </div>
    );
  }

  // ==== Y 軸範圍：用 min/max + padding，讓線段置中一些 ====
  let domainMin = minValue;
  let domainMax = maxValue;

  if (domainMin === domainMax) {
    const padding = domainMax === 0 ? 1 : Math.abs(domainMax) * 0.1;
    domainMin -= padding;
    domainMax += padding;
  } else {
    const span = domainMax - domainMin;
    const padding = span * 0.2;
    domainMin -= padding;
    domainMax += padding;
  }

  if (domainMax <= domainMin) {
    domainMax = domainMin + 1;
  }

  const width = 430;
  const height = 170;
  const margin = { top: 10, right: 34, bottom: 32, left: 40 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const xStep =
    months.length > 1 ? chartWidth / (months.length - 1) : chartWidth / 2;

  const getX = (idx: number) =>
    margin.left + (months.length === 1 ? chartWidth / 2 : xStep * idx);

  const getY = (value: number) => {
    const clamped = Math.max(domainMin, Math.min(domainMax, value));
    const ratio = (clamped - domainMin) / (domainMax - domainMin);
    return margin.top + chartHeight - ratio * chartHeight;
  };

  // 固定平台顏色
  const PLATFORM_COLORS: Record<string, string> = {
    UBER: '#3b82f6', // 藍
    Fantuan: '#22c55e', // 綠
    Doordash: '#eab308', // 黃
  };
  const FALLBACK_COLORS = ['#4C9DFF', '#6EE7B7', '#F97373', '#FBBF24'];

  const fontScale = 0.3;
  const labelFontSize = 12 * fontScale;
  const axisFontSize = 12 * fontScale;

  // 避免同一個 x 位置上標籤互相重疊
  const usedLabelY: Record<number, number[]> = {};
  const avoidOverlap = (xIndex: number, proposedY: number) => {
    if (!usedLabelY[xIndex]) usedLabelY[xIndex] = [];
    const taken = usedLabelY[xIndex];

    const minGap = series.length >= 3 ? 16 : 14;

    let finalY = proposedY;
    for (const y of taken) {
      if (Math.abs(finalY - y) < minGap) {
        finalY += minGap;
      }
    }
    taken.push(finalY);
    return finalY;
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

        {/* 5 條水平 grid 線 */}
        {[0.2, 0.4, 0.6, 0.8, 1].map((r) => {
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

        {/* X 軸月份標籤（字級稍微縮小） */}
        {months.map((m, idx) => (
          <text
            key={m}
            x={getX(idx)}
            y={margin.top + chartHeight + 18}
            textAnchor="middle"
            fontSize={axisFontSize}
            fill="rgba(255,255,255,0.55)"
          >
            {monthLabelFn(m)}
          </text>
        ))}

        {/* 線條 + 點 + 數字標籤 */}
        {series.map((s, si) => {
          const color =
            PLATFORM_COLORS[s.platform] ??
            FALLBACK_COLORS[si % FALLBACK_COLORS.length];

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
                strokeWidth={1.8}
                strokeLinecap="round"
              />

              {s.points.map((p, idx) => {
                const x = getX(idx);
                const y = getY(p.value);
                const label = valueFormatter(p.value);

                let labelY = y - 8;
                if (labelY < margin.top + 6) labelY = y + 12;
                const adjustedY = avoidOverlap(idx, labelY);

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
                      y={adjustedY}
                      textAnchor="middle"
                      fontSize={labelFontSize}
                      fill={color}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="platform-trend-legend">
        {series.map((s, si) => {
          const color =
            PLATFORM_COLORS[s.platform] ??
            FALLBACK_COLORS[si % FALLBACK_COLORS.length];
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

  const monthLabel = (iso: string | null) => {
    if (!iso) return '—';
    const short = iso.slice(0, 7);
    const [year, month] = short.split('-');
    const mNum = Number(month);
    if (!year || !mNum || Number.isNaN(mNum)) return short;

    if (isZh) return `${year}年${month}月`;

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

  // 「近三個月」只給下方 line chart 用
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

  // ======= KPI（上方三張卡片）=======
  // 這裡改回：直接用外層傳進來的 revenueKpi / ordersKpi / aovKpi（只看當月 vs 前月）
  const cardKpis = useMemo(
    () => ({
      revenue: revenueKpi,
      orders: ordersKpi,
      aov: aovKpi,
    }),
    [revenueKpi, ordersKpi, aovKpi],
  );

  // ======= 下方平台表格：只看「選定月份」，不是 3 個月加總 =======
  const breakdownRows: BreakdownRow[] = useMemo(() => {
    if (!selectedMonth) return [];

    // 當月所有平台
    const platforms = Array.from(
      new Set(
        rawRows
          .filter(
            (r) => r.region === selectedRegion && r.month === selectedMonth,
          )
          .map((r) => r.platform),
      ),
    ).sort();

    const rows: BreakdownRow[] = [];

    for (const key of platforms) {
      const filterFn = (row: SalesRow) =>
        row.region === selectedRegion && row.platform === key;

      // 當月
      const currAgg = sumForMonths([selectedMonth], filterFn);
      // 前一月（如果有）
      const prevAgg = sumForMonths(prevMonths, filterFn);
      // 去年同月（如果有）
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
        share: null,
        previous: prevVal,
        mom,
        yoy,
      });
    }

    const totalCurrent = rows.reduce((sum, r) => sum + r.current, 0);
    if (totalCurrent <= 0) {
      return rows.map((r) => ({ ...r, share: null }));
    }

    return rows.map((r) => ({
      ...r,
      share: r.current / totalCurrent,
    }));
  }, [
    activeMetric,
    prevMonths,
    selectedMonth,
    selectedRegion,
    rawRows,
    yoyMonths,
  ]);

  // ======= 近三個月趨勢資料：維持 3 個月加總 =======
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

  // ======= 排序 =======
  const sortedBreakdownRows = useMemo(() => {
    const rows = [...breakdownRows];
    const dirFactor = sortDir === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
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
      setSortDir('desc');
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

  // ===== 文案 / formatter 設定 =====
  const metricConfig: Record<
    MetricKey,
    { labelEn: string; labelZh: string; formatter: (v: number | null | undefined) => string }
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
      {/* 範圍標籤 */}
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

      {/* KPI cards */}
      <div className="kpi-grid">
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

        <div className="kpi-card" onClick={() => setActiveMetric('orders')}>
          <div className="kpi-title">
            {isZh ? metricConfig.orders.labelZh : metricConfig.orders.labelEn}
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

      {/* 下方平台拆分 + 趨勢 */}
      <div className="region-card">
        <div className="region-header">
          <div>
            <div className="region-title">{cardTitle}</div>
            <div className="region-subtitle">
              {`${isZh ? '當前：' : 'Current: '} ${
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
                <th style={{ textAlign: 'left' }}>
                  {firstColumnLabel}
                </th>
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

        {/* 近三個月趨勢折線圖 */}
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
                    )} – ${monthLabel(
                      periodMonths[periodMonths.length - 1],
                    )}`
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


