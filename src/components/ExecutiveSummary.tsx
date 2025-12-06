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
  key: string; // Region or Platform
  current: number;
  previous: number | null;
  mom: number | null;
  yoy: number | null;
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
  const isZh = language === 'zh';
  const isOverview = false;

  const monthLabel = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
    if (isZh) {
      return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(
        2,
        '0',
      )}月`;
    }
    return d.toLocaleDateString('en-CA', {
      month: 'short',
      year: 'numeric',
    });
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

  // ========= 下方表格（Region / Platform breakdown） =========
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
      const filterFn = (row: SalesRow) => row.region === selectedRegion && row.platform === key;

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
        previous: prevVal,
        mom,
        yoy,
      });
    }

    return rows;
  }, [
    activeMetric,
    periodMonths,
    prevMonths,
    yoyMonths,
    rawRows,
    selectedRegion,
  ]);

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
            {isZh ? '對比' : 'vs'}{' '}
            {periodInfo.previousLabel}
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
            {isZh ? '對比' : 'vs'}{' '}
            {periodInfo.previousLabel}
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
            {isZh ? '對比' : 'vs'}{' '}
            {periodInfo.previousLabel}
            {' · '}
            <span className={getDeltaClass(effectiveAovKpi.mom)}>
              {formatPercent(effectiveAovKpi.mom)}
            </span>
          </div>
        </div>
      </div>

      {/* ===== Region / Platform Breakdown ===== */}
      <div className="region-card">
        <div className="region-header">
          <div>
            <div className="region-title">{cardTitle}</div>
            <div className="region-subtitle">
              {`${isZh ? '當月：' : 'Current: '} ${periodInfo.currentLabel} · ${
                isZh ? '前一月：' : 'Prev: '
              } ${periodInfo.previousLabel} · ${isZh ? '區域：' : 'Region: '} ${selectedRegion}`}
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
                  {periodInfo.currentLabel}
                </th>
                <th style={{ textAlign: 'right' }}>
                  {periodInfo.previousLabel}
                </th>
                <th style={{ textAlign: 'right' }}>
                  {periodInfo.momTitle}
                </th>
                <th style={{ textAlign: 'right' }}>
                  {periodInfo.yoyTitle}
                </th>
              </tr>
            </thead>
            <tbody>
              {breakdownRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.key}</td>
                  <td style={{ textAlign: 'right' }}>
                    {activeFormatter(row.current)}
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
                  <td style={{ textAlign: 'right' }}>
                    <span className={`region-mom ${getDeltaClass(row.yoy)}`}>
                      {row.yoy == null
                        ? isZh
                          ? '暫無數據'
                          : 'No data'
                        : formatPercent(row.yoy)}
                    </span>
                  </td>
                </tr>
              ))}
              {breakdownRows.length === 0 && (
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
      </div>
    </div>
  );
};
