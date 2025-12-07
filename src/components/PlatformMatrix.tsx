// src/components/PlatformMatrix.tsx
import React, { useMemo, useState } from 'react';
import {
  usePlatformMatrix,
  type MatrixPlatformFilter,
} from '../hooks/usePlatformMatrix';
import type { Lang } from '../App';

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '$0';
  return (
    '$' +
    value.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })
  );
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatAov(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return (
    '$' +
    value.toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })
  );
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

// 灰階：前兩個月份用
const NEUTRAL_BAR_COLORS = ['#4b5563', '#6b7280'];

// 各平台「最新月份」高亮色
const PLATFORM_BAR_HIGHLIGHT: Record<MatrixPlatformFilter, string> = {
  ALL: '#f97316', // 橘
  UBER: '#3b82f6', // 藍
  Fantuan: '#22c55e', // 綠
  Doordash: '#eab308', // 黃
};

// 3-month store revenue trend：每列最多顯示幾間店
const STORES_PER_ROW = 10;

// platform mix 堆疊圖：每列最多幾間店
const STORES_PER_ROW_MIX = 13;

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
    storePlatformShare,
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

  // bar chart 用：找出最大值 & 依最新月份排序門店
  const maxTrendValue = useMemo(() => {
    let max = 0;
    for (const s of trendSeries) {
      for (const v of s.values) {
        if (v > max) max = v;
      }
    }
    return max;
  }, [trendSeries]);

  const sortedTrendSeries = useMemo(() => {
    if (!trendMonths.length || !trendSeries.length) return [];
    const lastIdx = trendMonths.length - 1;
    return [...trendSeries].sort(
      (a, b) => (b.values[lastIdx] || 0) - (a.values[lastIdx] || 0),
    );
  }, [trendMonths, trendSeries]);

  // 3-month store revenue trend：依列分 chunk
  const chunkedTrendSeries = useMemo(() => {
    if (!sortedTrendSeries.length) return [] as typeof sortedTrendSeries[];
    const chunks: typeof sortedTrendSeries[] = [];
    for (let i = 0; i < sortedTrendSeries.length; i += STORES_PER_ROW) {
      chunks.push(sortedTrendSeries.slice(i, i + STORES_PER_ROW));
    }
    return chunks;
  }, [sortedTrendSeries]);

  const latestIndex =
    trendMonths.length > 0 ? trendMonths.length - 1 : -1;

  const highlightColor = PLATFORM_BAR_HIGHLIGHT[platformFilter];

  const legendColors = useMemo(
    () =>
      trendMonths.map((_, idx) =>
        idx === latestIndex
          ? highlightColor
          : NEUTRAL_BAR_COLORS[idx] ??
            NEUTRAL_BAR_COLORS[NEUTRAL_BAR_COLORS.length - 1],
      ),
    [trendMonths, latestIndex, highlightColor],
  );

  // platform mix：依列分 chunk（每列最多 13 間店）
  const chunkedPlatformShare = useMemo(() => {
    if (!storePlatformShare || !storePlatformShare.length)
      return [] as typeof storePlatformShare[];
    const chunks: typeof storePlatformShare[] = [];
    for (let i = 0; i < storePlatformShare.length; i += STORES_PER_ROW_MIX) {
      chunks.push(storePlatformShare.slice(i, i + STORES_PER_ROW_MIX));
    }
    return chunks;
  }, [storePlatformShare]);

  return (
    <section>
      {/* 標題列 + 平台篩選器 */}
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
          {/* 區域＋月份 */}
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
                  style={{
                    textAlign: 'left',
                    padding: '6px 4px',
                    cursor: 'pointer',
                  }}
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

          {/* 近三個月門店長條圖（多列、無 y 軸線，0 值不畫 bar） */}
          {trendMonths.length > 0 &&
            sortedTrendSeries.length > 0 &&
            maxTrendValue > 0 && (
              <>
                <div
                  style={{
                    height: 1,
                    background: '#111827',
                    margin: '12px 0 10px',
                  }}
                />

                {/* 標題 + 副標題 + 右上角 Legend */}
                <div
                  style={{
                    marginBottom: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
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
                      {isZh ? '平台：' : 'Platform: '}
                      {platformLabel(platformFilter, isZh)}
                    </div>
                  </div>

                  {/* Legend 靠右上 */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      fontSize: 10,
                      color: '#9ca3af',
                      flexWrap: 'wrap',
                    }}
                  >
                    {trendMonths.map((m, idx) => (
                      <div
                        key={m}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 9999,
                            backgroundColor: legendColors[idx],
                          }}
                        />
                        <span>{monthLabel(m, language)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {chunkedTrendSeries.map((rowSeries, rowIndex) => (
                  <div
                    key={rowIndex}
                    style={{
                      position: 'relative',
                      height: 210,
                      padding: '10px 0 12px',
                      overflowX: 'auto',
                      borderTop:
                        rowIndex > 0 ? '1px dashed #111827' : undefined,
                      marginTop: rowIndex > 0 ? 8 : 0,
                    }}
                  >
                    {/* 只保留 bars + 店名，不畫任何 y 軸線與 label */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 12,
                        height: '100%',
                        paddingRight: 8,
                        paddingLeft: 24, // 整排柱狀圖往右移一點
                      }}
                    >
                      {/* bar groups：這一列的門店 */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          gap: 20,
                          height: '100%',
                        }}
                      >
                        {rowSeries.map((series) => (
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
                            {/* 三個月份的 bars */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'flex-end',
                                gap: 6,
                                height: 160,
                              }}
                            >
                              {series.values.map((rawV, idx) => {
                                const v = Number(rawV || 0);

                                // 沒有數值就留白
                                if (!v || v <= 0) {
                                  return (
                                    <div
                                      key={idx}
                                      style={{ width: 10, height: 0 }}
                                    />
                                  );
                                }

                                const ratio =
                                  maxTrendValue > 0 ? v / maxTrendValue : 0;
                                const height = ratio * 150;
                                const isLatest = idx === latestIndex;
                                const rounded = Math.round(v);

                                const barColor = isLatest
                                  ? highlightColor
                                  : NEUTRAL_BAR_COLORS[idx] ??
                                    NEUTRAL_BAR_COLORS[
                                      NEUTRAL_BAR_COLORS.length - 1
                                    ];

                                return (
                                  <div
                                    key={idx}
                                    style={{
                                      position: 'relative',
                                      width: 10,
                                      borderRadius: 0, // 長方形
                                      backgroundColor: barColor,
                                      height,
                                    }}
                                  >
                                    {isLatest && (
                                      <span
                                        style={{
                                          position: 'absolute',
                                          bottom: height + 10, // 再往上拉一點，讓 COO 更好讀
                                          left: '50%',
                                          transform: 'translateX(-50%)',
                                          fontSize: 9,
                                          color: '#e5e7eb',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {rounded === 0
                                          ? '0'
                                          : rounded.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {/* 店名固定在 bars 下方 */}
                            <div
                              style={{
                                marginTop: 8,
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
                  </div>
                ))}

                {/* === Current-month platform mix by store（下方堆疊圖） === */}
               {chunkedPlatformShare.length > 0 && (
  <>
    <div
      style={{
        height: 1,
        background: '#111827',
        margin: '16px 0 10px',
      }}
    />

    {/* 標題 + 副標題 + 右上角 Legend */}
    <div
      style={{
        marginBottom: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            color: '#e5e7eb',
            marginBottom: 2,
          }}
        >
          {isZh
            ? '當月平台營收佔比（門店）'
            : 'Current-month platform mix by store'}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>
          {isZh
            ? '每間門店的 Uber / Fantuan / Doordash 營收百分比（加總為 100%）。'
            : 'Per-store revenue share by Uber / Fantuan / Doordash (sum to 100%).'}
        </div>
      </div>

      {/* Platform legend 靠右上 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          fontSize: 10,
          color: '#9ca3af',
          flexWrap: 'wrap',
        }}
      >
        {(['UBER', 'Fantuan', 'Doordash'] as const).map((p) => (
          <div
            key={p}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                backgroundColor:
                  PLATFORM_BAR_HIGHLIGHT[p as MatrixPlatformFilter],
                opacity:
                  platformFilter === 'ALL' || platformFilter === p ? 1 : 0.35,
              }}
            />
            <span>{p}</span>
          </div>
        ))}
      </div>
    </div>

    {chunkedPlatformShare.map((stores, rowIndex) => (
      <div
        key={rowIndex}
        style={{
          position: 'relative',
          padding: '10px 0 18px',
          overflowX: 'hidden',
          borderTop: rowIndex > 0 ? '1px dashed #111827' : undefined,
          marginTop: rowIndex > 0 ? 8 : 0,
          height: 200,
        }}
      >
        {/* 0% / 50% / 100% grid 線：高度對齊 130px bar 區域 */}
        <div
          style={{
            position: 'absolute',
            top: 30,   // ⬅ 原本是 10，改成 30 讓高度 = 130
            right: 0,
            bottom: 40,
            left: 40,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            zIndex: 0,
          }}
        >
          {[1, 0.5, 0].map((r) => (
            <div
              key={r}
              style={{
                borderTop: '1px solid #111827',
              }}
            />
          ))}
        </div>

        {/* Y 軸線 + 文字（在左側，同樣 top: 30 才會對齊格線） */}
        <div
          style={{
            position: 'absolute',
            top: 30,   // ⬅ 這裡也從 10 改成 30
            left: 32,
            bottom: 40,
            width: 0,
            borderLeft: '1px solid #111827',
            zIndex: 1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 30,   // ⬅ 同步修改
            left: 0,
            bottom: 40,
            width: 32,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            fontSize: 9,
            color: '#6b7280',
            textAlign: 'right',
            paddingRight: 2,
            zIndex: 1,
          }}
        >
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>

        {/* bars */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 16,
            height: '100%',
            paddingLeft: 40,
          }}
        >
          {stores.map((store) => (
            <div
              key={`${store.region}-${store.store_name}`}
              style={{
                minWidth: 40,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  height: 130,
                  width: 18,
                  borderRadius: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column-reverse',
                  backgroundColor: '#020617',
                  border: '1px solid #111827',
                }}
              >
                {store.shares
                  .filter((s) => s.share > 0)
                  .map((s) => {
                    const baseColor =
                      PLATFORM_BAR_HIGHLIGHT[
                        s.platform as MatrixPlatformFilter
                      ] ?? '#4b5563';

                    const isActive =
                      platformFilter === 'ALL' ||
                      platformFilter === s.platform;

                    const labelColor =
                      s.platform === 'UBER' ? '#e5e7eb' : '#020617';

                    return (
                      <div
                        key={s.platform}
                        style={{
                          position: 'relative',
                          height: `${Math.max(s.share * 100, 4)}%`,
                          backgroundColor: baseColor,
                          opacity: isActive ? 1 : 0.35,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {s.share >= 0.08 && (
                          <span
                            style={{
                              fontSize: 8,
                              color: labelColor,
                              textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                            }}
                          >
                            {(s.share * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* 店名 */}
              <div
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: '#9ca3af',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {store.store_name}
              </div>
            </div>
          ))}
        </div>
      </div>
    ))}
  </>
)}





