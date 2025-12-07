// src/components/UberAdsPanel.tsx
import React, { useMemo, useState } from 'react';
import type { Lang } from '../App';
import {
  useUberAdsMetrics,
  type UberAdsMetricRow,
} from '../hooks/useUberAdsMetrics';

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '$0';
  return (
    '$' +
    value.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })
  );
}

function formatNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

function formatPercent(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  const pct = value * 100;
  return `${pct.toFixed(1)}%`;
}

function momCellStyle(v: number | null): React.CSSProperties {
  if (v == null || Number.isNaN(v)) {
    return { color: '#9ca3af' };
  }
  if (v > 0) return { color: '#22c55e' }; // 綠
  if (v < 0) return { color: '#f97373' }; // 紅
  return { color: '#9ca3af' };
}

type Props = {
  language: Lang;
  selectedRegion: string;
  selectedMonth: string; // YYYY-MM-01，跟其他 hooks 一樣
};

type SortKey =
  | 'store_name'
  | 'spend'
  | 'spend_delta_pct'
  | 'daily_spend'
  | 'roas'
  | 'roas_delta_pct'
  | 'avg_cost_per_order';

type SortState = {
  key: SortKey;
  direction: 'asc' | 'desc';
};

const monthLabel = (iso: string, lang: Lang) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  return d.toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en-CA', {
    month: 'short',
    year: 'numeric',
  });
};

export const UberAdsPanel: React.FC<Props> = ({
  language,
  selectedRegion,
  selectedMonth,
}) => {
  const isZh = language === 'zh';

  const { loading, error, rows } = useUberAdsMetrics(
    selectedRegion,
    selectedMonth,
  );

  const [sort, setSort] = useState<SortState>({
    key: 'spend',
    direction: 'desc',
  });

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

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const dir = sort.direction === 'asc' ? 1 : -1;

    copy.sort((a, b) => {
      const va = a[sort.key] as number | string | null | undefined;
      const vb = b[sort.key] as number | string | null | undefined;

      // store_name 用字串比較
      if (sort.key === 'store_name') {
        return String(va ?? '').localeCompare(String(vb ?? '')) * dir;
      }

      const na = typeof va === 'number' ? va : va == null ? -Infinity : Number(va);
      const nb = typeof vb === 'number' ? vb : vb == null ? -Infinity : Number(vb);

      if (na === nb) return 0;
      return na > nb ? dir : -dir;
    });

    return copy;
  }, [rows, sort]);

  const renderSortArrow = (key: SortKey) => {
    if (sort.key !== key) return ' ↕';
    return sort.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const monthDisplay = selectedMonth
    ? monthLabel(selectedMonth, language)
    : '—';

  return (
    <section style={{ marginTop: 16 }}>
      <div
        style={{
          borderRadius: 16,
          border: '1px solid #4b5563',
          background: '#020617',
          padding: '12px 16px',
          overflowX: 'auto',
        }}
      >
        {/* 標題列 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {isZh ? 'Uber 廣告成效' : 'Uber Ads performance'}
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              {isZh
                ? '各門店在 Uber 廣告上的投放與 ROAS 表現。'
                : 'Store-level Uber ad spend, ROAS and efficiency.'}
            </p>
          </div>

          <div
            style={{
              fontSize: 11,
              color: '#6b7280',
              textAlign: 'right',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              gap: 2,
            }}
          >
            <span>
              {isZh ? '區域：' : 'Region: '}
              {selectedRegion || '—'}
            </span>
            <span>
              {isZh ? '月份：' : 'Month: '}
              {monthDisplay}
            </span>
          </div>
        </div>

        {loading && (
          <div style={{ fontSize: 13 }}>
            {isZh ? '正在載入 Uber 廣告數據…' : 'Loading Uber Ads metrics...'}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: '#f97373' }}>
            {isZh
              ? '載入 Uber 廣告數據發生錯誤：'
              : 'Error loading Uber Ads metrics: '}
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {rows.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                {isZh
                  ? '此區域與月份暫無 Uber 廣告資料。'
                  : 'No Uber Ads data for this region and month.'}
              </div>
            ) : (
              <table
                style={{
                  width: '100%',
                  fontSize: 12,
                  color: '#e5e7eb',
                  borderCollapse: 'collapse',
                  marginTop: 4,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #374151',
                      color: '#9ca3af',
                    }}
                  >
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSort('store_name')}
                    >
                      {isZh ? '店名' : 'Store'}
                      {renderSortArrow('store_name')}
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSort('spend')}
                    >
                      {isZh ? '廣告花費' : 'Spend'}
                      {renderSortArrow('spend')}
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSort('spend_delta_pct')}
                    >
                      {isZh ? '花費變化' : 'Spend Δ%'}
                      {renderSortArrow('spend_delta_pct')}
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSort('daily_spend')}
                    >
                      {isZh ? '日均花費' : 'Daily spend'}
                      {renderSortArrow('daily_spend')}
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSort('roas')}
                    >
                      ROAS
                      {renderSortArrow('roas')}
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSort('roas_delta_pct')}
                    >
                      {isZh ? 'ROAS 變化' : 'ROAS Δ%'}
                      {renderSortArrow('roas_delta_pct')}
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleSort('avg_cost_per_order')}
                    >
                      {isZh ? '平均每單成本' : 'Avg cost / order'}
                      {renderSortArrow('avg_cost_per_order')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row: UberAdsMetricRow) => (
                    <tr
                      key={`${row.region}-${row.store_name}-${row.month_date}`}
                      style={{ borderBottom: '1px solid #111827' }}
                    >
                      <td style={{ padding: '6px 4px' }}>{row.store_name}</td>
                      <td
                        style={{
                          padding: '6px 4px',
                          textAlign: 'right',
                        }}
                      >
                        {formatCurrency(row.spend)}
                      </td>
                      <td
                        style={{
                          padding: '6px 4px',
                          textAlign: 'right',
                          ...momCellStyle(row.spend_delta_pct),
                        }}
                      >
                        {formatPercent(row.spend_delta_pct)}
                      </td>
                      <td
                        style={{
                          padding: '6px 4px',
                          textAlign: 'right',
                        }}
                      >
                        {formatCurrency(row.daily_spend)}
                      </td>
                      <td
                        style={{
                          padding: '6px 4px',
                          textAlign: 'right',
                        }}
                      >
                        {row.roas == null || !Number.isFinite(row.roas)
                          ? '—'
                          : row.roas.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: '6px 4px',
                          textAlign: 'right',
                          ...momCellStyle(row.roas_delta_pct),
                        }}
                      >
                        {formatPercent(row.roas_delta_pct)}
                      </td>
                      <td
                        style={{
                          padding: '6px 4px',
                          textAlign: 'right',
                        }}
                      >
                        {formatCurrency(row.avg_cost_per_order)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default UberAdsPanel;
