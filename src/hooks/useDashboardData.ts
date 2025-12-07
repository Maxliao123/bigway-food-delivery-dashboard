// src/hooks/useDashboardData.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Kpi = {
  current: number;
  previous: number;
  mom: number | null;
};

type RegionalKpi = {
  region: string;
  current: number;
  previous: number;
  mom: number | null;
};

// 平台 KPI（每一列代表：某區域＋某平台）
export type PlatformKpi = {
  region: string;
  platform: string;
  current: number;
  previous: number;
  mom: number | null;
};

type DashboardState = {
  loading: boolean;
  error: string | null;
  currentMonth: string | null;
  prevMonth: string | null;
  revenueKpi: Kpi | null;
  ordersKpi: Kpi | null;
  aovKpi: Kpi | null;

  regionalRevenueKpis: RegionalKpi[];
  regionalOrdersKpis: RegionalKpi[];
  regionalAovKpis: RegionalKpi[];

  platformRevenueKpis: PlatformKpi[];
  platformOrdersKpis: PlatformKpi[];
  platformAovKpis: PlatformKpi[];

  allMonths: string[];
  rawRows: SalesRow[];
};

export type SalesRow = {
  month: string;
  region: string;
  platform: string;
  revenue: number;
  orders: number;
};

function calcMom(curr: number, prev: number): number | null {
  if (!prev || prev === 0) return null;
  return (curr - prev) / prev;
}

