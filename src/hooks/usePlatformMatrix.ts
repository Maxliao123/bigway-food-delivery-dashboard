import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type PlatformRow = {
  store_name: string;
  region: string;
  uberCurrent: number;
  uberPrev: number | null;
  uberMom: number | null;
  fantuanCurrent: number;
  fantuanPrev: number | null;
  fantuanMom: number | null;
};

type RawRow = {
  month: string;
  region: string;
  store_name: string;
  platform: string;
  revenue: number;
};

function buildMom(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

export function usePlatformMatrix(selectedRegion: string, selectedMonth: string | null) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const [prevMonth, setPrevMonth] = useState<string | null>(null);
  const [rows, setRows] = useState<PlatformRow[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('sales_records')
        .select('month, region, store_name, platform, revenue');

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
      }));

      const uniqueMonths = Array.from(new Set(casted.map((r) => r.month))).sort();

      setMonths(uniqueMonths);
      setRawRows(casted);
      setLoading(false);
    };

    load();
  }, []);

  useEffect(() => {
    if (!selectedMonth || !months.length) return;

    const idx = months.indexOf(selectedMonth);
    const prev = idx > 0 ? months[idx - 1] : null;
    setCurrentMonth(selectedMonth);
    setPrevMonth(prev);

    const currentRows = rawRows.filter(
      (r) => r.month === selectedMonth && r.region === selectedRegion,
    );
    const prevRows = prev
      ? rawRows.filter((r) => r.month === prev && r.region === selectedRegion)
      : [];

    const map = new Map<string, PlatformRow>();

    const ensureRow = (store: string, region: string): PlatformRow => {
      const key = `${store}::${region}`;
      if (!map.has(key)) {
        map.set(key, {
          store_name: store,
          region,
          uberCurrent: 0,
          uberPrev: null,
          uberMom: null,
          fantuanCurrent: 0,
          fantuanPrev: null,
          fantuanMom: null,
        });
      }
      return map.get(key)!;
    };

    for (const r of currentRows) {
      const row = ensureRow(r.store_name, r.region);
      if (r.platform === 'UBER') {
        row.uberCurrent += r.revenue;
      } else if (r.platform === 'Fantuan') {
        row.fantuanCurrent += r.revenue;
      }
    }

    for (const r of prevRows) {
      const row = ensureRow(r.store_name, r.region);
      if (r.platform === 'UBER') {
        row.uberPrev = (row.uberPrev ?? 0) + r.revenue;
      } else if (r.platform === 'Fantuan') {
        row.fantuanPrev = (row.fantuanPrev ?? 0) + r.revenue;
      }
    }

    for (const row of map.values()) {
      row.uberMom = buildMom(row.uberCurrent, row.uberPrev);
      row.fantuanMom = buildMom(row.fantuanCurrent, row.fantuanPrev);
    }

    const result = Array.from(map.values()).sort((a, b) => {
      if (a.region === b.region) {
        return a.store_name.localeCompare(b.store_name);
      }
      return a.region.localeCompare(b.region);
    });

    setRows(result);
  }, [months, rawRows, selectedMonth, selectedRegion]);

  return { loading, error, currentMonth, prevMonth, rows };
}
