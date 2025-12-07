// src/hooks/usePlatformMatrix.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type MatrixPlatformFilter = 'ALL' | 'UBER' | 'Fantuan' | 'Doordash';

// 在堆疊圖中用到的平台（不含 ALL）
type PlatformKey = Exclude<MatrixPlatformFilter, 'ALL'>;

type RawRow = {
  month: string;
  region: string;
  store_name: string;
  platform: string;
  revenue: number;
  orders: number;
};

export type MatrixRow = {
  store_name: string;
  region: string;
  revenueCurrent: number;
  revenuePrev: number | null;
  revenueMom: number | null;
  ordersCurrent: number;
  ordersPrev: number | null;
  ordersMom: number | null;
  aovCurrent: number;
  aovPrev: number | null;
  aovMom: number | null;
};

export type TrendStoreSeries = {
  store_name: string;
  region: string;
  values: number[]; // 對應 trendMonths 的順序
};

// 當月：每間門店在各平台的營收佔比（0–1，加總為 1）
export type StorePlatformShare = {
  store_name: string;
  region: string;
  shares: {
    platform: PlatformKey;
    share: number; // 0~1
  }[];
};

function calcMom(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

export function usePlatformMatrix(
  selectedRegion: string,
  selectedMonth: string | null,
  platformFilter: MatrixPlatformFilter,
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const [prevMonth, setPrevMonth] = useState<string | null>(null);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [trendMonths, setTrendMonths] = useState<string[]>([]);
  const [trendSeries, setTrendSeries] = useState<TrendStoreSeries[]>([]);
  const [storePlatformShare, setStorePlatformShare] = useState<StorePlatformShare[]>([]);

  // 一次性抓資料
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('sales_records')
        // 只 select 真的存在的欄位
        .select('month, region, store_name, platform, revenue, orders');

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const casted: RawRow[] = (data || []).map((r: any) => ({
        month: r.month,
        region: r.region,
        store_name: r.store_name,
        platform: r.platform,
        revenue: Number(r.revenue ?? 0),
        orders: Number(r.orders ?? 0),
      }));

      const uniqueMonths = Array.from(new Set(casted.map((r) => r.month))).sort();

      setMonths(uniqueMonths);
      setRawRows(casted);
      setLoading(false);
    };

    load();
  }, []);

  // 依地區 / 月份 / 平台計算表格 + 長條圖 + 當月平台佔比資料
  useEffect(() => {
    if (!selectedMonth || !months.length) {
      setRows([]);
      setTrendMonths([]);
      setTrendSeries([]);
      setStorePlatformShare([]);
      return;
    }

    const idx = months.indexOf(selectedMonth);
    if (idx === -1) {
      setRows([]);
      setTrendMonths([]);
      setTrendSeries([]);
      setStorePlatformShare([]);
      return;
    }

    const prev = idx > 0 ? months[idx - 1] : null;
    setCurrentMonth(selectedMonth);
    setPrevMonth(prev);

    const matchPlatform = (platform: string) =>
      platformFilter === 'ALL' ? true : platform === platformFilter;

    // ---- 當月 / 前一月表格資料（受 platformFilter 影響）----
    const currentRows = rawRows.filter(
      (r) =>
        r.region === selectedRegion &&
        r.month === selectedMonth &&
        matchPlatform(r.platform),
    );

    const prevRows = prev
      ? rawRows.filter(
          (r) =>
            r.region === selectedRegion &&
            r.month === prev &&
            matchPlatform(r.platform),
        )
      : [];

    const map = new Map<string, MatrixRow>();

    const ensureRow = (store: string, region: string): MatrixRow => {
      const key = `${region}::${store}`;
      const existing = map.get(key);
      if (existing) return existing;

      const row: MatrixRow = {
        store_name: store,
        region,
        revenueCurrent: 0,
        revenuePrev: null,
        revenueMom: null,
        ordersCurrent: 0,
        ordersPrev: null,
        ordersMom: null,
        aovCurrent: 0,
        aovPrev: null,
        aovMom: null,
      };
      map.set(key, row);
      return row;
    };

    for (const r of currentRows) {
      const row = ensureRow(r.store_name, r.region);
      row.revenueCurrent += r.revenue;
      row.ordersCurrent += r.orders;
    }

    for (const r of prevRows) {
      const row = ensureRow(r.store_name, r.region);
      row.revenuePrev = (row.revenuePrev ?? 0) + r.revenue;
      row.ordersPrev = (row.ordersPrev ?? 0) + r.orders;
    }

    for (const row of map.values()) {
      // AOV = 營收 ÷ 單量
      row.aovCurrent =
        row.ordersCurrent > 0 ? row.revenueCurrent / row.ordersCurrent : 0;

      row.aovPrev =
        row.ordersPrev != null && row.ordersPrev > 0 && row.revenuePrev != null
          ? row.revenuePrev / row.ordersPrev
          : null;

      row.revenueMom = calcMom(row.revenueCurrent, row.revenuePrev);
      row.ordersMom = calcMom(row.ordersCurrent, row.ordersPrev);
      row.aovMom = row.aovPrev != null ? calcMom(row.aovCurrent, row.aovPrev) : null;
    }

    const tableRows = Array.from(map.values()).sort((a, b) =>
      a.store_name.localeCompare(b.store_name),
    );
    setRows(tableRows);

    // ---- 近三個月門店長條圖資料（受 platformFilter 影響）----
    const startIdx = Math.max(0, idx - 2);
    const trendMs = months.slice(startIdx, idx + 1);
    setTrendMonths(trendMs);

    if (trendMs.length === 0) {
      setTrendSeries([]);
    } else {
      const seriesMap = new Map<string, TrendStoreSeries>();

      const ensureSeries = (store: string, region: string): TrendStoreSeries => {
        const key = `${region}::${store}`;
        const existing = seriesMap.get(key);
        if (existing) return existing;

        const s: TrendStoreSeries = {
          store_name: store,
          region,
          values: new Array(trendMs.length).fill(0),
        };
        seriesMap.set(key, s);
        return s;
      };

      for (let i = 0; i < trendMs.length; i++) {
        const m = trendMs[i];
        const monthRows = rawRows.filter(
          (r) =>
            r.region === selectedRegion &&
            r.month === m &&
            matchPlatform(r.platform),
        );

        for (const r of monthRows) {
          const s = ensureSeries(r.store_name, r.region);
          s.values[i] += r.revenue;
        }
      }

      const series = Array.from(seriesMap.values()).sort((a, b) =>
        a.store_name.localeCompare(b.store_name),
      );
      setTrendSeries(series);
    }

    // ---- 當月各平台營收佔比（堆疊柱狀圖用，不受 platformFilter 影響）----
    const currentAllPlatformRows = rawRows.filter(
      (r) => r.region === selectedRegion && r.month === selectedMonth,
    );

    if (!currentAllPlatformRows.length) {
      setStorePlatformShare([]);
    } else {
      type StoreAgg = {
        region: string;
        store_name: string;
        total: number;
        byPlatform: Map<PlatformKey, number>;
      };

      const aggMap = new Map<string, StoreAgg>();

      const ensureAgg = (store: string, region: string): StoreAgg => {
        const key = `${region}::${store}`;
        const existing = aggMap.get(key);
        if (existing) return existing;
        const a: StoreAgg = {
          region,
          store_name: store,
          total: 0,
          byPlatform: new Map<PlatformKey, number>(),
        };
        aggMap.set(key, a);
        return a;
      };

      for (const r of currentAllPlatformRows) {
        // 只關心 Uber / Fantuan / Doordash
        const p = r.platform as PlatformKey;
        if (p !== 'UBER' && p !== 'Fantuan' && p !== 'Doordash') continue;

        const agg = ensureAgg(r.store_name, r.region);
        agg.total += r.revenue;
        agg.byPlatform.set(p, (agg.byPlatform.get(p) ?? 0) + r.revenue);
      }

      const platformOrder: PlatformKey[] = ['UBER', 'Fantuan', 'Doordash'];

      const shareRows: StorePlatformShare[] = Array.from(aggMap.values())
        .map<StorePlatformShare>((agg) => {
          const { store_name, region, total, byPlatform } = agg;
          const safeTotal = total > 0 ? total : 0;

          const shares = platformOrder.map((p) => {
            const value = byPlatform.get(p) ?? 0;
            const share =
              safeTotal > 0 ? value / safeTotal : 0;
            return { platform: p, share };
          });

          return {
            store_name,
            region,
            shares,
          };
        })
        .sort((a, b) => a.store_name.localeCompare(b.store_name));

      setStorePlatformShare(shareRows);
    }
  }, [selectedMonth, selectedRegion, platformFilter, months, rawRows]);

  return {
    loading,
    error,
    currentMonth,
    prevMonth,
    rows,
    trendMonths,
    trendSeries,
    storePlatformShare,
  };
}


