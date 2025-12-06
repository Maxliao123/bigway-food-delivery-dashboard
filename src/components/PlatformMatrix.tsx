// src/components/PlatformMatrix.tsx
import React, { useMemo, useState } from 'react';
import { usePlatformMatrix } from '../hooks/usePlatformMatrix';
import type { Lang } from '../App';

function formatCurrency(value: number): string {
  return '$' + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  const pct = (value * 100).toFixed(1);
  return `${pct}%`;
}

function momCellStyle(mom: number | null): React.CSSProperties {
  if (mom === null || Number.isNaN(mom)) {
    return { color: '#9ca3af' };
  }
  if (mom > 0) {
    return { color: '#22c55e' }; // 綠
  }
  if (mom < 0) {
    return { color: '#f97373' }; // 紅
  }
  return { color: '#9ca3af' };
}

type SortKey =
  | 'region'
  | 'store_name'
  | 'uberCurrent'
  | 'uberPrev'
  | 'uberMom'
  | 'fantuanCurrent'
  | 'fantuanPrev'
  | 'fantuanMom';

type SortState = {
  key: SortKey;
  direction: 'asc' | 'desc';
};

type Props = {
  language: Lang;
};

export const PlatformMatrix: React.FC<Props> = ({ language }) => {
  const { loading, error, currentMonth, prevMonth, rows } = usePlatformMatrix();
  const [sort, setSort] = useState<SortState>({
    key: 'region',
    direction: 'asc',
  });

  const isZh = language === 'zh';

  const handleSort = (key: SortKey) => {
    setSort(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const dir = sort.direction === 'asc' ? 1 : -1;

      const getValue = (row: (typeof rows)[number]): any => {
        switch (sort.key) {
          case 'region':
            return row.region;
          case 'store_name':
            return row.store_name;
          case 'uberCurrent':
            return row.uberCurrent;
          case 'uberPrev':
            return row.uberPrev ?? -Infinity;
          case 'uberMom':
            return row.uberMom ?? -Infinity;
          case 'fantuanCurrent':
            return row.fantuanCurrent;
          case 'fantuanPrev':
            return row.fantuanPrev ?? -Infinity;
          case 'fantuanMom':
            return row.fantuanMom ?? -Infinity;
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

  return (
    <section>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
        {isZh ? '多平台動能矩陣' : 'Platform Velocity Matrix'}
      </h2>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
        {isZh
          ? 'Uber / Fantuan 各門店營收與 MoM 表現，點擊欄位可排序。'
          : 'Uber vs Fantuan revenue and MoM by store. Click headers to sort.'}
      </p>

      {loading && (
        <div style={{ fontSize: 13 }}>
          {isZh ? '正在載入平台資料…' : 'Loading platform data...'}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: '#f97373' }}>
          {isZh ? '載入平台矩陣發生錯誤：' : 'Error loading platform matrix: '}
          {error}
        </div>
      )}

      {!loading && !error && (
        <div
          style={{
            borderRadius: 16,
            border: '1px solid #4b5563',
            background: '#020617',
            padding: '12px 16px',
            overflowX: 'auto',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: '#6b7280',
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>
              {isZh
                ? 'BC / ON / CA — 門店層級'
                : 'BC / ON / CA — Store Level'}
            </span>
            <span>
              {isZh ? '當月：' : 'Current: '}
              {currentMonth ?? '—'}
              {prevMonth
                ? isZh
                  ? ` · 前一月：${prevMonth}`
                  : ` · Prev: ${prevMonth}`
                : ''}
            </span>
          </div>

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
                  onClick={() => handleSort('region')}
                >
                  {isZh ? '區域' : 'Region'}
                  {renderSortArrow('region')}
                </th>
                <th
                  style={{ textAlign: 'left', padding: '6px 4px', cursor: 'pointer' }}
                  onClick={() => handleSort('store_name')}
                >
                  {isZh ? '門店' : 'Store'}
                  {renderSortArrow('store_name')}
                </th>
                <th
                  style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                  onClick={() => handleSort('uberCurrent')}
                >
                  {isZh ? 'Uber 當月' : 'Uber Current'}
                  {renderSortArrow('uberCurrent')}
                </th>
                <th
                  style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                  onClick={() => handleSort('uberPrev')}
                >
                  {isZh ? 'Uber 前一月' : 'Uber Prev'}
                  {renderSortArrow('uberPrev')}
                </th>
                <th
                  style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                  onClick={() => handleSort('uberMom')}
                >
                  {isZh ? 'Uber MoM' : 'Uber MoM'}
                  {renderSortArrow('uberMom')}
                </th>
                <th
                  style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                  onClick={() => handleSort('fantuanCurrent')}
                >
                  {isZh ? 'Fantuan 當月' : 'Fantuan Current'}
                  {renderSortArrow('fantuanCurrent')}
                </th>
                <th
                  style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                  onClick={() => handleSort('fantuanPrev')}
                >
                  {isZh ? 'Fantuan 前一月' : 'Fantuan Prev'}
                  {renderSortArrow('fantuanPrev')}
                </th>
                <th
                  style={{ textAlign: 'right', padding: '6px 4px', cursor: 'pointer' }}
                  onClick={() => handleSort('fantuanMom')}
                >
                  {isZh ? 'Fantuan MoM' : 'Fantuan MoM'}
                  {renderSortArrow('fantuanMom')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => (
                <tr
                  key={`${row.region}-${row.store_name}`}
                  style={{ borderBottom: '1px solid #111827' }}
                >
                  <td style={{ padding: '6px 4px' }}>{row.region}</td>
                  <td style={{ padding: '6px 4px' }}>{row.store_name}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    {row.uberCurrent ? formatCurrency(row.uberCurrent) : '—'}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    {row.uberPrev !== null ? formatCurrency(row.uberPrev) : '—'}
                  </td>
                  <td
                    style={{
                      padding: '6px 4px',
                      textAlign: 'right',
                      ...momCellStyle(row.uberMom),
                    }}
                  >
                    {formatPercent(row.uberMom)}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    {row.fantuanCurrent
                      ? formatCurrency(row.fantuanCurrent)
                      : '—'}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    {row.fantuanPrev !== null
                      ? formatCurrency(row.fantuanPrev)
                      : '—'}
                  </td>
                  <td
                    style={{
                      padding: '6px 4px',
                      textAlign: 'right',
                      ...momCellStyle(row.fantuanMom),
                    }}
                  >
                    {formatPercent(row.fantuanMom)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
