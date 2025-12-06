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
  region: string;   // BC / CA / ON
  platform: string; // Uber / Fantuan …
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

  // 平台拆分
  platformRevenueKpis: PlatformKpi[];
  platformOrdersKpis: PlatformKpi[];
  platformAovKpis: PlatformKpi[];

  // ➕ 給前端任意區間計算用
  allMonths: string[];
  rawRows: SalesRow[];
};

export type SalesRow = {
  month: string;
  region: string;
  platform: string; // ⚠️ Supabase 的 sales_records 需要有這欄位
  revenue: number;
  orders: number;
};

function calcMom(curr: number, prev: number): number | null {
  if (!prev || prev === 0) return null;
  return (curr - prev) / prev;
}

export function useDashboardData(): DashboardState {
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
        // ⚠️ 多選出 platform 欄位
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

      // 1) 找出所有月份 & 取最新兩個做 Current / Previous
      const months = Array.from(new Set(rows.map(r => r.month))).sort();
      const currentMonth = months[months.length - 1];
      const prevMonth =
        months.length >= 2 ? months[months.length - 2] : null;

      // 2) 依 month + region 聚合（總覽 & Regional KPI 用）
      type AggKey = `${string}|${string}`;
      const agg: Record<
        AggKey,
        { revenue: number; orders: number }
      > = {};

      // 2b) 依 month + region + platform 聚合（平台拆分用）
      type PlatformKey = `${string}|${string}|${string}`;
      const platformAgg: Record<
        PlatformKey,
        { revenue: number; orders: number }
      > = {};

      // 收集所有 region 和 (region, platform) 組合
      const regionsSet = new Set<string>();
      const regionPlatformSet = new Set<string>(); // "BC|Uber"

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
          // 全部 Region 加總
          return regions.reduce(
            (acc, reg) => {
              const key = `${month}|${reg}` as AggKey;
              const item = agg[key];
              if (item) {
                acc.revenue += item.revenue;
                acc.orders += item.orders;
              }
              return acc;
            },
            { revenue: 0, orders: 0 },
          );
        } else {
          const key = `${month}|${region}` as AggKey;
          const item = agg[key];
          return item || { revenue: 0, orders: 0 };
        }
      };

      const getPlatformAgg = (
        month: string | null,
        region: string,
        platform: string,
      ) => {
        if (!month) return { revenue: 0, orders: 0 };
        const key = `${month}|${region}|${platform}` as PlatformKey;
        const item = platformAgg[key];
        return item || { revenue: 0, orders: 0 };
      };

      // 3) Global KPI（仍然保留「最新一個月 vs 前一月」）
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

      const currentAov =
        globalCurr.orders > 0
          ? globalCurr.revenue / globalCurr.orders
          : 0;
      const prevAov =
        globalPrev.orders > 0
          ? globalPrev.revenue / globalPrev.orders
          : 0;

      const aovKpi: Kpi = {
        current: currentAov,
        previous: prevAov,
        mom: calcMom(currentAov, prevAov),
      };

      // 4) Regional KPI
      const regionalRevenueKpis: RegionalKpi[] = [];
      const regionalOrdersKpis: RegionalKpi[] = [];
      const regionalAovKpis: RegionalKpi[] = [];

      for (const region of regions) {
        const currAgg = getAgg(currentMonth, region);
        const prevAgg = getAgg(prevMonth, region);

        const currAov =
          currAgg.orders > 0 ? currAgg.revenue / currAgg.orders : 0;
        const prevAov =
          prevAgg.orders > 0 ? prevAgg.revenue / prevAgg.orders : 0;

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
          current: currAov,
          previous: prevAov,
          mom: calcMom(currAov, prevAov),
        });
      }

      // 5) Platform KPI（每個 region + platform 一列，仍然是「最新一月 vs 前一月」）
      const platformRevenueKpis: PlatformKpi[] = [];
      const platformOrdersKpis: PlatformKpi[] = [];
      const platformAovKpis: PlatformKpi[] = [];

      for (const pair of regionPlatformPairs) {
        const [region, platform] = pair.split('|');
        const currAgg = getPlatformAgg(currentMonth, region, platform);
        const prevAgg = getPlatformAgg(prevMonth, region, platform);

        const currAov =
          currAgg.orders > 0 ? currAgg.revenue / currAgg.orders : 0;
        const prevAov =
          prevAgg.orders > 0 ? prevAgg.revenue / prevAgg.orders : 0;

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
          current: currAov,
          previous: prevAov,
          mom: calcMom(currAov, prevAov),
        });
      }

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
  }, []);

  return state;
}
