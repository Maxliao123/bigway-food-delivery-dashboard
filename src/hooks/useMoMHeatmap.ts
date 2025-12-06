import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type StoreRevenueRow = {
  month: string;      // '2025-09-01'
  region: string;     // 'BC' | 'CA' | 'ON' ...
  store_name: string; // 'Kingsway' ...
  revenue: number;    // 已經是 Uber+Fantuan 加總
};

type UseMoMHeatmapResult = {
  loading: boolean;
  error: string | null;
  months: string[];        // 排好序的月份
  rows: StoreRevenueRow[]; // 聚合好的資料
};

export function useMoMHeatmap(): UseMoMHeatmapResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [rows, setRows] = useState<StoreRevenueRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('sales_records')
        .select('month, region, store_name, revenue');

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const raw: StoreRevenueRow[] = (data || []).map((r: any) => ({
        month: r.month,
        region: r.region,
        store_name: r.store_name,
        revenue: Number(r.revenue ?? 0),
      }));

      // 聚合成 (month, region, store_name) 一筆（合併 Uber / Fantuan）
      const map = new Map<string, StoreRevenueRow>();

      for (const r of raw) {
        const key = `${r.month}::${r.region}::${r.store_name}`;
        const existing = map.get(key);
        if (existing) {
          existing.revenue += r.revenue;
        } else {
          map.set(key, { ...r });
        }
      }

      const aggregated = Array.from(map.values());

      const uniqMonths = Array.from(new Set(aggregated.map(r => r.month))).sort();
      setMonths(uniqMonths);
      setRows(aggregated);
      setLoading(false);
    };

    load();
  }, []);

  return { loading, error, months, rows };
}
