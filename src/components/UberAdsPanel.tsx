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

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return (
    '$' +
    value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

function formatCurrency2(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return (
    '$' +
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatPercentDelta(value: number | null): { text: string; color: string } {
  if (value == null || Number.isNaN(value)) {
    return { text: '—', color: '#9ca3af' };
  }
  const pct = (value * 100).toFixed(1) + '%';
  if (value > 0) return { text: pct, color: '#22c55e' };
  if (value < 0) return { text: pct, color: '#f97373' };
  return { text: pct, color: '#9ca3af' };
}

function formatRoas(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(2) + 'x';
}

function formatPercentSimple(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const pct = (value * 100).toFixed(1);
  return `${pct.replace(/\.0$/, '')}%`;
}

function getDeltaClass(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  if (value > 0) return 'kpi-pos';
  if (value < 0) return 'kpi-neg';
  return '';
}

function calcMom(curr: number | null, prev: number | null): number | null {
  if (
    curr == null ||
    prev == null ||
    !Number.isFinite(curr) ||
    !Number.isFinite(prev) ||
    prev === 0
  ) {
    return null;
  }
  return (curr - prev) / prev;
}

function monthLabel(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    year: 'numeric',
  };
  return d.toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en-CA', opts);
}

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

  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const monthText = monthLabel(currentMonthIso, language);
  const prevMonthText = prevMonthIso
    ? monthLabel(prevMonthIso, language)
    : isZh
    ? '無前期'
    : 'No prev month';

  // ====== KPI（Total Sales / Total Spend / Avg ROAS）======
  const kpis = useMemo(() => {
    if (!rows.length) {
      return {
        sales: { current: null, previous: null, mom: null } as Kpi,
        spend: { current: null, previous: null, mom: null } as Kpi,
        roas: { current: null, previous: null, mom: null } as Kpi,
      };
    }

    let totalSalesCurr = 0;
    let totalSalesPrev = 0;
    let totalSpendCurr = 0;
    let totalSpendPrev = 0;

    for (const row of rows) {
      const currSpend = row.curr.spend ?? 0;
      const prevSpend = row.prev.spend ?? 0;
      const currRoas = row.curr.roas ?? 0;
      const prevRoas = row.prev.roas ?? 0;

      totalSpendCurr += currSpend;
      totalSpendPrev += prevSpend;

      totalSalesCurr += currSpend * currRoas;
      totalSalesPrev += prevSpend * prevRoas;
    }

    const avgRoasCurr =
      totalSpendCurr > 0 ? totalSalesCurr / totalSpendCurr : null;
    const avgRoasPrev =
      totalSpendPrev > 0 ? totalSalesPrev / totalSpendPrev : null;

    const salesKpi: Kpi = {
      current: totalSalesCurr || null,
      previous: totalSalesPrev || null,
      mom: calcMom(totalSalesCurr || null, totalSalesPrev || null),
    };

    const spendKpi: Kpi = {
      current: totalSpendCurr || null,
      previous: totalSpendPrev || null,
      mom: calcMom(totalSpendCurr || null, totalSpendPrev || null),
    };

    const roasKpi: Kpi = {
      current: avgRoasCurr,
      previous: avgRoasPrev,
      mom: calcMom(avgRoasCurr, avgRoasPrev),
    };

    return {
      sales: salesKpi,
      spend: spendKpi,
      roas: roasKpi,
    };
  }, [rows]);

  // ====== 排序邏輯 (Click headers to sort) ======
  const sortedRows = useMemo(() => {
    const copy = [...rows];

    const getValue = (row: UberAdsMetricRow): any => {
      switch (sortKey) {
        case 'store':
          return row.store_name;
        case 'sales':
          return calcSales(row);
        case 'spend':
          return row.curr.spend ?? null;
        case 'dailySpend':
          return row.curr.daily_spend ?? null;
        case 'roas':
          return row.curr.roas ?? null;
        case 'roasDelta':
          return row.roas_delta_pct ?? null;
        case 'cpo':
          return row.curr.avg_cost_per_order ?? null;
      }
    };

    const dir = sortDir === 'asc' ? 1 : -1;

    copy.sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);

      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * dir;
      }

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va === vb) return 0;
      return va > vb ? dir : -dir;
    });

    return copy;
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // store 預設升冪，其餘預設降冪
      setSortDir(key === 'store' ? 'asc' : 'desc');
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

  return (
    <section
      style={{
        marginTop: 16,
        borderRadius: 16,
        border: '1px solid #4b5563',
        background: '#020617',
        padding: '12px 16px 16px',
      }}
    >
      {/* 標題列 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#9ca3af',
              marginBottom: 2,
            }}
          >
            {isZh ? 'Uber 廣告成效' : 'Uber Ads performance'}
          </h2>
          <p style={{ fontSize: 12, color: '#9ca3af' }}>
            {isZh
              ? '門店層級的 Uber 廣告花費、ROAS 與效率。'
              : 'Store-level Uber ad spend, ROAS and efficiency.'}
          </p>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            {isZh ? '點擊欄位標題可排序。' : 'Click column headers to sort.'}
          </p>
        </div>

        <div
          style={{
            fontSize: 11,
            color: '#9ca3af',
            textAlign: 'right',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <span>
            {isZh ? 'Region：' : 'Region: '}
            {selectedRegion || '—'}
          </span>
          <span>
            {isZh ? 'Month：' : 'Month: '}
            {monthText}
          </span>
        </div>
      </div>

      {/* KPI cards */}
      {!loading && !error && (
        <div className="kpi-grid" style={{ marginBottom: 8 }}>
          {/* Total Sales */}
          <div className="kpi-card">
            <div className="kpi-title">
              {isZh ? 'Total Sales' : 'Total Sales'}
            </div>
            <div className="kpi-value">
              {formatCurrency(kpis.sales.current)}
            </div>
            <div className="kpi-sub">
              {isZh ? '對比' : 'vs'} {prevMonthText}
              {' · '}
              <span className={getDeltaClass(kpis.sales.mom)}>
                {formatPercentSimple(kpis.sales.mom)}
              </span>
            </div>
          </div>

          {/* Total Spend */}
          <div className="kpi-card">
            <div className="kpi-title">
              {isZh ? 'Total Spend' : 'Total Spend'}
            </div>
            <div className="kpi-value">
              {formatCurrency(kpis.spend.current)}
            </div>
            <div className="kpi-sub">
              {isZh ? '對比' : 'vs'} {prevMonthText}
              {' · '}
              <span className={getDeltaClass(kpis.spend.mom)}>
                {formatPercentSimple(kpis.spend.mom)}
              </span>
            </div>
          </div>

          {/* Avg ROAS */}
          <div className="kpi-card">
            <div className="kpi-title">
              {isZh ? 'Avg ROAS' : 'Avg ROAS'}
            </div>
            <div className="kpi-value">
              {kpis.roas.current == null
                ? '—'
                : formatRoas(kpis.roas.current)}
            </div>
            <div className="kpi-sub">
              {isZh ? '對比' : 'vs'} {prevMonthText}
              {' · '}
              <span className={getDeltaClass(kpis.roas.mom)}>
                {formatPercentSimple(kpis.roas.mom)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 狀態列 */}
      {loading && (
        <div style={{ fontSize: 12, color: '#e5e7eb' }}>
          {isZh ? '正在載入 Uber 廣告資料…' : 'Loading Uber Ads metrics…'}
        </div>
      )}
      {!loading && error && (
        <div style={{ fontSize: 12, color: '#f97373' }}>
          {isZh
            ? `載入 Uber 廣告資料錯誤：${error}`
            : `Error loading Uber Ads metrics: ${error}`}
        </div>
      )}

      {!loading && !error && (
        <>
          {sortedRows.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              {isZh
                ? '目前沒有這個區域、這個月份的 Uber 廣告資料。'
                : 'No Uber ads data for this region and month yet.'}
            </div>
          ) : (
            <div
              style={{
                marginTop: 8,
                overflowX: 'auto',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 12,
                  color: '#e5e7eb',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #374151',
                      color: '#9ca3af',
                    }}
                  >
                    {/* Store */}
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('store')}
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
                        {isZh ? '店名' : 'Store'}
                        {renderSortIcon('store')}
                      </button>
                    </th>

                    {/* Sales */}
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('sales')}
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
                        {isZh ? 'Sales' : 'Sales'}
                        {renderSortIcon('sales')}
                      </button>
                    </th>

                    {/* Spend */}
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('spend')}
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
                        Spend
                        {renderSortIcon('spend')}
                      </button>
                    </th>

                    {/* Daily spend */}
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('dailySpend')}
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
                        {isZh ? '日均花費' : 'Daily spend'}
                        {renderSortIcon('dailySpend')}
                      </button>
                    </th>

                    {/* ROAS */}
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('roas')}
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
                        ROAS
                        {renderSortIcon('roas')}
                      </button>
                    </th>

                    {/* ROAS Δ% */}
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('roasDelta')}
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
                        ROAS Δ%
                        {renderSortIcon('roasDelta')}
                      </button>
                    </th>

                    {/* CPO */}
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('cpo')}
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
                        CPO
                        {renderSortIcon('cpo')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const sales = calcSales(row);
                    const spendDelta = formatPercentDelta(row.spend_delta_pct);
                    const roasDelta = formatPercentDelta(row.roas_delta_pct);

                    return (
                      <tr
                        key={`${row.region}-${row.store_name}`}
                        style={{ borderBottom: '1px solid #111827' }}
                      >
                        {/* Store */}
                        <td
                          style={{
                            padding: '6px 4px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.store_name}
                        </td>

                        {/* Sales */}
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {formatCurrency(sales)}
                        </td>

                        {/* Spend */}
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {formatCurrency(row.curr.spend)}
                        </td>

                        {/* Spend Δ%（仍然顯示在 Spend 旁邊? 你原本有這欄，如果不需要可以刪掉） */}
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {formatCurrency(row.curr.daily_spend)}
                        </td>

                        {/* ROAS */}
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {formatRoas(row.curr.roas)}
                        </td>

                        {/* ROAS Δ% */}
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                            color: roasDelta.color,
                          }}
                        >
                          {roasDelta.text}
                        </td>

                        {/* CPO */}
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {formatCurrency2(row.curr.avg_cost_per_order)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};


