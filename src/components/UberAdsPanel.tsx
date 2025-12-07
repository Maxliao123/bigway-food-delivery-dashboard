// src/components/UberAdsPanel.tsx
import React from 'react';
import type { Lang } from '../App';
import { useUberAdsMetrics } from '../hooks/useUberAdsMetrics';

function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return (
    '$' +
    Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })
  );
}

function formatCurrency1(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return (
    '$' +
    Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })
  );
}

function formatPercentDelta(
  curr: number | null | undefined,
  prev: number | null | undefined,
): string {
  if (
    curr == null ||
    prev == null ||
    !Number.isFinite(curr) ||
    !Number.isFinite(prev) ||
    prev === 0
  )
    return '—';

  const delta = (curr / prev - 1) * 100;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

type Props = {
  language: Lang;
  selectedRegion: string;
  selectedMonth: string; // '2025-10'
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

  // 算 Daily spend 用
  const [yr, mo] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();

  return (
    <section style={{ marginTop: 16 }}>
      <div
        style={{
          borderRadius: 16,
          border: '1px solid #4b5563',
          background: '#020617',
          padding: '12px 16px 16px',
        }}
      >
        {/* 標題 + Legend 區 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 12,
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>
              {isZh ? 'Uber 廣告成效總覽' : 'Uber Ads Performance'}
            </h2>
            <p style={{ fontSize: 12, color: '#9ca3af' }}>
              {isZh
                ? '依門店顯示當月 Uber 廣告花費與 ROAS。數值會跟上方地區與月份篩選同步。'
                : 'Store-level Uber ads spend and ROAS, following the Region & Analysis month filters.'}
            </p>
          </div>

          {/* 右側小說明 (類似 legend 位置) */}
          <div
            style={{
              fontSize: 10,
              color: '#9ca3af',
              textAlign: 'right',
              maxWidth: 260,
            }}
          >
            {isZh
              ? '資料來源：Uber Ads 報表（僅包含 Uber 廣告投放，不含 Fantuan / DoorDash）。'
              : 'Source: Uber Ads report only (Fantuan / DoorDash not included).'}
          </div>
        </div>

        {loading && (
          <div style={{ fontSize: 12 }}>
            {isZh ? '正在載入 Uber 廣告數據…' : 'Loading Uber ads metrics...'}
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: '#f97373' }}>
            {isZh ? '載入失敗：' : 'Failed to load: '}
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            {isZh
              ? '此地區與月份暫無 Uber 廣告數據。'
              : 'No Uber ads data for this region and month.'}
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: 4 }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
                color: '#e5e7eb',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #374151', color: '#9ca3af' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '6px 4px',
                      minWidth: 100,
                    }}
                  >
                    {isZh ? '店名' : 'Store'}
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 4px' }}>
                    Spend
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 4px' }}>
                    Spend Δ%
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 4px' }}>
                    {isZh ? '日均 Spend' : 'Daily spend'}
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 4px' }}>
                    ROAS
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 4px' }}>
                    ROAS Δ%
                  </th>
                  <th style={{ textAlign: 'right', padding: '6px 4px' }}>
                    {isZh ? '每單平均成本' : 'Avg cost / order'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ store_name, curr, prev }) => {
                  const spend = curr?.spend ?? null;
                  const spendDeltaPct = formatPercentDelta(
                    curr?.spend ?? null,
                    prev?.spend ?? null,
                  );
                  const dailySpend =
                    spend != null
                      ? (spend / daysInMonth)
                      : null;

                  const roas = curr?.roas ?? null;
                  const roasDeltaPct = formatPercentDelta(
                    curr?.roas ?? null,
                    prev?.roas ?? null,
                  );

                  const avgCost = curr?.avg_cost_per_order ?? null;

                  return (
                    <tr
                      key={store_name}
                      style={{ borderBottom: '1px solid #111827' }}
                    >
                      <td style={{ padding: '6px 4px' }}>{store_name}</td>
                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                        {formatCurrency(spend)}
                      </td>
                      <td
                        style={{
                          padding: '6px 4px',
                          textAlign: 'right',
                          color:
                            spendDeltaPct.startsWith('+')
                              ? '#22c55e'
                              : spendDeltaPct.startsWith('-')
                              ? '#f97373'
                              : '#9ca3af',
                        }}
                      >
                        {spendDeltaPct}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                        {formatCurrency1(dailySpend)}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                        {roas == null || !Number.isFinite(roas)
                          ? '—'
                          : roas.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: '6px 4px',
                          textAlign: 'right',
                          color:
                            roasDeltaPct.startsWith('+')
                              ? '#22c55e'
                              : roasDeltaPct.startsWith('-')
                              ? '#f97373'
                              : '#9ca3af',
                        }}
                      >
                        {roasDeltaPct}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                        {formatCurrency1(avgCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
