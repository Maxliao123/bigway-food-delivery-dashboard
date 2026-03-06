// src/hooks/useTotalRevenue.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type State = {
  loading: boolean;
  error: string | null;
  /** Total revenue (dine-in + delivery) for the selected month + region */
  totalRevenue: number | null;
};

export function useTotalRevenue(
  region: string,
  selectedMonth: string | null,
): State {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    totalRevenue: null,
  });

  useEffect(() => {
    if (!region || !selectedMonth) {
      setState({ loading: false, error: null, totalRevenue: null });
      return;
    }

    let cancelled = false;

    const load = async () => {
      setState((s) => ({ ...s, loading: true, error: null }));

      const { data, error } = await supabase
        .from('monthly_total_revenue')
        .select('total_revenue')
        .eq('region', region)
        .eq('month', selectedMonth)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setState({ loading: false, error: error.message, totalRevenue: null });
        return;
      }

      setState({
        loading: false,
        error: null,
        totalRevenue: data ? Number(data.total_revenue) : null,
      });
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [region, selectedMonth]);

  return state;
}
