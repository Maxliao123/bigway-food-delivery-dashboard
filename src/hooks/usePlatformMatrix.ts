// src/hooks/usePlatformMatrix.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type MatrixPlatformFilter = 'ALL' | 'UBER' | 'Fantuan' | 'Doordash';

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

  // 一次性抓資料
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('sales_records')
        // 👇 這裡只 select 你真的有的欄位：沒有 aov
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

  // 依地區 / 月份 / 平台計算表格 + 長條圖資料
  useEffect(() => {
    if (!selectedMonth || !months.length) return;

    const idx = months.indexOf(selectedMonth);
    if (idx === -1) return;

    const prev = idx > 0 ? months[idx - 1] : null;
    setCurrentMonth(selectedMonth);
    setPrevMonth(prev);

    const matchPlatform = (platform: string) =>
      platformFilter === 'ALL' ? true : platform === platformFilter;

    // ---- 當月 / 前一月表格資料 ----
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

    // ---- 近三個月門店長條圖資料 ----
    const startIdx = Math.max(0, idx - 2);
    const trendMs = months.slice(startIdx, idx + 1);
    setTrendMonths(trendMs);

    if (trendMs.length === 0) {
      setTrendSeries([]);
      return;
    }

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
  }, [selectedMonth, selectedRegion, platformFilter, months, rawRows]);

  return {
    loading,
    error,
    currentMonth,
    prevMonth,
    rows,
    trendMonths,
    trendSeries,
  };
}

