// src/components/PlatformMatrix.tsx
import React, { useMemo, useState } from 'react';
import {
  usePlatformMatrix,
  type MatrixPlatformFilter,
} from '../hooks/usePlatformMatrix';
import type { Lang } from '../App';

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '$0';
  return '$' + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatAov(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return '$' + value.toLocaleString(undefined, { maximumFractionDigits: 1 });
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

const MONTH_COLORS = ['#3b82f6', '#f97316', '#a855f7'];

type SortKey =
  | 'store_name'
  | 'revenueCurrent'
  | 'revenuePrev'
  | 'revenueMom'
  | 'ordersCurrent'
  | 'ordersMom'
  | 'aovCurrent'
  | 'aovMom';

type SortState = {
  key: SortKey;
  direction: 'asc' | 'desc';
};

type Props = {
  language: Lang;
  selectedRegion: string;
  selectedMonth: string;
};

const PLATFORM_OPTIONS: {
  value: MatrixPlatformFilter;
  labelEn: string;
  labelZh: string;
}[] = [
  { value: 'ALL', labelEn: 'All', labelZh: '全平台' },
  { value: 'UBER', labelEn: 'Uber', labelZh: 'Uber' },
  { value: 'Fantuan', labelEn: 'Fantuan', labelZh: 'Fantuan' },
  { value: 'Doordash', labelEn: 'Doordash', labelZh: 'Doordash' },
];

const platformLabel = (value: MatrixPlatformFilter, isZh: boolean) => {
  switch (value) {
    case 'ALL':
      return isZh ? '全平台總和' : 'All platforms';
    case 'UBER':
      return 'UBER';
    case 'Fantuan':
      return 'Fantuan';
    case 'Doordash':
      return 'Doordash';
    default:
      return value;
  }
};

const monthLabel = (iso: string, lang: Lang) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    year: 'numeric',
  };
  // zh 就用 zh-TW，其他用 en-CA
  return d.toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en-CA', opts);
};

