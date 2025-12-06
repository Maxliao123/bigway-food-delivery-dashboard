// src/components/StoreHeatmap.tsx
import React, { useMemo } from 'react';
import { useMoMHeatmap } from '../hooks/useMoMHeatmap';
import {
  formatMonthLabel,
  formatPercent,
  getMoMColor,
} from '../lib/heatmapUtils';
import type { Lang } from '../App';

type Props = {
  language: Lang;
  selectedRegion: string | null;
};

export const StoreHeatmap: React.FC<Props> = ({ language, selectedRegion }) => {
  const { loading, error, months, rows } = useMoMHeatmap();
  const isZh = language === 'zh';

  const { periodMonths, stores, momByStore } = useMemo(() => {
    const periodMonths = months.slice(-3);

    if (!selectedRegion) {
      return { periodMonths, stores: [] as string[], momByStore: {} as any };
    }

    const filtered = rows.filter((r) => r.region === selectedRegion);

    const stores = Array.from(new Set(filtered.map((r) => r.store_name)));

    const revenueByStore: Record<string, Record<string, number>> = {};
    for (const r of filtered) {
      if (!periodMonths.includes(r.month)) continue;
      if (!revenueByStore[r.store_name]) revenueByStore[r.store_name] = {};
      revenueByStore[r.store_name][r.month] =
        (revenueByStore[r.store_name][r.month] || 0) + r.revenue;
    }

    const momByStore: Record<string, Record<string, number | null>> = {};
    for (const store of stores) {
      momByStore[store] = {};
      const revs = periodMonths.map((m) => revenueByStore[store]?.[m] ?? 0);

      periodMonths.forEach((month, idx) => {
        if (idx === 0) {
          momByStore[store][month] = null;
          return;
        }

        const prev = revs[idx - 1];
        const curr = revs[idx];

        if (!prev || !curr || prev === 0 || curr === 0) {
          momByStore[store][month] = null;
        } else {
          momByStore[store][month] = (curr - prev) / prev;
        }
      });
    }

    const latestMonth = periodMonths[periodMonths.length - 1];
    stores.sort((a, b) => {
      const ma = momByStore[a]?.[latestMonth] ?? 0;
      const mb = momByStore[b]?.[latestMonth] ?? 0;
      return ma - mb;
    });

    return { periodMonths, stores, momByStore };
  }, [months, rows, selectedRegion]);

  if (loading) {
    return (
      <div style={{ fontSize: 13, color: '#9ca3af' }}>
        {isZh ? '載入門店 MoM 中…' : 'Loading store-level MoM...'}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: 13, color: '#f97373' }}>
        {isZh ? '載入門店 Heatmap 發生錯誤：' : 'Error loading store heatmap: '}
        {error}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: '#9ca3af',
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>
          {isZh ? '門店視圖（月份與上方相同）' : 'Store view (same months as above)'}
        </span>
        <span style={{ fontSize: 11 }}>
          {selectedRegion
            ? isZh
              ? `顯示區域 ${selectedRegion} 的門店，依最新 MoM 由差到好排序。`
              : `Showing stores in ${selectedRegion} · sorted by latest MoM (worst → best)`
            : isZh
            ? '請先在上方選擇一個區域查看門店層級 MoM。'
            : 'Select a region above to see store-level MoM.'}
        </span>
      </div>

      {!selectedRegion && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {isZh ? '尚未選擇區域。' : 'No region selected.'}
        </div>
      )}

      {selectedRegion && stores.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: 420 }}>
          <table
            style={{
              width: '100%',
              fontSize: 12,
              color: '#e5e7eb',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '6px 4px',
                    fontWeight: 500,
                    color: '#9ca3af',
                  }}
                >
                  {isZh ? '門店' : 'Store'}
                </th>
                {periodMonths.map((m) => (
                  <th
                    key={m}
                    style={{
                      textAlign: 'right',
                      padding: '6px 4px',
                      fontWeight: 500,
                      color: '#9ca3af',
                    }}
                  >
                    {formatMonthLabel(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store} style={{ borderBottom: '1px solid #111827' }}>
                  <td style={{ padding: '6px 4px' }}>{store}</td>
                  {periodMonths.map((month) => {
                    const mom = momByStore[store]?.[month] ?? null;
                    return (
                      <td
                        key={month}
                        style={{
                          padding: '4px 6px',
                          textAlign: 'right',
                        }}
                      >
                        <div
                          style={{
                            borderRadius: 6,
                            padding: '3px 6px',
                            backgroundColor: getMoMColor(mom),
                            color: '#f9fafb',
                            fontVariantNumeric: 'tabular-nums',
                            minWidth: 70,
                            display: 'inline-block',
                          }}
                        >
                          {formatPercent(mom)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedRegion && stores.length === 0 && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {isZh
            ? '此區域目前沒有門店資料。'
            : 'No store data found for this region.'}
        </div>
      )}
    </div>
  );
};
