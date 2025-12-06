// src/components/RegionHeatmap.tsx
import React, { useMemo } from 'react';
import { useMoMHeatmap } from '../hooks/useMoMHeatmap';
import {
  formatMonthLabel,
  formatPercent,
  getMoMColor,
} from '../lib/heatmapUtils';
import type { Lang, Scope } from '../App';

type Props = {
  language: Lang;
  selectedRegion: Scope | null;
  selectedMonth: string;
  onSelectRegion: (region: Scope) => void;
  selectedRegion: string | null;
  selectedMonth: string;
  onSelectRegion: (region: string) => void;
};

export const RegionHeatmap: React.FC<Props> = ({
  language,
  selectedRegion,
  selectedMonth,
  onSelectRegion,
}) => {
  const { loading, error, months, rows } = useMoMHeatmap();
  const isZh = language === 'zh';

  const { periodMonths, regions, momByRegion } = useMemo(() => {
    const selectedIdx = months.indexOf(selectedMonth);
    const periodMonths =
      selectedIdx === -1
        ? months.slice(-3)
        : months.slice(Math.max(0, selectedIdx - 2), selectedIdx + 1);
    const allRegions = Array.from(new Set(rows.map(r => r.region))).filter(
      (r): r is Scope => ['BC', 'ON', 'CA'].includes(r as Scope)
    );
    const regions: Scope[] = selectedRegion ? [selectedRegion] : allRegions.sort();
    const regions = selectedRegion
      ? [selectedRegion]
      : Array.from(new Set(rows.map(r => r.region))).sort();

    const revenueByRegion: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (!periodMonths.includes(r.month)) continue;
      if (selectedRegion && r.region !== selectedRegion) continue;
      if (!revenueByRegion[r.region]) revenueByRegion[r.region] = {};
      revenueByRegion[r.region][r.month] =
        (revenueByRegion[r.region][r.month] || 0) + r.revenue;
    }

    const momByRegion: Record<string, Record<string, number | null>> = {};
    for (const region of regions) {
      momByRegion[region] = {};
      const revs = periodMonths.map(m => revenueByRegion[region]?.[m] ?? 0);

      periodMonths.forEach((month, idx) => {
        if (idx === 0) {
          momByRegion[region][month] = null;
          return;
        }
        const prev = revs[idx - 1];
        const curr = revs[idx];
        if (!prev || prev === 0) {
          momByRegion[region][month] = null;
        } else {
          momByRegion[region][month] = (curr - prev) / prev;
        }
      });
    }

    return { periodMonths, regions, momByRegion };
  }, [months, rows, selectedMonth, selectedRegion]);

  if (loading) {
    return (
      <div style={{ fontSize: 13, color: '#9ca3af' }}>
        {isZh ? '載入區域 MoM 中…' : 'Loading region-level MoM...'}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: 13, color: '#f97373' }}>
        {isZh ? '載入區域 Heatmap 發生錯誤：' : 'Error loading region heatmap: '}
        {error}
      </div>
    );
  }

  if (periodMonths.length === 0 || regions.length === 0) return null;

  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: '#9ca3af',
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          {isZh
            ? '區域視圖（點擊列可向下鑽取）'
            : 'Region view (click a row to drill down)'}
        </span>
        {selectedRegion && (
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid #4b5563',
              background: '#020617',
            }}
          >
            {isZh ? '目前選擇區域：' : 'Selected region: '}
            <strong>{selectedRegion}</strong>
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
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
                {isZh ? '區域' : 'Region'}
              </th>
              {periodMonths.map(m => (
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
            {regions.map(region => (
              <tr
                key={region}
                style={{
                  borderBottom: '1px solid #111827',
                  cursor: 'pointer',
                  backgroundColor:
                    selectedRegion === region
                      ? 'rgba(55,65,81,0.9)'
                      : 'transparent',
                }}
                onClick={() => onSelectRegion(region)}
              >
                <td style={{ padding: '6px 4px', fontWeight: 500 }}>{region}</td>
                {periodMonths.map(month => {
                  const mom = momByRegion[region]?.[month] ?? null;
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
    </div>
  );
};