export const PlatformMatrix: React.FC<Props> = ({
  language,
  selectedRegion,
  selectedMonth,
}) => {
  const [platformFilter, setPlatformFilter] =
    useState<MatrixPlatformFilter>('ALL');

  const {
    loading,
    error,
    currentMonth,
    prevMonth,
    rows,
    trendMonths,
    trendSeries,
  } = usePlatformMatrix(selectedRegion, selectedMonth, platformFilter);

  const [sort, setSort] = useState<SortState>({
    key: 'revenueCurrent',
    direction: 'desc',
  });

  const isZh = language === 'zh';

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
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
          case 'store_name':
            return row.store_name;
          case 'revenueCurrent':
            return row.revenueCurrent;
          case 'revenuePrev':
            return row.revenuePrev ?? -Infinity;
          case 'revenueMom':
            return row.revenueMom ?? -Infinity;
          case 'ordersCurrent':
            return row.ordersCurrent;
          case 'ordersMom':
            return row.ordersMom ?? -Infinity;
          case 'aovCurrent':
            return row.aovCurrent;
          case 'aovMom':
            return row.aovMom ?? -Infinity;
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

  // 給長條圖用的最大值
  const maxTrendValue = useMemo(() => {
    let max = 0;
    for (const s of trendSeries) {
      for (const v of s.values) {
        if (v > max) max = v;
      }
    }
    return max;
  }, [trendSeries]);

  return (
    <section>
      {/* 標題列 + 平台篩選器（同一層級高度） */}
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
            {isZh ? '多平台動能矩陣' : 'Platform Velocity Matrix'}
          </h2>
          <p style={{ fontSize: 13, color: '#9ca3af' }}>
            {isZh
              ? '各平台門店營收、單量與客單價的 MoM 表現，點擊欄位可排序。'
              : 'Store-level performance by platform (revenue, orders, AOV). Click headers to sort.'}
          </p>
        </div>

        {/* 平台篩選器：整個板塊共用 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, color: '#9ca3af' }}>
            {isZh ? '平台：' : 'Platform:'}
          </span>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: 2,
              borderRadius: 9999,
              border: '1px solid #374151',
              background: '#020617',
            }}
          >
            {PLATFORM_OPTIONS.map((opt) => {
              const active = platformFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setPlatformFilter(opt.value)}
                  style={{
                    border: 'none',
                    borderRadius: 9999,
                    padding: '2px 8px',
                    fontSize: 11,
                    cursor: 'pointer',
                    background: active ? '#1f2937' : 'transparent',
                    color: active ? '#f9fafb' : '#9ca3af',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  {isZh ? opt.labelZh : opt.labelEn}
                </button>
              );
            })}
          </div>
        </div>
      </div>

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
          {/* 卡片上方：區域＋月份（平台已移到標題列） */}
          <div
            style={{
              fontSize: 11,
              color: '#6b7280',
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span>
              {isZh
                ? `${selectedRegion} — 門店層級`
                : `${selectedRegion} — Store Level`}
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

          {/* 表格 */}
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

                {/* 營收 */}
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 4px',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleSort('revenueCurrent')}
                >
                  {isZh ? '當月營收' : 'Curr revenue'}
                  {renderSortArrow('revenueCurrent')}
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 4px',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleSort('revenuePrev')}
                >
                  {isZh ? '前一月營收' : 'Prev revenue'}
                  {renderSortArrow('revenuePrev')}
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 4px',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleSort('revenueMom')}
                >
                  {isZh ? '營收 MoM' : 'Rev MoM'}
                  {renderSortArrow('revenueMom')}
                </th>

                {/* 單量 */}
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 4px',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleSort('ordersCurrent')}
                >
                  {isZh ? '當月單量' : 'Curr orders'}
                  {renderSortArrow('ordersCurrent')}
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 4px',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleSort('ordersMom')}
                >
                  {isZh ? '單量變化' : 'Orders MoM'}
                  {renderSortArrow('ordersMom')}
                </th>

                {/* 客單價 */}
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 4px',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleSort('aovCurrent')}
                >
                  {isZh ? '當月客單價' : 'Curr AOV'}
                  {renderSortArrow('aovCurrent')}
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 4px',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleSort('aovMom')}
                >
                  {isZh ? '客單價變化' : 'AOV MoM'}
                  {renderSortArrow('aovMom')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr
                  key={`${row.region}-${row.store_name}`}
                  style={{ borderBottom: '1px solid #111827' }}
                >
                  <td style={{ padding: '6px 4px' }}>{row.store_name}</td>

                  {/* 營收 */}
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    {formatCurrency(row.revenueCurrent)}
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    {row.revenuePrev != null
                      ? formatCurrency(row.revenuePrev)
                      : '—'}
                  </td>
                  <td
                    style={{
                      padding: '6px 4px',
                      textAlign: 'right',
                      ...momCellStyle(row.revenueMom),
                    }}
                  >
                    {formatPercent(row.revenueMom)}
                  </td>

                  {/* 單量 */}
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    {formatNumber(row.ordersCurrent)}
                  </td>
                  <td
                    style={{
                      padding: '6px 4px',
                      textAlign: 'right',
                      ...momCellStyle(row.ordersMom),
                    }}
                  >
                    {formatPercent(row.ordersMom)}
                  </td>

                  {/* 客單價 */}
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                    {formatAov(row.aovCurrent)}
                  </td>
                  <td
                    style={{
                      padding: '6px 4px',
                      textAlign: 'right',
                      ...momCellStyle(row.aovMom),
                    }}
                  >
                    {formatPercent(row.aovMom)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 近三個月門店長條圖 */}
          {trendMonths.length > 0 && trendSeries.length > 0 && maxTrendValue > 0 && (
            <>
              <div
                style={{
                  height: 1,
                  background: '#111827',
                  margin: '12px 0 10px',
                }}
              />
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: '#e5e7eb',
                    marginBottom: 2,
                  }}
                >
                  {isZh
                    ? '近三個月門店營收趨勢'
                    : '3-month store revenue trend'}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  {isZh ? '平台：' : 'Platform: '}{' '}
                  {platformLabel(platformFilter, isZh)}
                </div>
              </div>

              <div
                style={{
                  position: 'relative',
                  height: 190,
                  padding: '10px 0 12px',
                  overflowX: 'auto',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 14,
                    height: '100%',
                    paddingRight: 8,
                  }}
                >
                  {trendSeries.map((series) => (
                    <div
                      key={`${series.region}-${series.store_name}`}
                      style={{
                        minWidth: 56,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                      }}
                    >
                      {/* bars */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          gap: 4,
                          height: 140,
                        }}
                      >
                        {series.values.map((v, idx) => {
                          const height =
                            maxTrendValue > 0
                              ? Math.max(
                                  4,
                                  (v / maxTrendValue) * 120, // 120px 讓上方還有空間放數字
                                )
                              : 4;
                          return (
                            <div
                              key={idx}
                              style={{
                                position: 'relative',
                                width: 10,
                                borderRadius: 9999,
                                backgroundColor:
                                  MONTH_COLORS[idx % MONTH_COLORS.length],
                                height,
                              }}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: height + 2,
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  fontSize: 9,
                                  color: '#e5e7eb',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {v === 0 ? '0' : v.toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          color: '#9ca3af',
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {series.store_name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 月份 legend */}
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  fontSize: 10,
                  color: '#9ca3af',
                  marginTop: 4,
                  flexWrap: 'wrap',
                }}
              >
                {trendMonths.map((m, idx) => (
                  <div
                    key={m}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 9999,
                        backgroundColor:
                          MONTH_COLORS[idx % MONTH_COLORS.length],
                      }}
                    />
                    <span>{monthLabel(m, language)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};


