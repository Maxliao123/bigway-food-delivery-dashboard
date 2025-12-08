// src/hooks/useUberAdsMetrics.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type UberAdsMetricRow = {
  region: string;
  store_name: string;
  curr: {
    sales: number | null;
    spend: number | null;
    daily_spend: number | null; // = sales / days
    roas: number | null;
    orders: number | null;
    avg_cost_per_order: number | null;
  };
  prev: {
    sales: number | null;
    spend: number | null;
    roas: number | null;
    orders: number | null;
  };
  spend_delta_pct: number | null;
  roas_delta_pct: number | null;
};

type RawUberAdsMetric = {
  region: string;
  store_name: string;
  month_date: string;
  sales: number | null;
  spend: number | null;
  roas: number | null;
  orders: number | null;
  avg_cost_per_order: number | null;
};

type State = {
  loading: boolean;
  error: string | null;
  rows: UberAdsMetricRow[];
};

export function useUberAdsMetrics(
  region: string,
  currentMonthIso: string | null,
  prevMonthIso: string | null,
): State {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    rows: [],
  });

  useEffect(() => {
    if (!region || !currentMonthIso) {
      setState((s) => ({ ...s, rows: [] }));
      return;
    }

    let cancelled = false;

    const load = async () => {
      setState((s) => ({ ...s, loading: true, error: null }));

      const monthFilter = [currentMonthIso, prevMonthIso].filter(
        (v): v is string => !!v,
      );

      const { data, error } = await supabase
        .from('uber_ads_metrics')
        .select(
          // 把 sales 一起撈出來
          'region, store_name, month_date, sales, spend, roas, orders, avg_cost_per_order',
        )
        .eq('region', region)
        .in('month_date', monthFilter)
        .order('store_name', { ascending: true })
        .order('month_date', { ascending: true });

      if (cancelled) return;

      if (error) {
        setState({
          loading: false,
          error: error.message,
          rows: [],
        });
        return;
      }

      // 算當月天數，用來算 daily（你要的是 sales / days）
      const daysInMonth = (() => {
        const d = new Date(currentMonthIso);
        if (Number.isNaN(d.getTime())) return 30;
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth();
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      })();

      const rowsData = (data ?? []) as RawUberAdsMetric[];

      const byStore = new Map<
        string,
        { region: string; curr?: RawUberAdsMetric; prev?: RawUberAdsMetric }
      >();

      for (const row of rowsData) {
        const key = row.store_name;
        const bucket =
          byStore.get(key) ?? {
            region: row.region,
            curr: undefined,
            prev: undefined,
          };

        if (row.month_date === currentMonthIso) {
          bucket.curr = row;
        } else if (prevMonthIso && row.month_date === prevMonthIso) {
          bucket.prev = row;
        }

        byStore.set(key, bucket);
      }

      const rows: UberAdsMetricRow[] = Array.from(byStore.entries()).map(
        ([store_name, bucket]) => {
          const curr = bucket.curr;
          const prev = bucket.prev;

          const currSales = curr?.sales ?? null;
          const prevSales = prev?.sales ?? null;
          const currSpend = curr?.spend ?? null;
          const prevSpend = prev?.spend ?? null;
          const currRoas = curr?.roas ?? null;
          const prevRoas = prev?.roas ?? null;

          const spend_delta_pct =
            currSpend != null &&
            prevSpend != null &&
            prevSpend !== 0
              ? (currSpend - prevSpend) / prevSpend
              : null;

          const roas_delta_pct =
            currRoas != null &&
            prevRoas != null &&
            prevRoas !== 0
              ? (currRoas - prevRoas) / prevRoas
              : null;

          // 這裡照你的需求：Daily AD Spend = sales / 天數
          const daily_spend =
            currSpend != null ? currSpend / daysInMonth : null;

          return {
            region: bucket.region,
            store_name,
            curr: {
              sales: currSales,
              spend: currSpend,
              daily_spend,
              roas: currRoas,
              orders: curr?.orders ?? null,
              avg_cost_per_order: curr?.avg_cost_per_order ?? null,
            },
            prev: {
              sales: prevSales,
              spend: prevSpend,
              roas: prevRoas,
              orders: prev?.orders ?? null,
            },
            spend_delta_pct,
            roas_delta_pct,
          };
        },
      );

      setState({
        loading: false,
        error: null,
        rows,
      });
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [region, currentMonthIso, prevMonthIso]);

  return state;
}