export function useDashboardData(selectedMonth?: string): DashboardState {
  const [state, setState] = useState<DashboardState>({
    loading: true,
    error: null,
    currentMonth: null,
    prevMonth: null,
    revenueKpi: null,
    ordersKpi: null,
    aovKpi: null,
    regionalRevenueKpis: [],
    regionalOrdersKpis: [],
    regionalAovKpis: [],
    platformRevenueKpis: [],
    platformOrdersKpis: [],
    platformAovKpis: [],
    allMonths: [],
    rawRows: [],
  });

  useEffect(() => {
    async function load() {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const { data, error } = await supabase
        .from('sales_records')
        .select('month, region, platform, revenue, orders')
        .order('month', { ascending: true });

      if (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error.message,
        }));
        return;
      }

      const rows = (data || []) as SalesRow[];

      if (rows.length === 0) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'No data found in sales_records',
        }));
        return;
      }

      // ----------------------------
      // 1) 所有月份資料
      // ----------------------------
      const months = Array.from(new Set(rows.map(r => r.month))).sort();

      // ----------------------------
      // 2) 這次大修正：currentMonth = 前端傳入的 selectedMonth
      // ----------------------------
      let currentMonth = selectedMonth || months[months.length - 1];

      // 找 prevMonth = 在 months 中，currentMonth 的前一個
      const idx = months.indexOf(currentMonth);
      const prevMonth = idx > 0 ? months[idx - 1] : null;

      // ----------------------------
      // 3) 聚合數據
      // ----------------------------

      type AggKey = `${string}|${string}`;
      const agg: Record<AggKey, { revenue: number; orders: number }> = {};

      type PlatformKey = `${string}|${string}|${string}`;
      const platformAgg: Record<PlatformKey, { revenue: number; orders: number }> = {};

      const regionsSet = new Set<string>();
      const regionPlatformSet = new Set<string>();

      for (const r of rows) {
        regionsSet.add(r.region);
        regionPlatformSet.add(`${r.region}|${r.platform}`);

        const key = `${r.month}|${r.region}` as AggKey;
        if (!agg[key]) agg[key] = { revenue: 0, orders: 0 };
        agg[key].revenue += Number(r.revenue) || 0;
        agg[key].orders += Number(r.orders) || 0;

        const pKey = `${r.month}|${r.region}|${r.platform}` as PlatformKey;
        if (!platformAgg[pKey]) platformAgg[pKey] = { revenue: 0, orders: 0 };
        platformAgg[pKey].revenue += Number(r.revenue) || 0;
        platformAgg[pKey].orders += Number(r.orders) || 0;
      }

      const regions = Array.from(regionsSet).sort();
      const regionPlatformPairs = Array.from(regionPlatformSet).sort();

      const getAgg = (month: string | null, region?: string) => {
        if (!month) return { revenue: 0, orders: 0 };
        if (!region) {
          return regions.reduce(
            (acc, reg) => {
              const item = agg[`${month}|${reg}` as AggKey];
              if (item) {
                acc.revenue += item.revenue;
                acc.orders += item.orders;
              }
              return acc;
            },
            { revenue: 0, orders: 0 },
          );
        }
        return agg[`${month}|${region}` as AggKey] || { revenue: 0, orders: 0 };
      };

      const getPlatformAgg = (
        month: string | null,
        region: string,
        platform: string,
      ) => {
        if (!month) return { revenue: 0, orders: 0 };
        return (
          platformAgg[`${month}|${region}|${platform}` as PlatformKey] || {
            revenue: 0,
            orders: 0,
          }
        );
      };

      // ----------------------------
      // 4) Global KPI（卡片：Total Revenue / Orders / AOV）
      //  -> 現在會正確使用 selectedMonth
      // ----------------------------
      const globalCurr = getAgg(currentMonth);
      const globalPrev = getAgg(prevMonth);

      const revenueKpi: Kpi = {
        current: globalCurr.revenue,
        previous: globalPrev.revenue,
        mom: calcMom(globalCurr.revenue, globalPrev.revenue),
      };

      const ordersKpi: Kpi = {
        current: globalCurr.orders,
        previous: globalPrev.orders,
        mom: calcMom(globalCurr.orders, globalPrev.orders),
      };

      const currAov =
        globalCurr.orders > 0 ? globalCurr.revenue / globalCurr.orders : 0;
      const prevAov =
        globalPrev.orders > 0 ? globalPrev.revenue / globalPrev.orders : 0;

      const aovKpi: Kpi = {
        current: currAov,
        previous: prevAov,
        mom: calcMom(currAov, prevAov),
      };

      // ----------------------------
      // 5) Regional KPI
      // ----------------------------
      const regionalRevenueKpis: RegionalKpi[] = [];
      const regionalOrdersKpis: RegionalKpi[] = [];
      const regionalAovKpis: RegionalKpi[] = [];

      for (const region of regions) {
        const currAgg = getAgg(currentMonth, region);
        const prevAgg = getAgg(prevMonth, region);

        const currA = currAgg.orders > 0 ? currAgg.revenue / currAgg.orders : 0;
        const prevA = prevAgg.orders > 0 ? prevAgg.revenue / prevAgg.orders : 0;

        regionalRevenueKpis.push({
          region,
          current: currAgg.revenue,
          previous: prevAgg.revenue,
          mom: calcMom(currAgg.revenue, prevAgg.revenue),
        });

        regionalOrdersKpis.push({
          region,
          current: currAgg.orders,
          previous: prevAgg.orders,
          mom: calcMom(currAgg.orders, prevAgg.orders),
        });

        regionalAovKpis.push({
          region,
          current: currA,
          previous: prevA,
          mom: calcMom(currA, prevA),
        });
      }

      // ----------------------------
      // 6) Platform KPIs（依 selectedMonth）
      // ----------------------------
      const platformRevenueKpis: PlatformKpi[] = [];
      const platformOrdersKpis: PlatformKpi[] = [];
      const platformAovKpis: PlatformKpi[] = [];

      for (const pair of regionPlatformPairs) {
        const [region, platform] = pair.split('|');

        const currAgg = getPlatformAgg(currentMonth, region, platform);
        const prevAgg = getPlatformAgg(prevMonth, region, platform);

        const currA = currAgg.orders > 0 ? currAgg.revenue / currAgg.orders : 0;
        const prevA = prevAgg.orders > 0 ? prevAgg.revenue / prevAgg.orders : 0;

        platformRevenueKpis.push({
          region,
          platform,
          current: currAgg.revenue,
          previous: prevAgg.revenue,
          mom: calcMom(currAgg.revenue, prevAgg.revenue),
        });

        platformOrdersKpis.push({
          region,
          platform,
          current: currAgg.orders,
          previous: prevAgg.orders,
          mom: calcMom(currAgg.orders, prevAgg.orders),
        });

        platformAovKpis.push({
          region,
          platform,
          current: currA,
          previous: prevA,
          mom: calcMom(currA, prevA),
        });
      }

      // ----------------------------
      // 7) 更新 state
      // ----------------------------
      setState({
        loading: false,
        error: null,
        currentMonth,
        prevMonth,
        revenueKpi,
        ordersKpi,
        aovKpi,
        regionalRevenueKpis,
        regionalOrdersKpis,
        regionalAovKpis,
        platformRevenueKpis,
        platformOrdersKpis,
        platformAovKpis,
        allMonths: months,
        rawRows: rows,
      });
    }

    load();
  }, [selectedMonth]);

  return state;
}
