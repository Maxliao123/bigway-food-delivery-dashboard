// src/hooks/usePlatformMatrix.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type MatrixPlatformFilter = 'ALL' | 'UBER' | 'Fantuan' | 'Doordash';

export type PlatformRow = {
  store_name: string;
  region: string;

  // 營收
  revenueCurrent: number;
  revenuePrev: number | null;
  revenueMom: number | null;

  // 單量
  ordersCurrent: number;
  ordersPrev: number | null;
  ordersMom: number | null;

  // 客單價
  aovCurrent: number;
  aovPrev: number | null;
  aovMom: number | null;
};

type RawRow = {
  month: string;
  region: string;
  store_name: string;
  platform: string;
  revenue: number;
  orders: number;
};

function buildMom(current: number, previous: number | null): number | null {
  if (previous == null || previous === 0) return null;
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
  const [rows, setRows] = useState<PlatformRow[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);

  // 一次把 sales_records 撈進來
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('sales_records')
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

      const uniqueMonths = Array.from(new Set(casted.map(r => r.month))).sort();

      setMonths(uniqueMonths);
      setRawRows(casted);
      setLoading(false);
    };

    load();
  }, []);

  // 依照「區域 + 月份 + 平台篩選」計算表格資料
  useEffect(() => {
    if (!selectedMonth || !months.length) return;

    const idx = months.indexOf(selectedMonth);
    const prev = idx > 0 ? months[idx - 1] : null;

    setCurrentMonth(selectedMonth);
    setPrevMonth(prev);

    const matchesPlatform = (p: string) => {
      if (platformFilter === 'ALL') return true;
      return p === platformFilter;
    };

    const currentRows = rawRows.filter(
      r =>
        r.month === selectedMonth &&
        r.region === selectedRegion &&
        matchesPlatform(r.platform),
    );

    const prevRows = prev
      ? rawRows.filter(
          r =>
            r.month === prev &&
            r.region === selectedRegion &&
            matchesPlatform(r.platform),
        )
      : [];

    const map = new Map<string, PlatformRow>();

    const ensureRow = (store: string, region: string): PlatformRow => {
      const key = `${store}::${region}`;
      if (!map.has(key)) {
        map.set(key, {
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
        });
      }
      return map.get(key)!;
    };

    // 當月
    for (const r of currentRows) {
      const row = ensureRow(r.store_name, r.region);
      row.revenueCurrent += r.revenue;
      row.ordersCurrent += r.orders;
    }

    // 前一月
    for (const r of prevRows) {
      const row = ensureRow(r.store_name, r.region);
      row.revenuePrev = (row.revenuePrev ?? 0) + r.revenue;
      row.ordersPrev = (row.ordersPrev ?? 0) + r.orders;
    }

    // 計算 AOV & MoM
    for (const row of map.values()) {
      const prevRevenue = row.revenuePrev ?? 0;
      const prevOrders = row.ordersPrev ?? 0;

      row.aovCurrent =
        row.ordersCurrent > 0 ? row.revenueCurrent / row.ordersCurrent : 0;

      row.aovPrev =
        prevOrders > 0 ? prevRevenue / prevOrders : null;

      row.revenueMom = buildMom(row.revenueCurrent, row.revenuePrev);
      row.ordersMom = buildMom(row.ordersCurrent, row.ordersPrev);
      row.aovMom =
        row.aovPrev == null ? null : buildMom(row.aovCurrent, row.aovPrev);
    }

    const result = Array.from(map.values()).sort((a, b) =>
      a.store_name.localeCompare(b.store_name),
    );

    setRows(result);
  }, [months, rawRows, selectedMonth, selectedRegion, platformFilter]);

  return { loading, error, currentMonth, prevMonth, rows };
}

