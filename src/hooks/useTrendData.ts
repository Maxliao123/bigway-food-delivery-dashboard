import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type MonthlyRegionRow = {
  month: string;   // '2025-08-01'
  region: string;  // 'BC' | 'ON' | 'CA' ...
  revenue: number;
};

type UseTrendDataResult = {
  loading: boolean;
  error: string | null;
  months: string[];            // 已排序, 例如 ['2025-08-01','2025-09-01','2025-10-01']
  regions: string[];           // 例如 ['BC','CA','ON']
  rows: MonthlyRegionRow[];    // 整理好的資料
};

export function useTrendData(): UseTrendDataResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [rows, setRows] = useState<MonthlyRegionRow[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('sales_records')
        .select('month, region, revenue');

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const casted: MonthlyRegionRow[] = (data || []).map((r: any) => ({
        month: r.month,
        region: r.region,
        revenue: Number(r.revenue ?? 0),
      }));

      // 依 month / region 聚合收入 (確保同月同區只一筆)
      const map = new Map<string, MonthlyRegionRow>();
      for (const r of casted) {
        const key = `${r.month}::${r.region}`;
        const existing = map.get(key);
        if (existing) {
          existing.revenue += r.revenue;
        } else {
          map.set(key, { ...r });
        }
      }

      const aggRows = Array.from(map.values());

      const uniqMonths = Array.from(new Set(aggRows.map(r => r.month))).sort();
      const uniqRegions = Array.from(new Set(aggRows.map(r => r.region))).sort();

      setRows(aggRows);
      setMonths(uniqMonths);
      setRegions(uniqRegions);
      setLoading(false);
    };

    load();
  }, []);

  return { loading, error, months, regions, rows };
}
