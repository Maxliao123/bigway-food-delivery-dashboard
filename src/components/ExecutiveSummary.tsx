// src/components/ExecutiveSummary.tsx
import React, { useEffect, useMemo, useState } from 'react';
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
  const [scope, setScope] = useState<Scope>('overview'); // ⬅️ local scope
  const isZh = language === 'zh';
  const isOverview = scope === 'overview';

  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  // 初始：預設分析最新一個月
  useEffect(() => {
    if (!allMonths.length) return;
    const latest = allMonths[allMonths.length - 1];
    setRangeStart(prev => prev ?? latest);
    setRangeEnd(prev => prev ?? latest);
  }, [allMonths]);

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

  // ========= 時間區間計算（single / range） =========
  const periodInfo = useMemo(() => {
    if (!allMonths.length || !rangeStart || !rangeEnd) {
      return {
        hasRange: false,
        mode: 'single' as 'single' | 'range',
        periodMonths: [] as string[],
        prevMonths: [] as string[],
        yoyMonths: [] as string[],
        currentLabel: isZh ? '當期' : 'Current',
        previousLabel: isZh ? '前一月/區間' : 'Previous',
        momTitle: 'MoM',
        yoyTitle: 'YoY',
      };
    }

    const startIdx = allMonths.indexOf(rangeStart);
    const endIdx = allMonths.indexOf(rangeEnd);
    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
      return {
        hasRange: false,
        mode: 'single' as 'single' | 'range',
        periodMonths: [] as string[],
        prevMonths: [] as string[],
        yoyMonths: [] as string[],
        currentLabel: isZh ? '當期' : 'Current',
        previousLabel: isZh ? '前一月/區間' : 'Previous',
        momTitle: 'MoM',
        yoyTitle: 'YoY',
      };
    }

    const periodMonths = allMonths.slice(startIdx, endIdx + 1);
    const len = periodMonths.length;
    const mode: 'single' | 'range' = len === 1 ? 'single' : 'range';

    // prev period（同長度）
    const prevEndIdx = startIdx - 1;
    const prevStartIdx = prevEndIdx - (len - 1);
    const hasPrev = prevStartIdx >= 0 && prevEndIdx >= 0;
    const prevMonths = hasPrev
      ? allMonths.slice(prevStartIdx, prevEndIdx + 1)
      : [];

    // YoY period
    const yoyStartIdx = startIdx - 12;
    const yoyEndIdx = endIdx - 12;
    const hasYoy =
      yoyStartIdx >= 0 && yoyEndIdx >= yoyStartIdx && yoyEndIdx < allMonths.length;
    const yoyMonths = hasYoy
      ? allMonths.slice(yoyStartIdx, yoyEndIdx + 1)
      : [];

    const makeRangeText = (s: string, e: string) => {
      if (s === e) return monthLabel(s);
      return `${monthLabel(s)} – ${monthLabel(e)}`;
    };

    let currentLabel: string;
    let previousLabel: string;
    let momTitle: string;
    let yoyTitle: string;

    if (mode === 'single') {
      currentLabel = monthLabel(rangeStart);
      previousLabel =
        hasPrev && prevMonths.length
          ? monthLabel(allMonths[prevEndIdx])
          : isZh
          ? '前一月'
          : 'Prev month';
      momTitle = 'MoM';
      yoyTitle = 'YoY';
    } else {
      currentLabel = makeRangeText(rangeStart, rangeEnd);
      previousLabel =
        hasPrev && prevMonths.length
          ? makeRangeText(allMonths[prevStartIdx], allMonths[prevEndIdx])
          : isZh
          ? '前一區間'
          : 'Prev period';
      momTitle = isZh ? '區間變化' : 'Δ vs prev period';
      yoyTitle = isZh ? '同比去年區間' : 'YoY vs last year period';
    }

    return {
      hasRange: true,
      mode,
      periodMonths,
      prevMonths,
      yoyMonths,
      currentLabel,
      previousLabel,
      momTitle,
      yoyTitle,
    };
  }, [allMonths, rangeStart, rangeEnd, isZh]);

  const { periodMonths, prevMonths, yoyMonths } = periodInfo;

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
    if (!periodInfo.hasRange || !periodMonths.length) {
      return {
        revenue: revenueKpi,
        orders: ordersKpi,
        aov: aovKpi,
      };
    }

    const scopeFilter = (row: SalesRow) =>
      scope === 'overview' ? true : row.region === scope;

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
    ordersKpi,
    periodInfo.hasRange,
    periodMonths,
    prevMonths,
    revenueKpi,
    scope,
    rawRows,
  ]);

  // ========= 下方表格（Region / Platform breakdown） =========
  const breakdownRows: BreakdownRow[] = useMemo(() => {
    if (!periodInfo.hasRange || !periodMonths.length) {
      return [];
    }

    const allRegions = Array.from(
      new Set(rawRows.map((r) => r.region)),
    ).sort();

    const allPlatformsForScope =
      scope === 'overview'
        ? []
        : Array.from(
            new Set(
              rawRows
                .filter((r) => r.region === scope)
                .map((r) => r.platform),
            ),
          ).sort();

    const groups = isOverview ? allRegions : allPlatformsForScope;

    const rows: BreakdownRow[] = [];

    for (const key of groups) {
      const filterFn = (row: SalesRow) => {
        if (isOverview) return row.region === key;
        return row.region === scope && row.platform === key;
      };

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
    isOverview,
    periodInfo.hasRange,
    periodMonths,
    prevMonths,
    yoyMonths,
    rawRows,
    scope,
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

  const regionTitleMap: Record<MetricKey, { en: string; zh: string }> = {
    revenue: {
      en: 'Regional breakdown — Total revenue',
      zh: '區域拆分 — 總營收',
    },
    orders: {
      en: 'Regional breakdown — Total orders',
      zh: '區域拆分 — 訂單數',
    },
    aov: {
      en: 'Regional breakdown — Global AOV',
      zh: '區域拆分 — 客單價',
    },
  };

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

  const firstColumnLabel = isOverview
    ? isZh
      ? '區域'
      : 'Region'
    : isZh
    ? '平台'
    : 'Platform';

  const cardTitle = isOverview
    ? isZh
      ? regionTitleMap[activeMetric].zh
      : regionTitleMap[activeMetric].en
    : isZh
    ? platformTitleMap[activeMetric].zh
    : platformTitleMap[activeMetric].en;

  const rangeSelectStyle: React.CSSProperties = {
    background: 'rgba(15,23,42,0.95)',
    borderRadius: 999,
    border: '1px solid rgba(75,85,99,0.9)',
    color: '#e5e7eb',
    fontSize: 11,
    padding: '4px 8px',
    marginLeft: 6,
  };

  const effectiveRevenueKpi = cardKpis.revenue;
  const effectiveOrdersKpi = cardKpis.orders;
  const effectiveAovKpi = cardKpis.aov;

  const scopeLabel = (s: Scope) => {
    if (!isZh) return s === 'overview' ? 'Overview' : s;
    if (s === 'overview') return '總覽';
    return s;
  };

  return (
    <div className="exec-wrapper">
      {/* ===== 上方 bar：Scope + 時間篩選 ===== */}
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
        {/* Scope toggle */}
        <div className="scope-toggle">
          {(['overview', 'BC', 'ON', 'CA'] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              className={
                'scope-pill' + (scope === s ? ' scope-pill-active' : '')
              }
              onClick={() => setScope(s)}
            >
              {scopeLabel(s)}
            </button>
          ))}
        </div>

        {/* 時間篩選器 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: '#9ca3af',
          }}
        >
          <span>{isZh ? '分析區間' : 'Analysis period'}</span>
          <select
            style={rangeSelectStyle}
            value={rangeStart ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              const startIdx = allMonths.indexOf(value);
              const endIdx = rangeEnd ? allMonths.indexOf(rangeEnd) : -1;
              if (endIdx !== -1 && startIdx > endIdx) {
                setRangeEnd(value);
              }
              setRangeStart(value);
            }}
          >
            {allMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <span>~</span>
          <select
            style={rangeSelectStyle}
            value={rangeEnd ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              if (!value) return;
              const endIdx = allMonths.indexOf(value);
              const startIdx = rangeStart ? allMonths.indexOf(rangeStart) : -1;
              if (startIdx !== -1 && endIdx < startIdx) {
                setRangeStart(value);
              }
              setRangeEnd(value);
            }}
          >
            {allMonths.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
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
            {periodInfo.hasRange && periodInfo.prevMonths.length
              ? periodInfo.previousLabel
              : monthLabel(prevMonth)}
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
            {periodInfo.hasRange && periodInfo.prevMonths.length
              ? periodInfo.previousLabel
              : monthLabel(prevMonth)}
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
            {periodInfo.hasRange && periodInfo.prevMonths.length
              ? periodInfo.previousLabel
              : monthLabel(prevMonth)}
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
              {periodInfo.hasRange
                ? `${isZh ? '當前區間：' : 'Current: '} ${
                    periodInfo.currentLabel
                  } · ${
                    isZh ? '前一區間：' : 'Prev: '
                  } ${periodInfo.previousLabel}`
                : `${isZh ? '當月：' : 'Current: '} ${monthLabel(
                    currentMonth,
                  )} · ${isZh ? '前一月：' : 'Prev: '} ${monthLabel(
                    prevMonth,
                  )}`}
              {!isOverview && (
                <>
                  {' · '}
                  {isZh ? '區域：' : 'Region: '}
                  {scope}
                </>
              )}
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
