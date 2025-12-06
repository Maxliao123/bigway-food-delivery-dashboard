// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import { useDashboardData } from './hooks/useDashboardData';
import { ExecutiveSummary } from './components/ExecutiveSummary';
import { PlatformMatrix } from './components/PlatformMatrix';

export type Lang = 'en' | 'zh';
export type Scope = 'BC' | 'ON' | 'CA';

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
  const [selectedRegion, setSelectedRegion] = useState<Scope>('BC');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const [language, setLanguage] = useState<Lang>('en');
  const isZh = language === 'zh';

  const title = isZh ? 'Food Delivery 外送儀表板' : 'Food Delivery Intelligence';
  const subtitle = isZh
    ? 'BC / CA / ON 外送平台的整體表現總覽'
    : 'Strategic dashboard for BC / CA / ON delivery performance.';
  const metaText = isZh
    ? '資料來源 · Supabase · 自動更新'
    : 'Data source · Supabase · Auto-refreshed';

  useEffect(() => {
    if (allMonths.length && !selectedMonth) {
      setSelectedMonth(allMonths[allMonths.length - 1]);
    }
  }, [allMonths, selectedMonth]);

  const prevSelectableMonth = useMemo(() => {
    if (!selectedMonth) return null;
    const idx = allMonths.indexOf(selectedMonth);
    if (idx > 0) return allMonths[idx - 1];
    return null;
  }, [allMonths, selectedMonth]);

  const monthLabel = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
    return d.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
  };

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

        {/* ===== Global Filters ===== */}
        {!loading && !error && allMonths.length > 0 && (
          <div className="filter-bar">
            <div className="filter-group">
              <span className="filter-label">{isZh ? '區域' : 'Region'}</span>
              <div className="scope-toggle">
                {(['BC', 'ON', 'CA'] as Scope[]).map((region) => (
                  <button
                    key={region}
                    type="button"
                    className={
                      'scope-pill' +
                      (selectedRegion === region ? ' scope-pill-active' : '')
                    }
                    onClick={() => setSelectedRegion(region)}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <span className="filter-label">
                {isZh ? '分析月份' : 'Analysis month'}
              </span>
              <select
                className="filter-select"
                value={selectedMonth ?? ''}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {allMonths.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
              {prevSelectableMonth && (
                <span className="filter-hint">
                  {isZh ? '對比' : 'vs'} {monthLabel(prevSelectableMonth)}
                </span>
              )}
            </div>
          </div>
        )}

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
        {!loading && !error && revenueKpi && ordersKpi && aovKpi && selectedMonth && (
          <main className="dashboard-grid">
            {/* 1️⃣ KPI + Regional / Platform summary */}
            <section className="section-card section-kpi">
              <ExecutiveSummary
                language={language}
                selectedRegion={selectedRegion}
                selectedMonth={selectedMonth}
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
              <PlatformMatrix
                language={language}
                selectedRegion={selectedRegion}
                selectedMonth={selectedMonth}
              />
            </section>

          </main>
        )}
      </div>
    </div>
  );
}

export default App;
