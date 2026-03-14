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
  avgOverall: number;
  avgService: number;
  avgCleanliness: number;
  avgFood: number;
  heardFromDist: [string, number, [string, number][]?][];
  raceDist: [string, number][];
}

export interface MonthlyTrendPoint {
  month: string;       // "2026-03"
  responses: number;
  badCount: number;
  badRate: number;
}

export type TrendGranularity = 'all' | 'year' | 'month' | 'week' | 'day' | 'range';

export interface TrendPoint {
  label: string;
  responses: number;
  badCount: number;
  badRate: number;
}

export interface AvgScores {
  overall: number;
  service: number;
  cleanliness: number;
  food: number;
}

export interface DemographicItem {
  label: string;
  value: number;
  breakdown?: [string, number][]; // sub-categories sorted desc
}

export interface DemographicData {
  heardFrom: DemographicItem[];
  visitFrequency: DemographicItem[];
}

export interface TextFeedbackItem {
  store: string;
  text: string;
  date: string;
}

/* ------------------------------------------------------------------ */
/*  Official store name matching                                       */
/* ------------------------------------------------------------------ */

let _officialStoresCache: string[] | null = null;

export function useOfficialStores() {
  const [stores, setStores] = useState<string[]>(_officialStoresCache ?? []);

  useEffect(() => {
    if (_officialStoresCache) return;
    (async () => {
      const { data } = await supabase
        .from('sales_records')
        .select('store_name')
        .limit(10000);
      if (data) {
        const unique = [...new Set(data.map((r: { store_name: string }) => r.store_name).filter(Boolean))];
        unique.sort();
        _officialStoresCache = unique;
        setStores(unique);
      }
    })();
  }, []);

  return stores;
}

/** Canonical store name mapping (survey variants → display name) */
const STORE_NAME_MAP: Record<string, string> = {
  'victoria': 'UVic',
  'victoria bc': 'UVic',
  'victoria b.c.': 'UVic',
  'victoria uvic': 'UVic',
  'victoria by uvic': 'UVic',
  'victoria, bc': 'UVic',
  'victoria,bc': 'UVic',
  'victoria-uvic': 'UVic',
  'victoria bc- uvic': 'UVic',
  'victoria (shelbourn)': 'UVic',
  'victoria/mackenzie ave': 'UVic',
  'uvic victoria': 'UVic',
  'uvic, victoria': 'UVic',
  'uvic': 'UVic',
  'u vic': 'UVic',
  'vic': 'UVic',
  'near uvic': 'UVic',
  'by uvic': 'UVic',
  'gilmore, uvic': 'UVic',
  'olympic village': 'Olympic Village',
  'north vancouver': 'North Vancouver',
  'west end': 'West End',
};

/** Store names to hide from the dashboard */
const STORE_BLACKLIST = new Set([
  'option 1',
  'downtown',
  'bc',
  'saanich',
  'tuscany village',
  'tuscany',
  'mckenzie',
  'mackenzie',
  'mackenzie victoria',
  'mckenzie ave',
  'mckenzie , victoria',
  'mc kenzie',
  'mackenzie',
  'mckenzie and shelbourne street',
  'landsdowne',
  'vancouver',
  'gabrielle zhong',
  'bryan tai',
  'lonsdale',
  'langford',
  'downtown vancouver',
  'downtown, vancouver',
  'north van',
  'maple ridge',
  'victory',
  'the one on 41st',
  'the best richmond kimchi!<3',
  'howe st (vancouver)',
  'usa california',
  'allie amores',
]);

/** Match a survey store name to an official store name (case-insensitive trim) */
export function normalizeStoreName(name: string, officialStores: string[]): string {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Check canonical mapping first
  const mapped = STORE_NAME_MAP[lower];
  if (mapped) return mapped;

  const match = officialStores.find(s => s.toLowerCase() === lower);
  return match ?? trimmed;
}

