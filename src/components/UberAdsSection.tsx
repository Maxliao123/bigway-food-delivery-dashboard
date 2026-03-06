// src/components/UberAdsSection.tsx
import React, { useMemo, useState } from 'react';
import { useUberAds, type UberAdRow } from '../hooks/useUberAds';
import type { Lang } from '../App';

// ===== formatters =====
const fmtCurrency = (v: number) =>
  '$' + Math.round(v).toLocaleString();

const fmtCurrencyDecimal = (v: number) =>
  '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtNumber = (v: number) =>
  v.toLocaleString(undefined, { maximumFractionDigits: 0 });

const fmtRoas = (v: number) => v.toFixed(2) + 'x';

const fmtPercent = (v: number | null) => {
  if (v === null) return '—';
  return (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
};

// ROAS delta: raw difference (e.g. +5.2, -3.1), NOT percentage
const fmtRoasDelta = (v: number | null) => {
  if (v === null) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(2);
};

const deltaColor = (v: number | null): React.CSSProperties => {
  if (v === null) return { color: '#9ca3af' };
  if (v > 0) return { color: '#22c55e' };
  if (v < 0) return { color: '#f97373' };
  return { color: '#9ca3af' };
};

// ===== Sort =====
type SortKey =
  | 'store_name'
  | 'adSales'
  | 'adSpend'
  | 'dailyAdSpend'
  | 'roas'
  | 'roasDelta'
  | 'cpo';

type SortState = { key: SortKey; direction: 'asc' | 'desc' };

type Props = {
  language: Lang;
  selectedRegion: string;
  selectedMonth: string;
};

const monthLabel = (iso: string | null, isZh: boolean) => {
  if (!iso) return '—';
  const short = iso.slice(0, 7);
  const [year, month] = short.split('-');
  const mNum = Number(month);
  if (!year || !mNum || Number.isNaN(mNum)) return short;
  if (isZh) return `${year}年${month}月`;
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${MONTHS[mNum - 1]} ${year}`;
};

export const UberAdsSection: React.FC<Props> = ({
  language,
  selectedRegion,
  selectedMonth,
}) => {
  const { loading, error, rows, summary, currentMonth, prevMonth } =
    useUberAds(selectedRegion, selectedMonth);

  const [sort, setSort] = useState<SortState>({
    key: 'roas',
    direction: 'desc',
  });

  const isZh = language === 'zh';

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const dir = sort.direction === 'asc' ? 1 : -1;

    copy.sort((a, b) => {
      const getValue = (row: UberAdRow): number | string => {
        switch (sort.key) {
          case 'store_name':
            return row.store_name;
          case 'adSales':
            return row.adSales;
          case 'adSpend':
            return row.adSpend;
          case 'dailyAdSpend':
            return row.dailyAdSpend;
          case 'roas':
            return row.roas;
          case 'roasDelta':
            return row.roasDelta ?? -Infinity;
          case 'cpo':
            return row.cpo;
        }
      };

      const va = getValue(a);
      const vb = getValue(b);

      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb) * dir;
      }
      if (va === vb) return 0;
      return va > vb ? dir : -dir;
    });
    return copy;
  }, [rows, sort]);

  const renderSortArrow = (key: SortKey) => {
    if (sort.key !== key) return ' ↕';
    return sort.direction === 'asc' ? ' ↑' : ' ↓';
  };

  if (loading) {
    return (
      <div style={{ fontSize: 13, padding: '12px 0' }}>
        {isZh ? '載入 Uber Ads 資料中…' : 'Loading Uber Ads data…'}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: 13, color: '#f97373' }}>
        {isZh ? '載入 Uber Ads 錯誤：' : 'Error loading Uber Ads: '}
        {error}
      </div>
    );
  }

  if (!summary || rows.length === 0) {
    return (
      <div style={{ fontSize: 13, color: '#9ca3af', padding: '12px 0' }}>
        {isZh
          ? '此區域 / 月份無 Uber Ads 數據。'
          : 'No Uber Ads data for this region / month.'}
      </div>
    );
  }

  return (
    <section>
      {/* Title */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            {isZh ? 'UBER ADS 廣告表現' : 'UBER ADS PERFORMANCE'}
          </h2>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>
            {isZh
              ? '門店層級的 Uber 廣告花費、ROAS 和效率分析。'
              : 'Store-level Uber ad spend, ROAS and efficiency.'}
          </p>
        </div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          {isZh ? `區域：${selectedRegion}` : `Region: ${selectedRegion}`}
          {' · '}
          {isZh ? '月份：' : 'Month: '}
          {monthLabel(currentMonth, isZh)}
        </div>
      </div>

      {/* KPI cards */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card">
          <div className="kpi-title">
            {isZh ? '廣告總銷售' : 'TOTAL AD SALES'}
          </div>
          <div className="kpi-value">{fmtCurrency(summary.totalAdSales)}</div>
          <div className="kpi-sub">
            {prevMonth && (
              <>
                vs {monthLabel(prevMonth, isZh)}{' · '}
                <span className={summary.totalAdSalesMom !== null && summary.totalAdSalesMom > 0 ? 'kpi-pos' : summary.totalAdSalesMom !== null && summary.totalAdSalesMom < 0 ? 'kpi-neg' : ''}>
                  {fmtPercent(summary.totalAdSalesMom)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            {isZh ? '廣告總單量' : 'TOTAL AD ORDERS'}
          </div>
          <div className="kpi-value">{fmtNumber(summary.totalAdOrders)}</div>
          <div className="kpi-sub">
            {prevMonth && (
              <>
                vs {monthLabel(prevMonth, isZh)}{' · '}
                <span className={summary.totalAdOrdersMom !== null && summary.totalAdOrdersMom > 0 ? 'kpi-pos' : summary.totalAdOrdersMom !== null && summary.totalAdOrdersMom < 0 ? 'kpi-neg' : ''}>
                  {fmtPercent(summary.totalAdOrdersMom)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            {isZh ? '平均 ROAS' : 'AVG ROAS'}
          </div>
          <div className="kpi-value">{fmtRoas(summary.avgRoas)}</div>
          <div className="kpi-sub">
            {prevMonth && (
              <>
                vs {monthLabel(prevMonth, isZh)}{' · '}
                <span style={deltaColor(summary.avgRoasMom)}>
                  {fmtRoasDelta(summary.avgRoasMom)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          borderRadius: 16,
          border: '1px solid #4b5563',
          background: '#020617',
          padding: '12px 16px',
          overflowX: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            fontSize: 12,
            color: '#e5e7eb',
            borderCollapse: 'collapse',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid #374151', color: '#9ca3af' }}>
              <th
                style={{ textAlign: 'left', padding: '6px 4px', cursor: 'pointer' }}
                onClick={() => handleSort('store_name')}
              >
                {isZh ? '門店' : 'Store'}
                {renderSortArrow('store_name')}
              </th>
              <th
                style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                onClick={() => handleSort('adSales')}
              >
                {isZh ? 'AD 銷售' : 'AD Sales'}
                {renderSortArrow('adSales')}
              </th>
              <th
                style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                onClick={() => handleSort('adSpend')}
              >
                {isZh ? 'AD 花費' : 'AD Spend'}
                {renderSortArrow('adSpend')}
              </th>
              <th
                style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                onClick={() => handleSort('dailyAdSpend')}
              >
                {isZh ? '每日 AD 花費' : 'Daily AD Spend'}
                {renderSortArrow('dailyAdSpend')}
              </th>
              <th
                style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                onClick={() => handleSort('roas')}
              >
                ROAS ▼{renderSortArrow('roas')}
              </th>
              <th
                style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                onClick={() => handleSort('roasDelta')}
              >
                {isZh ? 'ROAS Δ' : 'ROAS Δ'}
                {renderSortArrow('roasDelta')}
              </th>
              <th
                style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                onClick={() => handleSort('cpo')}
              >
                CPO{renderSortArrow('cpo')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.store_name}
                style={{ borderBottom: '1px solid #111827' }}
              >
                <td style={{ padding: '6px 4px' }}>{row.store_name}</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  {fmtCurrency(row.adSales)}
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  {fmtCurrencyDecimal(row.adSpend)}
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  {fmtCurrencyDecimal(row.dailyAdSpend)}
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  {fmtRoas(row.roas)}
                </td>
                <td
                  style={{
                    padding: '6px 4px',
                    textAlign: 'right',
                    ...deltaColor(row.roasDelta),
                  }}
                >
                  {fmtRoasDelta(row.roasDelta)}
                </td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                  {fmtCurrencyDecimal(row.cpo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
