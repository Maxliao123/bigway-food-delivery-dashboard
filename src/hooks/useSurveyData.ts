import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Scope } from '../App';

export interface SurveyRow {
  id: number;
  region: string;
  submitted_at: string;
  store_name: string;
  rating_overall: number | null;
  rating_service: number | null;
  rating_cleanliness: number | null;
  rating_food: number | null;
  positive_feedback: string | null;
  improvement_suggestions: string | null;
  heard_from: string | null;
  race_demographic: string | null;
  visit_frequency: string | null;
  member_info: string | null;
  respondent_name: string | null;
  email: string | null;
}

export interface StoreStats {
  storeName: string;
  totalResponses: number;
  badReviews: number;
  badRate: number;
  serviceBad: number;
  cleanlinessBad: number;
  foodBad: number;
}

export function useSurveyData(region: Scope) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SurveyRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data: rows, error: err } = await supabase
        .rpc('get_survey_responses', { p_region: region });

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setData([]);
      } else {
        setData((rows as SurveyRow[]) ?? []);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [region]);

  return { loading, error, data };
}

/** Compute per-store stats from raw survey data */
export function computeStoreStats(data: SurveyRow[]): StoreStats[] {
  const map = new Map<string, {
    total: number;
    bad: number;
    serviceBad: number;
    cleanlinessBad: number;
    foodBad: number;
  }>();

  for (const row of data) {
    const store = row.store_name;
    if (!store) continue;

    let s = map.get(store);
    if (!s) {
      s = { total: 0, bad: 0, serviceBad: 0, cleanlinessBad: 0, foodBad: 0 };
      map.set(store, s);
    }
    s.total++;

    if (row.rating_overall != null && row.rating_overall <= 3) {
      s.bad++;
      if (row.rating_service != null && row.rating_service <= 3) s.serviceBad++;
      if (row.rating_cleanliness != null && row.rating_cleanliness <= 3) s.cleanlinessBad++;
      if (row.rating_food != null && row.rating_food <= 3) s.foodBad++;
    }
  }

  const result: StoreStats[] = [];
  for (const [storeName, s] of map) {
    result.push({
      storeName,
      totalResponses: s.total,
      badReviews: s.bad,
      badRate: s.total > 0 ? s.bad / s.total : 0,
      serviceBad: s.serviceBad,
      cleanlinessBad: s.cleanlinessBad,
      foodBad: s.foodBad,
    });
  }

  return result.sort((a, b) => b.badReviews - a.badReviews);
}