/** Check if a store name should be hidden */
export function isBlacklistedStore(name: string): boolean {
  return STORE_BLACKLIST.has(name.trim().toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  Data fetching hook                                                 */
/* ------------------------------------------------------------------ */

export function useSurveyData(region: Scope, dateFrom?: string, dateTo?: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SurveyRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const PAGE = 1000;
      let allRows: SurveyRow[] = [];
      let offset = 0;
      let hasMore = true;
      let lastErr: string | null = null;

      const params: Record<string, string | null> = {
        p_region: region,
        p_from: dateFrom ?? null,
        p_to: dateTo ?? null,
      };

      while (hasMore) {
        const { data: rows, error: err } = await supabase
          .rpc('get_survey_responses', params)
          .range(offset, offset + PAGE - 1);

        if (cancelled) return;
        if (err) { lastErr = err.message; break; }
        allRows = allRows.concat((rows as SurveyRow[]) ?? []);
        hasMore = (rows?.length ?? 0) === PAGE;
        offset += PAGE;
      }

      if (cancelled) return;
      if (lastErr) {
        setError(lastErr);
        setData([]);
      } else {
        setData(allRows);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [region, dateFrom, dateTo]);

  return { loading, error, data };
}

/* ------------------------------------------------------------------ */
/*  Computation helpers                                                */
/* ------------------------------------------------------------------ */

/** Compute per-store stats with optional store name normalization */
export function computeStoreStats(data: SurveyRow[], officialStores?: string[]): StoreStats[] {
  const map = new Map<string, {
    total: number;
    bad: number;
    serviceBad: number;
    cleanlinessBad: number;
    foodBad: number;
    sumOverall: number; cntOverall: number;
    sumService: number; cntService: number;
    sumClean: number; cntClean: number;
    sumFood: number; cntFood: number;
    heardFrom: Map<string, number>;
    heardFromSub: Map<string, Map<string, number>>;
    race: Map<string, number>;
  }>();

  for (const row of data) {
    if (!row.store_name) continue;

    const stores = row.store_name.split(',').map(s => s.trim()).filter(Boolean);

    for (let store of stores) {
      // Apply canonical name mapping
      store = normalizeStoreName(store, officialStores ?? []);

      // Skip blacklisted stores
      if (isBlacklistedStore(store)) continue;

      let s = map.get(store);
      if (!s) {
        s = {
          total: 0, bad: 0, serviceBad: 0, cleanlinessBad: 0, foodBad: 0,
          sumOverall: 0, cntOverall: 0, sumService: 0, cntService: 0,
          sumClean: 0, cntClean: 0, sumFood: 0, cntFood: 0,
          heardFrom: new Map(), heardFromSub: new Map(), race: new Map(),
        };
        map.set(store, s);
      }
      s.total++;

      if (row.rating_overall != null) { s.sumOverall += row.rating_overall; s.cntOverall++; }
      if (row.rating_service != null) { s.sumService += row.rating_service; s.cntService++; }
      if (row.rating_cleanliness != null) { s.sumClean += row.rating_cleanliness; s.cntClean++; }
      if (row.rating_food != null) { s.sumFood += row.rating_food; s.cntFood++; }

      if (row.rating_overall != null && row.rating_overall <= 3) {
        s.bad++;
        if (row.rating_service != null && row.rating_service <= 3) s.serviceBad++;
        if (row.rating_cleanliness != null && row.rating_cleanliness <= 3) s.cleanlinessBad++;
        if (row.rating_food != null && row.rating_food <= 3) s.foodBad++;
      }

      // Heard from
      if (row.heard_from) {
        const raw = row.heard_from.trim();
        const cat = categorizeHeardFrom(raw);
        s.heardFrom.set(cat, (s.heardFrom.get(cat) || 0) + 1);
        if (!s.heardFromSub.has(cat)) s.heardFromSub.set(cat, new Map());
        const sub = s.heardFromSub.get(cat)!;
        sub.set(raw, (sub.get(raw) || 0) + 1);
      }
      // Race demographic
      if (row.race_demographic) {
        const race = row.race_demographic.trim();
        if (race && race !== '-' && race.toLowerCase() !== 'n/a') {
          s.race.set(race, (s.race.get(race) || 0) + 1);
        }
      }
    }
  }

  const result: StoreStats[] = [];
  for (const [storeName, s] of map) {
    // Build sorted distributions, top 6 + Other
    const buildDist = (m: Map<string, number>): [string, number][] => {
      const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
      if (sorted.length <= 7) return sorted;
      const top = sorted.slice(0, 6);
      const otherCount = sorted.slice(6).reduce((sum, e) => sum + e[1], 0);
      const existingOther = top.findIndex(e => e[0] === 'Other');
      if (existingOther >= 0) {
        top[existingOther] = ['Other', top[existingOther][1] + otherCount];
      } else {
        top.push(['Other', otherCount]);
      }
      return top;
    };

    // Build heardFrom dist with sub-breakdowns (top 5 raw values per category)
    const buildHeardDist = (): [string, number, [string, number][]?][] => {
      const base = buildDist(s.heardFrom);
      return base.map(([cat, count]) => {
        const sub = s.heardFromSub.get(cat);
        if (sub && sub.size > 1) {
          const top5 = [...sub.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
          return [cat, count, top5] as [string, number, [string, number][]];
        }
        return [cat, count] as [string, number];
      });
    };

    result.push({
      storeName,
      totalResponses: s.total,
      badReviews: s.bad,
      badRate: s.total > 0 ? s.bad / s.total : 0,
      serviceBad: s.serviceBad,
      cleanlinessBad: s.cleanlinessBad,
      foodBad: s.foodBad,
      avgOverall: s.cntOverall > 0 ? s.sumOverall / s.cntOverall : 0,
      avgService: s.cntService > 0 ? s.sumService / s.cntService : 0,
      avgCleanliness: s.cntClean > 0 ? s.sumClean / s.cntClean : 0,
      avgFood: s.cntFood > 0 ? s.sumFood / s.cntFood : 0,
      heardFromDist: buildHeardDist(),
      raceDist: buildDist(s.race),
    });
  }

  return result.sort((a, b) => b.badReviews - a.badReviews);
}

/** Monthly trend aggregation */
export function computeMonthlyTrend(data: SurveyRow[]): MonthlyTrendPoint[] {
  const map = new Map<string, { responses: number; bad: number }>();

  for (const row of data) {
    if (!row.submitted_at) continue;
    const month = row.submitted_at.slice(0, 7); // "2026-03"
    let m = map.get(month);
    if (!m) { m = { responses: 0, bad: 0 }; map.set(month, m); }
    m.responses++;
    if (row.rating_overall != null && row.rating_overall <= 3) m.bad++;
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, m]) => ({
      month,
      responses: m.responses,
      badCount: m.bad,
      badRate: m.responses > 0 ? m.bad / m.responses : 0,
    }));
}

/** Get ISO week string "2026-W12" */
function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayDiff = Math.floor((d.getTime() - jan4.getTime()) / 86400000);
  const weekNum = Math.ceil((dayDiff + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Compute trend data grouped by the selected granularity */
export function computeTrend(data: SurveyRow[], granularity: TrendGranularity): TrendPoint[] {
  const map = new Map<string, { responses: number; bad: number }>();

  for (const row of data) {
    if (!row.submitted_at) continue;
    let key: string;
    switch (granularity) {
      case 'year':
        key = row.submitted_at.slice(0, 4); // "2026"
        break;
      case 'week':
        key = getISOWeek(row.submitted_at);
        break;
      case 'day':
        key = String(new Date(row.submitted_at).getDay()); // 0=Sun..6=Sat
        break;
      default: // 'all', 'month', 'range'
        key = row.submitted_at.slice(0, 7); // "2026-03"
        break;
    }
    let m = map.get(key);
    if (!m) { m = { responses: 0, bad: 0 }; map.set(key, m); }
    m.responses++;
    if (row.rating_overall != null && row.rating_overall <= 3) m.bad++;
  }

  let entries = [...map.entries()];

  if (granularity === 'day') {
    // Sort Sun(0)..Sat(6)
    entries.sort((a, b) => Number(a[0]) - Number(b[0]));
  } else {
    entries.sort((a, b) => a[0].localeCompare(b[0]));
  }

  // Weekly: keep only the last 10 weeks to avoid crowding
  if (granularity === 'week' && entries.length > 10) {
    entries = entries.slice(-10);
  }

  return entries.map(([key, m]) => ({
    label: key,
    responses: m.responses,
    badCount: m.bad,
    badRate: m.responses > 0 ? m.bad / m.responses : 0,
  }));
}

/** Average scores across all rows */
export function computeAvgScores(data: SurveyRow[]): AvgScores {
  let sO = 0, cO = 0, sS = 0, cS = 0, sC = 0, cC = 0, sF = 0, cF = 0;
  for (const row of data) {
    if (row.rating_overall != null) { sO += row.rating_overall; cO++; }
    if (row.rating_service != null) { sS += row.rating_service; cS++; }
    if (row.rating_cleanliness != null) { sC += row.rating_cleanliness; cC++; }
    if (row.rating_food != null) { sF += row.rating_food; cF++; }
  }
  return {
    overall: cO > 0 ? sO / cO : 0,
    service: cS > 0 ? sS / cS : 0,
    cleanliness: cC > 0 ? sC / cC : 0,
    food: cF > 0 ? sF / cF : 0,
  };
}

/** Map raw "heard_from" answers to canonical categories */
function categorizeHeardFrom(raw: string): string {
  const v = raw.trim().toLowerCase();

  // Word of Mouth
  if (/friend|sister|brother|daughter|son|family|mom|dad|parent|wife|husband|cousin|uncle|aunt|relative|colleague|coworker|co-worker|roommate|boyfriend|girlfriend|\bgf\b|\bbf\b/i.test(v))
    return 'Word of Mouth';
  if (v.includes('word of mouth') || v.includes('口碑'))
    return 'Word of Mouth';

  // Walk-In / Passing by
  if (/walk.?in|walking|walk by|passed by|passing|saw it|saw the/i.test(v))
    return 'Walk-In';

  // Social Media
  if (/tiktok|tik tok/i.test(v)) return 'TikTok';
  if (/instagram|\big\b/i.test(v)) return 'Instagram';
  if (/youtube/i.test(v)) return 'YouTube';
  if (/facebook|\bfb\b/i.test(v)) return 'Facebook';
  if (/social media/i.test(v)) return 'Social Media';

  // Review platforms
  if (/yelp|google|review/i.test(v)) return 'Yelp / Google';

  // Been to other locations
  if (/been to|other location|locations in canada/i.test(v))
    return 'Been to other locations';

  // TV / Newspaper
  if (/newspaper|television|tv\b|chek|news/i.test(v))
    return 'TV / Newspaper';

  // UVIC / School
  if (/uvic|university|school|student|campus/i.test(v))
    return 'School / Campus';

  // Delivery apps
  if (/uber|doordash|skip|delivery app|foodpanda/i.test(v))
    return 'Delivery App';

  // Hinge / dating (edge case in data)
  if (/hinge|dating/i.test(v)) return 'Other';

  // Short junk answers (single char, dash, etc.)
  if (v.length <= 2 || v === '-' || v === 'n/a' || v === 'na') return 'Other';

  // Anything else → Other
  return 'Other';
}

const MAX_DEMOGRAPHIC_ITEMS = 8;

/** Demographics: heard_from + visit_frequency distributions */
export function computeDemographics(data: SurveyRow[]): DemographicData {
  // Track category totals AND raw sub-categories
  const heardCatMap = new Map<string, number>();
  const heardSubMap = new Map<string, Map<string, number>>();
  const freqMap = new Map<string, number>();

  for (const row of data) {
    if (row.heard_from) {
      const raw = row.heard_from.trim();
      const category = categorizeHeardFrom(raw);
      heardCatMap.set(category, (heardCatMap.get(category) ?? 0) + 1);
      if (!heardSubMap.has(category)) heardSubMap.set(category, new Map());
      const sub = heardSubMap.get(category)!;
      sub.set(raw, (sub.get(raw) ?? 0) + 1);
    }
    if (row.visit_frequency) {
      const v = row.visit_frequency.trim();
      if (v) freqMap.set(v, (freqMap.get(v) ?? 0) + 1);
    }
  }

  // Build heard items with breakdown
  let heardItems: DemographicItem[] = [...heardCatMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => {
      const sub = heardSubMap.get(label);
      const breakdown = sub && sub.size > 1
        ? [...sub.entries()].sort((a, b) => b[1] - a[1])
        : undefined;
      return { label, value, breakdown };
    });

  // Limit to top N, merge rest into "Other"
  if (heardItems.length > MAX_DEMOGRAPHIC_ITEMS) {
    const top = heardItems.slice(0, MAX_DEMOGRAPHIC_ITEMS - 1);
    const rest = heardItems.slice(MAX_DEMOGRAPHIC_ITEMS - 1);
    const otherSum = rest.reduce((s, e) => s + e.value, 0);
    const otherBreakdown: [string, number][] = [];
    for (const item of rest) {
      if (item.breakdown) otherBreakdown.push(...item.breakdown);
      else otherBreakdown.push([item.label, item.value]);
    }
    otherBreakdown.sort((a, b) => b[1] - a[1]);

    const existingOther = top.find(e => e.label === 'Other');
    if (existingOther) {
      if (existingOther.breakdown) otherBreakdown.push(...existingOther.breakdown);
      existingOther.value += otherSum;
      existingOther.breakdown = otherBreakdown.sort((a, b) => b[1] - a[1]);
    } else {
      top.push({ label: 'Other', value: otherSum, breakdown: otherBreakdown });
    }
    heardItems = top.sort((a, b) => b.value - a.value);
  }

  return {
    heardFrom: heardItems,
    visitFrequency: [...freqMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value })),
  };
}

/** Collect text feedback from surveys */
export function collectTextFeedback(data: SurveyRow[]): {
  bad: TextFeedbackItem[];
  positive: TextFeedbackItem[];
} {
  const bad: TextFeedbackItem[] = [];
  const positive: TextFeedbackItem[] = [];

  for (const row of data) {
    const store = row.store_name || '—';
    const date = row.submitted_at?.slice(0, 10) || '';

    if (row.rating_overall != null && row.rating_overall <= 3 && row.improvement_suggestions?.trim()) {
      bad.push({ store, text: row.improvement_suggestions.trim(), date });
    }
    if (row.positive_feedback?.trim()) {
      positive.push({ store, text: row.positive_feedback.trim(), date });
    }
  }

  return { bad, positive };
}
