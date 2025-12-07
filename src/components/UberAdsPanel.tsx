// src/components/UberAdsPanel.tsx
import React, { useMemo } from 'react';
import type { Lang } from '../App';
import { useUberAdsMetrics } from '../hooks/useUberAdsMetrics';
import type { UberAdsMetricRow } from '../hooks/useUberAdsMetrics';

type Props = {
  language: Lang;
  selectedRegion: string;
  currentMonthIso: string | null;
  prevMonthIso: string | null;
};

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

  const sortedRows: UberAdsMetricRow[] = useMemo(() => {
    const copy = [...rows];
    // 依當月 spend 由高到低排序
    copy.sort((a, b) => (b.curr.spend ?? 0) - (a.curr.spend ?? 0));
    return copy;
  }, [rows]);

  const monthText = monthLabel(currentMonthIso, language);

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
          {/* 這裡調整字級／字體，靠齊「Platform breakdown — Total revenue」 */}
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
        </div>

        {/* 如果你還保留 Region / Month，可以讓它留著 */}
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
            {isZh ? '月份：' : 'Month: '}
            {monthText}
          </span>
        </div>
      </div>

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
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isZh ? '店名' : 'Store'}
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Spend
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Spend Δ%
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isZh ? '日均花費' : 'Daily spend'}
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ROAS
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ROAS Δ%
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '6px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isZh ? '平均每單成本' : 'Average cost per order'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => {
                    const spendDelta = formatPercentDelta(row.spend_delta_pct);
                    const roasDelta = formatPercentDelta(row.roas_delta_pct);

                    return (
                      <tr
                        key={`${row.region}-${row.store_name}`}
                        style={{ borderBottom: '1px solid #111827' }}
                      >
                        <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                          {row.store_name}
                        </td>
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {formatCurrency(row.curr.spend)}
                        </td>
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                            color: spendDelta.color,
                          }}
                        >
                          {spendDelta.text}
                        </td>
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {formatCurrency(row.curr.daily_spend)}
                        </td>
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {formatRoas(row.curr.roas)}
                        </td>
                        <td
                          style={{
                            padding: '6px 4px',
                            textAlign: 'right',
                            color: roasDelta.color,
                          }}
                        >
                          {roasDelta.text}
                        </td>
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

