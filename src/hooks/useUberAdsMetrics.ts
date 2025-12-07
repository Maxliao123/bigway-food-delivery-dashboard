// src/hooks/useUberAdsMetrics.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type UberAdsRow = {
  region: string;
  store_name: string;
  month_date: string; // ISO date string
  spend: number;
  sales: number | null;
  orders: number | null;
  roas: number | null;
  avg_cost_per_order: number | null;
};

type StoreMetrics = {
  store_name: string;
  curr: UberAdsRow | null;
  prev: UberAdsRow | null;
};

export function useUberAdsMetrics(
  region: string,
  analysisMonthIso: string, // 例如 '2025-10'
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<StoreMetrics[]>([]);

  useEffect(() => {
    if (!region || !analysisMonthIso) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. 把 '2025-10' 轉成 '2025-10-01' & 前一個月
        const [year, month] = analysisMonthIso.split('-').map(Number);
        const currDate = new Date(year, month - 1, 1);
        const prevDate = new Date(year, month - 2, 1);

        const currStr = currDate.toISOString().slice(0, 10);
        const prevStr = prevDate.toISOString().slice(0, 10);

        const { data, error } = await supabase
          .from<UberAdsRow>('uber_ads_metrics')
          .select('*')
          .eq('region', region)
          .in('month_date', [currStr, prevStr])
          .order('store_name', { ascending: true });

        if (error) throw error;

        // 2. group by store_name → { curr, prev }
        const map = new Map<string, StoreMetrics>();

        for (const row of data ?? []) {
          const key = row.store_name;
          if (!map.has(key)) {
            map.set(key, { store_name: key, curr: null, prev: null });
          }
          const entry = map.get(key)!;
          if (row.month_date === currStr) {
            entry.curr = row;
          } else if (row.month_date === prevStr) {
            entry.prev = row;
          }
        }

        setRows(Array.from(map.values()));
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load uber ads metrics');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [region, analysisMonthIso]);

  return { loading, error, rows };
}
