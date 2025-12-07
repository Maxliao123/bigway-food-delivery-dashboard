// src/components/UberAdsPanel.tsx
import React, { useMemo, useState } from 'react';
import type { Lang } from '../App';
import { useUberAdsMetrics } from '../hooks/useUberAdsMetrics';
import type { UberAdsMetricRow } from '../hooks/useUberAdsMetrics';

type Props = {
  language: Lang;
  selectedRegion: string;
  currentMonthIso: string | null;
  prevMonthIso: string | null;
};

// ========= 小工具 =========
type Kpi = {
  current: number | null;
  previous: number | null;
  mom: number | null;
};

type SortKey =
  | 'store'
  | 'sales'
  | 'spend'
  | 'dailySpend'
  | 'roas'
  | 'roasDelta'
  | 'cpo';

type SortState = {
  key: SortKey;
  direction: 'asc' | 'desc';
};

function formatCurrency(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '-';
  return `$${value.toLocaleString('en-CA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatCurrency2(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '-';
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatX(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '-';
  return `${value.toFixed(2)}x`;
}

function monthLabel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
  };
  return d.toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en-CA', opts);
}

// 單店的 AD Sales = Spend × ROAS
function calcSales(row: UberAdsMetricRow): number | null {
  const spend = row.curr.spend ?? 0;
  const roas = row.curr.roas ?? 0;
  const sales = spend * roas;
  if (!Number.isFinite(sales) || sales <= 0) return null;
  return sales;
}

export const UberAdsPanel: React.FC<Props> = ({
  language,
  selectedRegion,
  currentMonthIso,
  prevMonthIso,
}) => {
  const isZh = language === 'zh';

  const { loading, error, rows } = useUberAdsMetrics(
    selectedRegion,
    currentMonthIso,
    prevMonthIso,
  );

  const [sort, setSort] = useState<SortState>({
    key: 'sales',
    direction: 'desc',
  });

  const sortedRows = useMemo(() => {
    const comparer = (a: UberAdsMetricRow, b: UberAdsMetricRow) => {
      const dir = sort.direction === 'asc' ? 1 : -1;

      const valueFor = (row: UberAdsMetricRow): number => {
        switch (sort.key) {
          case 'store':
            return row.store_name.localeCompare(b.store_name);
          case 'sales':
            return calcSales(row) ?? -Infinity;
          case 'spend':
            return row.curr.spend ?? -Infinity;
          case 'dailySpend':
            return row.curr.daily_spend ?? -Infinity;
          case 'roas':
            return row.curr.roas ?? -Infinity;
          case 'roasDelta':
            return row.roas_delta_pct ?? -Infinity;
          case 'cpo':
            return row.curr.avg_cost_per_order ?? Infinity;
          default:
            return 0;
        }
      };

      const av = valueFor(a);
      const bv = valueFor(b);

      if (av === bv) {
        return a.store_name.localeCompare(b.store_name) * dir;
      }
      return av > bv ? dir : -dir;
    };

    return [...rows].sort(comparer);
  }, [rows, sort]);

  const totalKpis = useMemo(() => {
    let totalSpendCurr = 0;
    let totalSpendPrev = 0;
    let totalSalesCurr = 0;
    let totalSalesPrev = 0;
    let totalRoasCurr = 0;
    let totalRoasPrev = 0;
    let countRoasCurr = 0;
    let countRoasPrev = 0;

    for (const row of rows) {
      const currSpend = row.curr.spend ?? 0;
      const prevSpend = row.prev.spend ?? 0;
      const currRoas = row.curr.roas ?? 0;
      const prevRoas = row.prev.roas ?? 0;

      totalSpendCurr += currSpend;
      totalSpendPrev += prevSpend;

      totalSalesCurr += currSpend * currRoas;
      totalSalesPrev += prevSpend * prevRoas;

      if (row.curr.roas != null) {
        totalRoasCurr += row.curr.roas;
        countRoasCurr += 1;
      }

      if (row.prev.roas != null) {
        totalRoasPrev += row.prev.roas;
        countRoasPrev += 1;
      }
    }

    const avgRoasCurr =
      countRoasCurr > 0 ? totalRoasCurr / countRoasCurr : null;
    const avgRoasPrev =
      countRoasPrev > 0 ? totalRoasPrev / countRoasPrev : null;

    const totalSalesKpi: Kpi = {
      current: totalSalesCurr || null,
      previous: totalSalesPrev || null,
      mom:
        totalSalesCurr && totalSalesPrev
          ? (totalSalesCurr - totalSalesPrev) / totalSalesPrev
          : null,
    };

    const totalSpendKpi: Kpi = {
      current: totalSpendCurr || null,
      previous: totalSpendPrev || null,
      mom:
        totalSpendCurr && totalSpendPrev
          ? (totalSpendCurr - totalSpendPrev) / totalSpendPrev
          : null,
    };

    const avgRoasKpi: Kpi = {
      current: avgRoasCurr,
      previous: avgRoasPrev,
      mom:
        avgRoasCurr != null &&
        avgRoasPrev != null &&
        avgRoasPrev !== 0
          ? (avgRoasCurr - avgRoasPrev) / avgRoasPrev
          : null,
    };

    return {
      totalSalesKpi,
      totalSpendKpi,
      avgRoasKpi,
    };
  }, [rows]);

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key, direction: 'desc' };
    });
  };

  const renderSortIcon = (key: SortKey) => {
    if (sort.key !== key) return <span className="sort-icon sort-icon-off">↕</span>;
    return (
      <span className="sort-icon">
        {sort.direction === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const currentMonthText =
    currentMonthIso != null
      ? monthLabel(currentMonthIso, language)
      : isZh
      ? '無資料月份'
      : 'No month';

  const prevMonthText =
    prevMonthIso != null
      ? monthLabel(prevMonthIso, language)
      : isZh
      ? '無前期'
      : 'No prev month';

  const { totalSalesKpi, totalSpendKpi, avgRoasKpi } = totalKpis;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            {isZh ? 'UBER ADS 成效' : 'UBER ADS PERFORMANCE'}
          </h2>
          <p className="panel-subtitle">
            {isZh
              ? '各門店的 Uber 廣告花費、ROAS 與效率。'
              : 'Store-level Uber ad spend, ROAS and efficiency.'}
          </p>
        </div>
        <div className="panel-meta">
          <div className="panel-meta-line">
            <span className="panel-meta-label">
              {isZh ? '區域' : 'Region'}:
            </span>
            <span className="panel-meta-value">{selectedRegion}</span>
          </div>
          <div className="panel-meta-line">
            <span className="panel-meta-label">
              {isZh ? '月份' : 'Month'}:
            </span>
            <span className="panel-meta-value">{currentMonthText}</span>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      {!loading && !error && (
        <div className="kpi-grid" style={{ marginBottom: 28 }}>
          {/* Total AD Sales */}
          <div className="kpi-card">
            <div className="kpi-title">
              {isZh ? 'Total AD Sales' : 'Total AD Sales'}
            </div>
            <div className="kpi-value">
              {formatCurrency(totalSalesKpi.current)}
            </div>
            <div className="kpi-sub">
              {prevMonthIso
                ? `${isZh ? 'vs' : 'vs'} ${prevMonthText}`
                : isZh
                ? '無對比月份'
                : 'No comparison month'}{' '}
              <span
                className={
                  totalSalesKpi.mom == null
                    ? 'kpi-mom-neutral'
                    : totalSalesKpi.mom >= 0
                    ? 'kpi-mom-positive'
                    : 'kpi-mom-negative'
                }
              >
                {totalSalesKpi.mom != null
                  ? formatPercent(totalSalesKpi.mom)
                  : '-'}
              </span>
            </div>
          </div>

          {/* Total AD Spend */}
          <div className="kpi-card">
            <div className="kpi-title">
              {isZh ? 'Total AD Spend' : 'Total AD Spend'}
            </div>
            <div className="kpi-value">
              {formatCurrency(totalSpendKpi.current)}
            </div>
            <div className="kpi-sub">
              {prevMonthIso
                ? `${isZh ? 'vs' : 'vs'} ${prevMonthText}`
                : isZh
                ? '無對比月份'
                : 'No comparison month'}{' '}
              <span
                className={
                  totalSpendKpi.mom == null
                    ? 'kpi-mom-neutral'
                    : totalSpendKpi.mom >= 0
                    ? 'kpi-mom-positive'
                    : 'kpi-mom-negative'
                }
              >
                {totalSpendKpi.mom != null
                  ? formatPercent(totalSpendKpi.mom)
                  : '-'}
              </span>
            </div>
          </div>

          {/* Avg ROAS */}
          <div className="kpi-card">
            <div className="kpi-title">
              {isZh ? 'Avg ROAS' : 'Avg ROAS'}
            </div>
            <div className="kpi-value">
              {avgRoasKpi.current != null
                ? formatX(avgRoasKpi.current)
                : '-'}
            </div>
            <div className="kpi-sub">
              {prevMonthIso
                ? `${isZh ? 'vs' : 'vs'} ${prevMonthText}`
                : isZh
                ? '無對比月份'
                : 'No comparison month'}{' '}
              <span
                className={
                  avgRoasKpi.mom == null
                    ? 'kpi-mom-neutral'
                    : avgRoasKpi.mom >= 0
                    ? 'kpi-mom-positive'
                    : 'kpi-mom-negative'
                }
              >
                {avgRoasKpi.mom != null
                  ? formatPercent(avgRoasKpi.mom)
                  : '-'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="panel-loading">
          {isZh ? '讀取 Uber 廣告資料中…' : 'Loading Uber Ads data…'}
        </div>
      ) : error ? (
        <div className="panel-error">
          {isZh ? '讀取資料發生錯誤：' : 'Error loading data: '}
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel-empty">
          {isZh
            ? '這個區域 / 月份目前沒有 Uber Ads 資料。'
            : 'No Uber Ads data for this region and month yet.'}
        </div>
      ) : (
        <div
          style={{
            marginTop: 16,
            overflowX: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: 900,
            }}
          >
            <thead>
              <tr>
                <th className="table-header-left">
                  <button
                    type="button"
                    className="table-header-button"
                    onClick={() => handleSort('store')}
                  >
                    {isZh ? '門店' : 'Store'}
                    {renderSortIcon('store')}
                  </button>
                </th>

                {/* AD Sales */}
                <th>
                  <button
                    type="button"
                    className="table-header-button"
                    onClick={() => handleSort('sales')}
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    {isZh ? 'AD Sales' : 'AD Sales'}
                    {renderSortIcon('sales')}
                  </button>
                </th>

                {/* AD Spend */}
                <th>
                  <button
                    type="button"
                    className="table-header-button"
                    onClick={() => handleSort('spend')}
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    AD Spend
                    {renderSortIcon('spend')}
                  </button>
                </th>

                {/* Daily AD Spend */}
                <th>
                  <button
                    type="button"
                    className="table-header-button"
                    onClick={() => handleSort('dailySpend')}
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    {isZh ? '日均 AD Spend' : 'Daily AD Spend'}
                    {renderSortIcon('dailySpend')}
                  </button>
                </th>

                {/* ROAS */}
                <th>
                  <button
                    type="button"
                    className="table-header-button"
                    onClick={() => handleSort('roas')}
                  >
                    ROAS
                    {renderSortIcon('roas')}
                  </button>
                </th>

                {/* ROAS Δ% */}
                <th>
                  <button
                    type="button"
                    className="table-header-button"
                    onClick={() => handleSort('roasDelta')}
                  >
                    ROAS Δ%
                    {renderSortIcon('roasDelta')}
                  </button>
                </th>

                {/* CPO */}
                <th className="table-header-right">
                  <button
                    type="button"
                    className="table-header-button"
                    onClick={() => handleSort('cpo')}
                  >
                    CPO
                    {renderSortIcon('cpo')}
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {sortedRows.map((row) => {
                const sales = calcSales(row);
                const spend = row.curr.spend;
                const dailySpend = row.curr.daily_spend;
                const roas = row.curr.roas;
                const roasDelta = row.roas_delta_pct;
                const cpo = row.curr.avg_cost_per_order;

                return (
                  <tr key={row.store_name}>
                    <td className="table-cell-left">{row.store_name}</td>
                    {/* AD Sales */}
                    <td className="table-cell">{formatCurrency(sales)}</td>
                    {/* AD Spend */}
                    <td className="table-cell">{formatCurrency(spend)}</td>
                    {/* Daily AD Spend */}
                    <td className="table-cell">
                      {formatCurrency(dailySpend)}
                    </td>
                    {/* ROAS */}
                    <td className="table-cell">{formatX(roas)}</td>
                    {/* ROAS Δ% */}
                    <td
                      className={
                        roasDelta == null
                          ? 'table-cell'
                          : roasDelta >= 0
                          ? 'table-cell-positive'
                          : 'table-cell-negative'
                      }
                    >
                      {formatPercent(roasDelta)}
                    </td>
                    {/* CPO */}
                    <td className="table-cell-right">
                      {formatCurrency2(cpo)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};


