// src/hooks/useUberAds.ts
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

type RawAd = {
  id: number;
  region: string;
  store_name: string;
  month_date: string;
  spend: number;
  sales: number;
  orders: number;
  roas: number;
  avg_cost_per_order: number;
};

export type UberAdRow = {
  store_name: string;
  adSales: number;
  adSpend: number;
  dailyAdSpend: number;
  roas: number;
  roasDelta: number | null; // this month ROAS minus last month ROAS (raw difference)
  roasDeltaPct: number | null;
  cpo: number;
};

export type UberAdsSummary = {
  totalAdSales: number;
  totalAdSalesMom: number | null;
  totalAdOrders: number;
  totalAdOrdersMom: number | null;
  avgRoas: number;
  avgRoasMom: number | null;
};

export function useUberAds(
  selectedRegion: string,
  selectedMonth: string | null,
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<RawAd[]>([]);
  const [allMonths, setAllMonths] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('uber_ads_metrics')
        .select('*');

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const casted: RawAd[] = (data || []).map((r: any) => ({
        id: r.id,
        region: r.region,
        store_name: r.store_name,
        month_date: r.month_date,
        spend: Number(r.spend ?? 0),
        sales: Number(r.sales ?? 0),
        orders: Number(r.orders ?? 0),
        roas: Number(r.roas ?? 0),
        avg_cost_per_order: Number(r.avg_cost_per_order ?? 0),
      }));

      const months = Array.from(new Set(casted.map((r) => r.month_date))).sort();
      setAllMonths(months);
      setRawData(casted);
      setLoading(false);
    };

    load();
  }, []);

  const result = useMemo(() => {
    if (!selectedMonth || !allMonths.length) {
      return { rows: [] as UberAdRow[], summary: null, currentMonth: null, prevMonth: null };
    }

    const idx = allMonths.indexOf(selectedMonth);
    const prevMonth = idx > 0 ? allMonths[idx - 1] : null;

    // Filter by region
    const currentData = rawData.filter(
      (r) => r.region === selectedRegion && r.month_date === selectedMonth,
    );
    const prevData = prevMonth
      ? rawData.filter(
          (r) => r.region === selectedRegion && r.month_date === prevMonth,
        )
      : [];

    // Days in month for daily spend calculation
    const d = new Date(selectedMonth);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

    // Build rows
    const rows: UberAdRow[] = currentData.map((curr) => {
      const prev = prevData.find((p) => p.store_name === curr.store_name);

      // ROAS delta = this month ROAS - last month ROAS (raw difference, NOT percentage)
      const roasDelta = prev ? curr.roas - prev.roas : null;
      const roasDeltaPct =
        prev && prev.roas !== 0
          ? (curr.roas - prev.roas) / prev.roas
          : null;

      return {
        store_name: curr.store_name,
        adSales: curr.sales,
        adSpend: curr.spend,
        dailyAdSpend: daysInMonth > 0 ? curr.spend / daysInMonth : 0,
        roas: curr.roas,
        roasDelta,
        roasDeltaPct,
        cpo: curr.avg_cost_per_order,
      };
    });

    // Summary KPIs
    const totalAdSales = currentData.reduce((s, r) => s + r.sales, 0);
    const totalAdOrders = currentData.reduce((s, r) => s + r.orders, 0);
    const totalAdSpend = currentData.reduce((s, r) => s + r.spend, 0);
    const avgRoas = totalAdSpend > 0 ? totalAdSales / totalAdSpend : 0;

    const prevTotalSales = prevData.reduce((s, r) => s + r.sales, 0);
    const prevTotalOrders = prevData.reduce((s, r) => s + r.orders, 0);
    const prevTotalSpend = prevData.reduce((s, r) => s + r.spend, 0);
    const prevAvgRoas = prevTotalSpend > 0 ? prevTotalSales / prevTotalSpend : 0;

    const totalAdSalesMom =
      prevData.length && prevTotalSales > 0
        ? (totalAdSales - prevTotalSales) / prevTotalSales
        : null;

    const totalAdOrdersMom =
      prevData.length && prevTotalOrders > 0
        ? (totalAdOrders - prevTotalOrders) / prevTotalOrders
        : null;

    // Average ROAS MoM: also raw difference
    const avgRoasMom =
      prevData.length && prevAvgRoas > 0
        ? avgRoas - prevAvgRoas
        : null;

    const summary: UberAdsSummary = {
      totalAdSales,
      totalAdSalesMom,
      totalAdOrders,
      totalAdOrdersMom,
      avgRoas,
      avgRoasMom,
    };

    return { rows, summary, currentMonth: selectedMonth, prevMonth };
  }, [rawData, allMonths, selectedMonth, selectedRegion]);

  return {
    loading,
    error,
    ...result,
  };
}
