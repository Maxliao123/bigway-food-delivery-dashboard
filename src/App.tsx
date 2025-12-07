// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import { useDashboardData } from './hooks/useDashboardData';
import { ExecutiveSummary } from './components/ExecutiveSummary';
import { PlatformMatrix } from './components/PlatformMatrix';
import { UberAdsPanel } from './components/UberAdsPanel';

// ⭐ Supabase Auth
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';

export type Lang = 'en' | 'zh';
export type Scope = 'BC' | 'ON' | 'CA';
type RoleScope = Scope | 'ALL';

function App() {
  // ===== Auth 狀態 =====
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<RoleScope | null>(null); // user_roles.role
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // login form：只輸入「帳號代碼 + 密碼」
  const [accountCode, setAccountCode] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  // ===== Dashboard 狀態 =====
  const [selectedRegion, setSelectedRegion] = useState<Scope>('BC');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // 允許看到哪些 Region（依角色）
  const effectiveRole: RoleScope = role ?? 'ALL';
  const allowedRegions: Scope[] =
    effectiveRole === 'ALL' ? ['BC', 'ON', 'CA'] : [effectiveRole];

  // 角色一旦變成 BC/ON/CA，就強制鎖定 Region
  useEffect(() => {
    if (effectiveRole !== 'ALL' && selectedRegion !== effectiveRole) {
      setSelectedRegion(effectiveRole);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRole]);

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
  } = useDashboardData(selectedMonth ?? undefined, selectedRegion);

  const [language, setLanguage] = useState<Lang>('en');
  const isZh = language === 'zh';

  const title = isZh ? 'Big Way 外送數據儀表板' : 'Big Way Delivery Performance Dashboard';
  const subtitle = isZh
    ? 'BC / CA / ON 外送平台的整體表現總覽'
    : 'Strategic dashboard for BC / CA / ON delivery performance.';
  const metaText = isZh
    ? '資料來源 · Supabase · 自動更新'
    : 'Data source · Supabase · Auto-refreshed';

  // ===== 讀取現有登入狀態 + 對應角色 =====
  useEffect(() => {
    const init = async () => {
      setAuthLoading(true);
      setAuthError(null);

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setAuthError(error.message);
        setAuthLoading(false);
        return;
      }

      const currentSession = data.session ?? null;
      setSession(currentSession);

      if (currentSession?.user) {
        const { user } = currentSession;
        const { data: roleRow, error: roleErr } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (roleErr) {
          setAuthError(roleErr.message);
        } else if (roleRow?.role) {
          setRole(roleRow.role as RoleScope);
        } else {
          // 若沒找到，就當 ALL（COO 等級）
          setRole('ALL');
        }
      }

      setAuthLoading(false);
    };

    void init();
  }, []);

  // ===== 登入動作：accountCode -> email + password =====
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    const trimmed = accountCode.trim().toLowerCase();
    if (!trimmed) {
      setAuthError(
        isZh
          ? '請輸入帳號代碼（bc / on / ca / all）'
          : 'Please enter account code (bc / on / ca / all).',
      );
      setAuthLoading(false);
      return;
    }

    // 轉成內部 email，例如 bc -> bc@dashboard.internal
    const email = `${trimmed}@dashboard.internal`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      setAuthError(error?.message ?? (isZh ? '登入失敗' : 'Login failed'));
      setAuthLoading(false);
      return;
    }

    setSession(data.session);

    // 讀取 user_roles.role
    const { data: roleRow, error: roleErr } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', data.session.user.id)
      .maybeSingle();

    if (roleErr) {
      setAuthError(roleErr.message);
      setRole('ALL');
    } else if (roleRow?.role) {
      setRole(roleRow.role as RoleScope);
    } else {
      setRole('ALL');
    }

    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    setAccountCode('');
    setPassword('');
  };

  // ===== 月份選單初始化 =====
  useEffect(() => {
    if (allMonths.length && !selectedMonth) {
      setSelectedMonth(allMonths[allMonths.length - 1]);
    }
  }, [allMonths, selectedMonth]);

  // 用「目前下拉選單選到的月份」往前找一格當作對比月份
  const prevSelectableMonth = useMemo(() => {
    if (!selectedMonth) return null;
    const idx = allMonths.indexOf(selectedMonth);
    if (idx > 0) return allMonths[idx - 1];
    return null;
  }, [allMonths, selectedMonth]);

  const monthLabel = (iso: string) => {
    const short = iso.slice(0, 7); // "YYYY-MM"
    const [year, month] = short.split('-');
    const mNum = Number(month);
    if (!year || !mNum || Number.isNaN(mNum)) return short;

    const MONTHS = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${MONTHS[mNum - 1]} ${year}`;
  };

  // ===== Auth Loading 畫面 =====
  if (authLoading) {
    return (
      <div className="app-root">
        <div className="app-shell">
          <div
            style={{
              height: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#e5e7eb',
              fontSize: 14,
            }}
          >
            {isZh ? '檢查登入狀態…' : 'Checking session…'}
          </div>
        </div>
      </div>
    );
  }

  // ===== 尚未登入：顯示登入表單 =====
  if (!session) {
    return (
      <div className="app-root">
        <div className="app-shell">
          <div
            style={{
              minHeight: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 320,
                padding: '24px 24px 20px',
                borderRadius: 16,
                background: '#020617',
                border: '1px solid #1f2937',
                boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
              }}
            >
              <h1
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  marginBottom: 4,
                  color: '#e5e7eb',
                }}
              >
                {isZh ? 'Food Delivery 儀表板登入' : 'Food Delivery Dashboard Login'}
              </h1>
              <p
                style={{
                  fontSize: 12,
                  color: '#9ca3af',
                  marginBottom: 16,
                }}
              >
                {isZh
                  ? '請輸入帳號代碼（bc / on / ca / all）與密碼。'
                  : 'Enter account code (bc / on / ca / all) and password.'}
              </p>

              <form
                onSubmit={handleLogin}
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <label style={{ fontSize: 12, color: '#9ca3af' }}>
                  {isZh ? '帳號代碼' : 'Account code'}
                  <input
                    type="text"
                    value={accountCode}
                    onChange={(e) => setAccountCode(e.target.value)}
                    placeholder="bc / on / ca / all"
                    style={{
                      marginTop: 4,
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #374151',
                      background: '#020617',
                      color: '#e5e7eb',
                      fontSize: 13,
                    }}
                  />
                </label>

                <label style={{ fontSize: 12, color: '#9ca3af' }}>
                  {isZh ? '密碼' : 'Password'}
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      marginTop: 4,
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #374151',
                      background: '#020617',
                      color: '#e5e7eb',
                      fontSize: 13,
                    }}
                  />
                </label>

                {authError && (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#f97373',
                      marginTop: 4,
                    }}
                  >
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  style={{
                    marginTop: 6,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 9999,
                    border: 'none',
                    background:
                      authLoading
                        ? '#1f2937'
                        : 'linear-gradient(90deg,#2563eb,#4f46e5)',
                    color: '#f9fafb',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: authLoading ? 'default' : 'pointer',
                  }}
                >
                  {authLoading
                    ? isZh
                      ? '登入中…'
                      : 'Signing in…'
                    : isZh
                    ? '登入'
                    : 'Sign in'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== 已登入：顯示原本儀表板 =====
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

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="lang-toggle">
                <button
                  className={
                    'lang-button' +
                    (language === 'en' ? ' lang-button-active' : '')
                  }
                  onClick={() => setLanguage('en')}
                >
                  EN
                </button>
                <button
                  className={
                    'lang-button' +
                    (language === 'zh' ? ' lang-button-active' : '')
                  }
                  onClick={() => setLanguage('zh')}
                >
                  中文
                </button>
              </div>

              <button
                onClick={handleLogout}
                style={{
                  marginLeft: 8,
                  padding: '4px 10px',
                  borderRadius: 9999,
                  border: '1px solid #374151',
                  background: 'transparent',
                  color: '#9ca3af',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {isZh ? '登出' : 'Sign out'}
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
                {(['BC', 'ON', 'CA'] as Scope[]).map((region) => {
                  const disabled = !allowedRegions.includes(region);
                  return (
                    <button
                      key={region}
                      type="button"
                      className={
                        'scope-pill' +
                        (selectedRegion === region ? ' scope-pill-active' : '') +
                        (disabled ? ' scope-pill-disabled' : '')
                      }
                      onClick={() => {
                        if (!disabled) setSelectedRegion(region);
                      }}
                      disabled={disabled}
                    >
                      {region}
                    </button>
                  );
                })}
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
        {!loading &&
          !error &&
          revenueKpi &&
          ordersKpi &&
          aovKpi &&
          selectedMonth && (
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

              {/* 3️⃣ Uber Ads Metrics Panel */}
            <section className="section-card">
  <UberAdsPanel
    language={language}
    selectedRegion={selectedRegion}
    // ✅ 直接用 Analysis month 下拉選到的那個月
    currentMonthIso={selectedMonth}
    // ✅ 對比月份 = 在 allMonths 中的前一個
    prevMonthIso={prevSelectableMonth}
  />
</section>
            </main>
          )}
      </div>
    </div>
  );
}

export default App;

