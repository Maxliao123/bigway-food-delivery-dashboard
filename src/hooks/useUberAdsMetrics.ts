// src/hooks/useUberAdsMetrics.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type UberAdsMetricRow = {
  region: string;
  store_name: string;
  month_date: string; // YYYY-MM-DD
  spend: number | null;
  spend_delta_pct: number | null;
  daily_spend: number | null;
  roas: number | null;
  roas_delta_pct: number | null;
  avg_cost_per_order: number | null;
};

export type UseUberAdsMetricsResult = {
  loading: boolean;
  error: string | null;
  rows: UberAdsMetricRow[];
};

/**
 * 依照 Region + month_date 抓 Uber Ads 指標
 *
 * @param region      例如 "BC" / "CA" / "ON"
 * @param monthDate   例如 "2025-10-01"（和 uber_ads_metrics.month_date 對應）
 */
export function useUberAdsMetrics(
  region: string,
  monthDate: string,
): UseUberAdsMetricsResult {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<UberAdsMetricRow[]>([]);

  useEffect(() => {
    // 沒選月份就清空
    if (!monthDate) {
      setRows([]);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('uber_ads_metrics')
        .select(
          `
          region,
          store_name,
          month_date,
          spend,
          spend_delta_pct,
          daily_spend,
          roas,
          roas_delta_pct,
          avg_cost_per_order
        `,
        )
        .eq('region', region)
        .eq('month_date', monthDate)
        .order('store_name', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('Failed to load uber_ads_metrics:', error);
        setError(error.message ?? 'Failed to load Uber Ads metrics');
        setRows([]);
      } else {
        // 保險轉型；supabase 型別推論有時候是 any
        setRows((data ?? []) as UberAdsMetricRow[]);
      }

      setLoading(false);
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [region, monthDate]);

  return { loading, error, rows };
}

