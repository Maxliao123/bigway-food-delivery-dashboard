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

export function usePlatformMatrix() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const [prevMonth, setPrevMonth] = useState<string | null>(null);
  const [rows, setRows] = useState<PlatformRow[]>([]);

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

      // 找月份：最新 & 前一個月
      const uniqueMonths = Array.from(new Set(casted.map(r => r.month))).sort();
      const cm = uniqueMonths.at(-1) ?? null;
      const pm = uniqueMonths.length >= 2 ? uniqueMonths.at(-2) : null;
      setCurrentMonth(cm);
      setPrevMonth(pm);

      if (!cm) {
        setRows([]);
        setLoading(false);
        return;
      }

      const currentRows = casted.filter(r => r.month === cm);
      const prevRows = pm ? casted.filter(r => r.month === pm) : [];

      // 以 store + region 為 key 聚合
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

      // 當月
      for (const r of currentRows) {
        const row = ensureRow(r.store_name, r.region);
        if (r.platform === 'UBER') {
          row.uberCurrent += r.revenue;
        } else if (r.platform === 'Fantuan') {
          row.fantuanCurrent += r.revenue;
        }
      }

      // 上月
      for (const r of prevRows) {
        const row = ensureRow(r.store_name, r.region);
        if (r.platform === 'UBER') {
          row.uberPrev = (row.uberPrev ?? 0) + r.revenue;
        } else if (r.platform === 'Fantuan') {
          row.fantuanPrev = (row.fantuanPrev ?? 0) + r.revenue;
        }
      }

      // 算 MoM
      for (const row of map.values()) {
        row.uberMom = buildMom(row.uberCurrent, row.uberPrev);
        row.fantuanMom = buildMom(row.fantuanCurrent, row.fantuanPrev);
      }

      // 依 region, store 排序
      const result = Array.from(map.values()).sort((a, b) => {
        if (a.region === b.region) {
          return a.store_name.localeCompare(b.store_name);
        }
        return a.region.localeCompare(b.region);
      });

      setRows(result);
      setLoading(false);
    };

    load();
  }, []);

  return { loading, error, currentMonth, prevMonth, rows };
}
