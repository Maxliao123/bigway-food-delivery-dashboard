// src/App.tsx
import React, { useState } from 'react';
import './App.css';
import { useDashboardData } from './hooks/useDashboardData';
import { ExecutiveSummary } from './components/ExecutiveSummary';
import { PlatformMatrix } from './components/PlatformMatrix';
import { RevenueTrend } from './components/RevenueTrend';
import { RegionComparison } from './components/RegionComparison';
import { RegionHeatmap } from './components/RegionHeatmap';
import { StoreHeatmap } from './components/StoreHeatmap';

export type Lang = 'en' | 'zh';
export type Scope = 'overview' | 'BC' | 'ON' | 'CA';

function App() {
  const {
    loading,
    error,
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
    allMonths,
    rawRows,
  } = useDashboardData();

  const [selectedRegion, setSelectedRegion] = useState<string | null>('BC');

  const [language, setLanguage] = useState<Lang>('en');
  const isZh = language === 'zh';

  const title = isZh ? 'Food Delivery 外送儀表板' : 'Food Delivery Intelligence';
  const subtitle = isZh
    ? 'BC / CA / ON 外送平台的整體表現總覽'
    : 'Strategic dashboard for BC / CA / ON delivery performance.';
  const metaText = isZh
    ? '資料來源 · Supabase · 自動更新'
    : 'Data source · Supabase · Auto-refreshed';

  return (
    <div className="app-root">
      <div className="app-shell">
        {/* ===== Header / Title Bar ===== */}
        <header className="app-header">
          <div>
            <p className="app-badge">
              {isZh ? 'FOOD DELIVERY · 內部' : 'FOOD DELIVERY · INTERNAL'}
            </p>
            <h1 className="app-title">{title}</h1>
            <p className="app-subtitle">{subtitle}</p>
            {/* ⚠️ 這裡不再放 Overview / BC / ON / CA 的 toggle 了 */}
          </div>

          <div className="app-meta">
            <span className="app-meta-pill">{metaText}</span>

            <div className="lang-toggle">
              <button
                className={
                  'lang-button' + (language === 'en' ? ' lang-button-active' : '')
                }
                onClick={() => setLanguage('en')}
              >
                EN
              </button>
              <button
                className={
                  'lang-button' + (language === 'zh' ? ' lang-button-active' : '')
                }
                onClick={() => setLanguage('zh')}
              >
                中文
              </button>
            </div>
          </div>
        </header>

        {/* ===== Loading / Error ===== */}
        {loading && (
          <div className="status status-loading">
            {isZh ? '資料載入中…' : 'Loading data…'}
          </div>
        )}

        {error && (
          <div className="status status-error">
            {isZh ? '載入資料發生錯誤：' : 'Error loading data: '}
            {error}
          </div>
        )}

        {/* ===== Main Dashboard ===== */}
        {!loading && !error && revenueKpi && ordersKpi && aovKpi && (
          <main className="dashboard-grid">
            {/* 1️⃣ KPI + Regional / Platform summary */}
            <section className="section-card section-kpi">
              <ExecutiveSummary
                language={language}
                currentMonth={currentMonth}
                prevMonth={prevMonth}
                revenueKpi={revenueKpi}
                ordersKpi={ordersKpi}
                aovKpi={aovKpi}
                regionalRevenueKpis={regionalRevenueKpis}
                regionalOrdersKpis={regionalOrdersKpis}
                regionalAovKpis={regionalAovKpis}
                platformRevenueKpis={platformRevenueKpis}
                platformOrdersKpis={platformOrdersKpis}
                platformAovKpis={platformAovKpis}
                allMonths={allMonths}
                rawRows={rawRows}
              />
            </section>

            {/* 2️⃣ Platform Velocity Matrix */}
            <section className="section-card">
              <PlatformMatrix language={language} />
            </section>

            {/* 3️⃣ Revenue MoM Heatmap（Region + Store Drilldown） */}
            <section className="section-card section-heatmap">
              <h2 className="section-title">
                {isZh ? '營收月成長 Heatmap' : 'Revenue MoM Heatmap'}
              </h2>
              <p className="section-subtitle">
                {isZh
                  ? '上：各區 MoM 表現；下：選定區域的門店明細。'
                  : 'Top: Region-level MoM performance. Bottom: Store-level breakdown.'}
              </p>

              <RegionHeatmap
                language={language}
                selectedRegion={selectedRegion}
                onSelectRegion={setSelectedRegion}
              />
              <div className="heatmap-divider" />
              <StoreHeatmap language={language} selectedRegion={selectedRegion} />
            </section>

            {/* 4️⃣ Revenue Trend & Region Comparison */}
            <section className="section-card section-charts">
              <RevenueTrend />
            </section>

            <section className="section-card section-charts">
              <RegionComparison />
            </section>
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
