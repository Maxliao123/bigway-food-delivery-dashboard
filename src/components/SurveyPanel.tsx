import React, { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabaseClient';
import type { Lang, Scope } from '../App';
import {
  useSurveyData, useOfficialStores,
  computeStoreStats, computeMonthlyTrend, computeAvgScores,
  computeDemographics, collectTextFeedback,
} from '../hooks/useSurveyData';
import type { StoreStats, MonthlyTrendPoint, TextFeedbackItem } from '../hooks/useSurveyData';

/* ------------------------------------------------------------------ */
/*  CSV → Supabase helpers                                            */
/* ------------------------------------------------------------------ */

function normaliseHeader(h: string): string {
  return h.replace(/^\d+\.\s*/, '').trim().toLowerCase();
}

function findCol(headers: string[], needle: string): number {
  return headers.findIndex((h) => normaliseHeader(h).includes(needle));
}

function parseTimestamp(raw: string): string | null {
  if (!raw) return null;
  const [datePart, timePart] = raw.split(' ');
  if (!datePart) return null;
  const [m, d, y] = datePart.split('/');
  if (!m || !d || !y) return null;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return timePart ? `${iso}T${timePart}` : iso;
}

function toInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

interface UploadResult {
  region: string;
  total: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

async function uploadCsv(file: File, region: Scope): Promise<UploadResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as string[][];
        if (rows.length < 2) {
          resolve({ region, total: 0, inserted: 0, skipped: 0, errors: ['Empty file'] });
          return;
        }

        const headers = rows[0];
        const colTs = 0;
        const colLoc = findCol(headers, 'location');
        const colOverall = findCol(headers, 'overall experience');
        const colService = findCol(headers, 'service');
        const colClean = findCol(headers, 'clean');
        const colFood = findCol(headers, 'quality of the food');
        const colPositive = findCol(headers, 'positive feedback');
        const colImprove = findCol(headers, 'improvement');
        const colHeard = findCol(headers, 'hear about');
        const colRace = findCol(headers, 'race');
        const colFreq = findCol(headers, 'how often');
        const colMember = findCol(headers, 'existing member');
        const colName = headers.findIndex((h) => h.trim().toLowerCase() === 'name');
        const colEmail = headers.findIndex((h) => h.trim().toLowerCase().includes('email'));

        const records: Record<string, unknown>[] = [];
        const errs: string[] = [];

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const ts = parseTimestamp(r[colTs] ?? '');
          const store = (colLoc >= 0 ? r[colLoc] : '')?.trim() ?? '';
          if (!ts || !store) {
            errs.push(`Row ${i + 1}: missing timestamp or store`);
            continue;
          }
          records.push({
            region,
            submitted_at: ts,
            store_name: store,
            rating_overall: toInt(colOverall >= 0 ? r[colOverall] : undefined),
            rating_service: toInt(colService >= 0 ? r[colService] : undefined),
            rating_cleanliness: toInt(colClean >= 0 ? r[colClean] : undefined),
            rating_food: toInt(colFood >= 0 ? r[colFood] : undefined),
            positive_feedback: colPositive >= 0 ? r[colPositive]?.trim() || null : null,
            improvement_suggestions: colImprove >= 0 ? r[colImprove]?.trim() || null : null,
            heard_from: colHeard >= 0 ? r[colHeard]?.trim() || null : null,
            race_demographic: colRace >= 0 ? r[colRace]?.trim() || null : null,
            visit_frequency: colFreq >= 0 ? r[colFreq]?.trim() || null : null,
            member_info: colMember >= 0 ? r[colMember]?.trim() || null : null,
            respondent_name: colName >= 0 ? r[colName]?.trim() || null : null,
            email: colEmail >= 0 ? r[colEmail]?.trim() || null : null,
          });
        }

        let inserted = 0;
        const BATCH = 50;
        for (let i = 0; i < records.length; i += BATCH) {
          const batch = records.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map((rec) =>
              supabase.rpc('upsert_survey_response', {
                p_region: rec.region as string,
                p_submitted_at: rec.submitted_at as string,
                p_store_name: rec.store_name as string,
                p_rating_overall: rec.rating_overall as number | null,
                p_rating_service: rec.rating_service as number | null,
                p_rating_cleanliness: rec.rating_cleanliness as number | null,
                p_rating_food: rec.rating_food as number | null,
                p_positive_feedback: rec.positive_feedback as string | null,
                p_improvement_suggestions: rec.improvement_suggestions as string | null,
                p_heard_from: rec.heard_from as string | null,
                p_race_demographic: rec.race_demographic as string | null,
                p_visit_frequency: rec.visit_frequency as string | null,
                p_member_info: rec.member_info as string | null,
                p_respondent_name: rec.respondent_name as string | null,
                p_email: rec.email as string | null,
              }),
            ),
          );
          const batchErrors = results.filter((r) => r.error);
          if (batchErrors.length > 0) {
            errs.push(`Batch ${Math.floor(i / BATCH) + 1}: ${batchErrors[0].error!.message}`);
          } else {
            inserted += batch.length;
          }
        }

        resolve({ region, total: records.length, inserted, skipped: rows.length - 1 - records.length, errors: errs });
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/*  SVG: Monthly Trend Chart                                          */
/* ------------------------------------------------------------------ */

function MonthlyTrendChart({ data, isZh }: { data: MonthlyTrendPoint[]; isZh: boolean }) {
  if (!data.length) {
    return <div className="survey-pie-empty">{isZh ? '暫無趨勢數據' : 'No trend data'}</div>;
  }

  const W = 600, H = 260;
  const margin = { top: 20, right: 55, bottom: 40, left: 50 };
  const cw = W - margin.left - margin.right;
  const ch = H - margin.top - margin.bottom;

  const maxResp = Math.max(...data.map(d => d.responses), 1);
  const maxRate = Math.max(...data.map(d => d.badRate), 0.01);

  const barW = Math.min(cw / data.length * 0.6, 40);
  const getX = (i: number) => margin.left + (data.length === 1 ? cw / 2 : (cw / (data.length - 1)) * i);
  const getYL = (v: number) => margin.top + ch - (v / maxResp) * ch;
  const getYR = (v: number) => margin.top + ch - (v / maxRate) * ch;

  // Grid lines
  const gridLines = 4;
  const grids = Array.from({ length: gridLines + 1 }, (_, i) => {
    const y = margin.top + (ch / gridLines) * i;
    const val = maxResp - (maxResp / gridLines) * i;
    return { y, val };
  });

  // Line path for bad rate
  const linePath = data.map((d, i) => {
    const x = getX(i);
    const y = getYR(d.badRate);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className="survey-trend-container">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        {grids.map((g, i) => (
          <React.Fragment key={i}>
            <line x1={margin.left} y1={g.y} x2={W - margin.right} y2={g.y}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={margin.left - 8} y={g.y + 4} textAnchor="end"
              fill="rgba(255,255,255,0.4)" fontSize={10}>
              {Math.round(g.val)}
            </text>
          </React.Fragment>
        ))}

        {/* Right axis labels (bad rate) */}
        {Array.from({ length: gridLines + 1 }, (_, i) => {
          const y = margin.top + (ch / gridLines) * i;
          const val = maxRate - (maxRate / gridLines) * i;
          return (
            <text key={`r${i}`} x={W - margin.right + 8} y={y + 4}
              textAnchor="start" fill="rgba(248,113,113,0.6)" fontSize={10}>
              {(val * 100).toFixed(0)}%
            </text>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => (
          <rect key={i} x={getX(i) - barW / 2} y={getYL(d.responses)}
            width={barW} height={margin.top + ch - getYL(d.responses)}
            fill="rgba(99,102,241,0.5)" rx={2} />
        ))}

        {/* Bad rate line */}
        <path d={linePath} fill="none" stroke="#f87171" strokeWidth={2} />
        {data.map((d, i) => (
          <circle key={i} cx={getX(i)} cy={getYR(d.badRate)} r={3}
            fill="#f87171" />
        ))}

        {/* X axis labels */}
        {data.map((d, i) => (
          <text key={i} x={getX(i)} y={H - margin.bottom + 18}
            textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={10}>
            {d.month.slice(5)}
          </text>
        ))}

        {/* Axis titles */}
        <text x={margin.left - 8} y={margin.top - 6}
          textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize={9}>
          {isZh ? '回覆數' : 'Responses'}
        </text>
        <text x={W - margin.right + 8} y={margin.top - 6}
          textAnchor="start" fill="rgba(248,113,113,0.6)" fontSize={9}>
          {isZh ? '差評率' : 'Bad Rate'}
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG: Horizontal Bar Chart                                         */
/* ------------------------------------------------------------------ */

function HBarChart({ items, maxValue, color, isZh: _isZh }: {
  items: { label: string; value: number }[];
  maxValue?: number;
  color?: string;
  isZh: boolean;
}) {
  const max = maxValue ?? Math.max(...items.map(i => i.value), 1);
  return (
    <div className="survey-hbar-list">
      {items.map((item, i) => (
        <div key={i} className="survey-hbar-row">
          <span className="survey-hbar-label">{item.label}</span>
          <div className="survey-hbar-track">
            <div className="survey-hbar-fill"
              style={{
                width: `${max > 0 ? (item.value / max) * 100 : 0}%`,
                background: color ?? '#6366f1',
              }} />
          </div>
          <span className="survey-hbar-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pie Chart: Bad Review Reasons                                      */
/* ------------------------------------------------------------------ */

interface PieSlice { label: string; value: number; color: string; }

function BadReviewPie({ serviceBad, cleanlinessBad, foodBad, isZh }: {
  serviceBad: number;
  cleanlinessBad: number;
  foodBad: number;
  isZh: boolean;
}) {
  const slices: PieSlice[] = [
    { label: isZh ? '服務 Service' : 'Service', value: serviceBad, color: '#f97316' },
    { label: isZh ? '衛生 Cleanliness' : 'Cleanliness', value: cleanlinessBad, color: '#06b6d4' },
    { label: isZh ? '食物 Food' : 'Food Quality', value: foodBad, color: '#a855f7' },
  ];

  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) {
    return <div className="survey-pie-empty">{isZh ? '沒有差評資料' : 'No negative reviews'}</div>;
  }

  const size = 180;
  const cx = size / 2, cy = size / 2, r = size / 2 - 10;
  let cumAngle = -Math.PI / 2;

  const paths: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];

  slices.forEach((sl, idx) => {
    if (sl.value === 0) return;
    const pct = sl.value / total;
    const angle = pct * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    const x2 = cx + r * Math.cos(cumAngle + angle);
    const y2 = cy + r * Math.sin(cumAngle + angle);
    const largeArc = angle > Math.PI ? 1 : 0;

    paths.push(
      <path key={idx}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={sl.color} stroke="rgba(2,6,23,0.8)" strokeWidth={2} />
    );

    if (pct > 0.05) {
      const midAngle = cumAngle + angle / 2;
      const lr = r * 0.65;
      labels.push(
        <text key={`l${idx}`} x={cx + lr * Math.cos(midAngle)} y={cy + lr * Math.sin(midAngle)}
          textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize={12} fontWeight={600}>
          {(pct * 100).toFixed(0)}%
        </text>
      );
    }
    cumAngle += angle;
  });

  return (
    <div className="survey-pie-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths}{labels}
      </svg>
      <div className="survey-pie-legend">
        {slices.map((sl, i) => (
          <div key={i} className="survey-pie-legend-item">
            <span className="survey-pie-legend-dot" style={{ background: sl.color }} />
            <span className="survey-pie-legend-label">{sl.label}: {sl.value}</span>
          </div>
        ))}
      </div>
      <p className="survey-bar-footnote" style={{ marginTop: 12 }}>
        {isZh
          ? `* 差評總數 ${total}（含重疊：一筆差評可同時計入多個分類）`
          : `* Total complaints: ${total} (may overlap — one review can count in multiple categories)`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible Section wrapper                                       */
/* ------------------------------------------------------------------ */

function CollapsibleSection({ title, defaultOpen = true, children }: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section-card">
      <div className="survey-collapsible-header" onClick={() => setOpen(!open)}>
        <h2 className="survey-section-title" style={{ margin: 0 }}>{title}</h2>
        <span className={`survey-chevron ${open ? 'survey-chevron-open' : ''}`}>&#9654;</span>
      </div>
      {open && <div className="survey-collapsible-body">{children}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Score color helper                                                 */
/* ------------------------------------------------------------------ */

function scoreColor(v: number): string {
  if (v >= 4.0) return '#4ade80';
  if (v >= 3.0) return '#facc15';
  return '#f87171';
}

/* ------------------------------------------------------------------ */
/*  Sort key type                                                      */
/* ------------------------------------------------------------------ */

type SortKey = 'storeName' | 'totalResponses' | 'badReviews' | 'badRate' | 'avgOverall' | 'avgService' | 'avgCleanliness' | 'avgFood';

/* ------------------------------------------------------------------ */
/*  Main SurveyPanel                                                  */
/* ------------------------------------------------------------------ */

interface Props {
  language: Lang;
  selectedRegion: Scope;
  dateFrom?: string;
  dateTo?: string;
}

export function SurveyPanel({ language, selectedRegion, dateFrom, dateTo }: Props) {
  const isZh = language === 'zh';
  const { loading, error, data } = useSurveyData(selectedRegion, dateFrom, dateTo);
  const officialStores = useOfficialStores();
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRefs = {
    BC: useRef<HTMLInputElement>(null),
    CA: useRef<HTMLInputElement>(null),
    ON: useRef<HTMLInputElement>(null),
  };

  const { data: liveData } = useSurveyData(selectedRegion, dateFrom, dateTo);
  const displayData = refreshKey > 0 ? liveData : data;

  // Computed data
  const storeStats = useMemo(() => computeStoreStats(displayData, officialStores), [displayData, officialStores]);
  const monthlyTrend = useMemo(() => computeMonthlyTrend(displayData), [displayData]);
  const avgScores = useMemo(() => computeAvgScores(displayData), [displayData]);
  const demographics = useMemo(() => computeDemographics(displayData), [displayData]);
  const textFeedback = useMemo(() => collectTextFeedback(displayData), [displayData]);

  const totalBadReviews = storeStats.reduce((s, st) => s + st.badReviews, 0);
  const totalResponses = storeStats.reduce((s, st) => s + st.totalResponses, 0);

  // Sort state for store table
  const [sortKey, setSortKey] = useState<SortKey>('badReviews');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedStats = useMemo(() => {
    const copy = [...storeStats];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [storeStats, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  // Per-store drill-down
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  // Text feedback display limit
  const [showAllBad, setShowAllBad] = useState(false);
  const [showAllPositive, setShowAllPositive] = useState(false);
  const FEEDBACK_LIMIT = 50;

  const handleUpload = useCallback(
    async (region: Scope) => {
      const input = fileRefs[region].current;
      if (!input?.files?.length) return;
      setUploading(true);
      try {
        const result = await uploadCsv(input.files[0], region);
        setUploadResults((prev) => [result, ...prev.filter((r) => r.region !== region)]);
        setRefreshKey((k) => k + 1);
      } finally {
        setUploading(false);
        if (input) input.value = '';
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const FeedbackList = ({ items, showAll, setShowAll }: {
    items: TextFeedbackItem[];
    showAll: boolean;
    setShowAll: (v: boolean) => void;
  }) => {
    const displayed = showAll ? items : items.slice(0, FEEDBACK_LIMIT);
    if (!items.length) return <p style={{ opacity: 0.5 }}>{isZh ? '暫無資料' : 'No data'}</p>;
    return (
      <>
        <div className="survey-feedback-list">
          {displayed.map((item, i) => (
            <div key={i} className="survey-feedback-item">
              <span className="survey-feedback-store-tag">{item.store}</span>
              <span className="survey-feedback-date">{item.date}</span>
              <p className="survey-feedback-text">{item.text}</p>
            </div>
          ))}
        </div>
        {items.length > FEEDBACK_LIMIT && !showAll && (
          <button className="survey-show-more" onClick={() => setShowAll(true)}>
            {isZh ? `顯示全部 (${items.length})` : `Show all (${items.length})`}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="survey-panel">
      {/* ===== Loading / Error ===== */}
      {loading && (
        <div className="status status-loading">
          {isZh ? '載入問卷資料…' : 'Loading survey data…'}
        </div>
      )}
      {error && (
        <div className="status status-error">
          {isZh ? '錯誤：' : 'Error: '}{error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ===== 1. KPI Summary ===== */}
          <div className="survey-kpi-grid survey-kpi-grid-3">
            <div className="survey-kpi-card-standalone">
              <div className="survey-kpi-value">{totalResponses}</div>
              <div className="survey-kpi-label">{isZh ? '總回覆數' : 'Total Responses'}</div>
            </div>
            <div className="survey-kpi-card-standalone survey-kpi-card-bad">
              <div className="survey-kpi-value">{totalBadReviews}</div>
              <div className="survey-kpi-label">{isZh ? '差評數 (≤3分)' : 'Bad Reviews (≤3)'}</div>
            </div>
            <div className="survey-kpi-card-standalone">
              <div className="survey-kpi-value">
                {totalResponses > 0 ? ((totalBadReviews / totalResponses) * 100).toFixed(1) + '%' : '—'}
              </div>
              <div className="survey-kpi-label">{isZh ? '差評率' : 'Bad Review Rate'}</div>
            </div>
          </div>
          <div className="survey-kpi-grid survey-kpi-grid-4">
            {([
              { label: isZh ? '整體平均' : 'Overall Avg', value: avgScores.overall },
              { label: isZh ? '服務平均' : 'Service Avg', value: avgScores.service },
              { label: isZh ? '衛生平均' : 'Cleanliness Avg', value: avgScores.cleanliness },
              { label: isZh ? '食物平均' : 'Food Avg', value: avgScores.food },
            ] as const).map((item, i) => (
              <div key={i} className="survey-kpi-card-standalone">
                <div className="survey-kpi-value" style={{ color: item.value > 0 ? scoreColor(item.value) : undefined }}>
                  {item.value > 0 ? item.value.toFixed(1) : '—'}
                  {item.value > 0 && <span className="survey-kpi-of5"> / 5</span>}
                </div>
                <div className="survey-kpi-label">{item.label}</div>
              </div>
            ))}
          </div>

          {/* ===== 2. Monthly Trend ===== */}
          {monthlyTrend.length > 1 && (
            <section className="section-card">
              <h2 className="survey-section-title">{isZh ? '月度趨勢' : 'Monthly Trend'}</h2>
              <p className="survey-section-subtitle">
                {isZh
                  ? '追蹤每月回覆量與差評率的變化，快速發現服務品質波動'
                  : 'Track monthly response volume and bad review rate to spot quality trends'}
              </p>
              <MonthlyTrendChart data={monthlyTrend} isZh={isZh} />
            </section>
          )}

          {/* ===== 3. Store Table with inline Bad Review Pie ===== */}
          <section className="section-card">
            <h2 className="survey-section-title">{isZh ? '門店排行' : 'Store Ranking'}</h2>
            <p className="survey-section-subtitle">
              {isZh ? '點擊門店名稱展開差評原因分析' : 'Click a store name to expand bad review analysis'}
            </p>
            <div className="survey-table-wrap">
              <table className="survey-table">
                <thead>
                  <tr>
                    <th className="survey-th-sortable" onClick={() => handleSort('storeName')}
                      title={isZh ? '門店名稱' : 'Store location name'}>
                      {isZh ? '門店' : 'Store'}{sortArrow('storeName')}
                    </th>
                    <th className="survey-th-sortable" onClick={() => handleSort('totalResponses')}
                      title={isZh ? '該門店的問卷回覆總數' : 'Total survey responses for this store'}>
                      {isZh ? '回覆' : 'Resp.'}{sortArrow('totalResponses')}
                    </th>
                    <th className="survey-th-sortable" onClick={() => handleSort('badReviews')}
                      title={isZh ? 'Q1 整體評分 ≤ 3 分的回覆數' : 'Responses where Q1 overall rating ≤ 3'}>
                      {isZh ? '差評' : 'Bad'}{sortArrow('badReviews')}
                    </th>
                    <th className="survey-th-sortable" onClick={() => handleSort('badRate')}
                      title={isZh ? '差評數 ÷ 總回覆數 × 100%' : 'Bad reviews ÷ Total responses × 100%'}>
                      {isZh ? '差評率' : 'Rate'}{sortArrow('badRate')}
                    </th>
                    <th className="survey-th-sortable" onClick={() => handleSort('avgOverall')}
                      title={isZh ? 'Q1 整體評分的平均值 (1-5分)' : 'Average of Q1 overall rating (1-5 scale)'}>
                      {isZh ? '總評' : 'Avg'}{sortArrow('avgOverall')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((s) => (
                    <React.Fragment key={s.storeName}>
                      <tr
                        className={selectedStore === s.storeName ? 'survey-table-row-active' : ''}
                        onClick={() => setSelectedStore(selectedStore === s.storeName ? null : s.storeName)}>
                        <td className="survey-table-store">
                          <span className={`survey-expand-icon ${selectedStore === s.storeName ? 'survey-expand-icon-open' : ''}`}>&#9654;</span>
                          {s.storeName}
                        </td>
                        <td>{s.totalResponses}</td>
                        <td className={s.badReviews > 0 ? 'survey-table-bad' : ''}>{s.badReviews}</td>
                        <td>{(s.badRate * 100).toFixed(1)}%</td>
                        <td style={{ color: s.avgOverall > 0 ? scoreColor(s.avgOverall) : undefined }}>
                          {s.avgOverall > 0 ? s.avgOverall.toFixed(1) : '—'}
                        </td>
                      </tr>
                      {selectedStore === s.storeName && (
                        <tr className="survey-table-expand-row">
                          <td colSpan={5}>
                            <div className="survey-table-expand-content">
                              <h3 className="survey-section-subtitle" style={{ margin: '0 0 8px' }}>
                                {isZh ? `${s.storeName} 差評原因分析` : `${s.storeName} — Bad Review Analysis`}
                              </h3>
                              <BadReviewPie
                                serviceBad={s.serviceBad}
                                cleanlinessBad={s.cleanlinessBad}
                                foodBad={s.foodBad}
                                isZh={isZh}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {sortedStats.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', opacity: 0.5 }}>
                        {isZh ? '尚無資料' : 'No data yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ===== 5. Demographics ===== */}
          <CollapsibleSection title={isZh ? '顧客統計' : 'Customer Demographics'}>
            <div className="survey-demographics-grid">
              <div>
                <h3 className="survey-section-subtitle" style={{ marginBottom: 12 }}>
                  {isZh ? '從何處得知我們' : 'How did you hear about us?'}
                </h3>
                <HBarChart
                  items={demographics.heardFrom.map(([label, value]) => ({ label, value }))}
                  isZh={isZh}
                />
              </div>
              <div>
                <h3 className="survey-section-subtitle" style={{ marginBottom: 12 }}>
                  {isZh ? '來店頻率' : 'Visit Frequency'}
                </h3>
                <HBarChart
                  items={demographics.visitFrequency.map(([label, value]) => ({ label, value }))}
                  isZh={isZh}
                  color="#8b5cf6"
                />
              </div>
            </div>
          </CollapsibleSection>

          {/* ===== 6. Text Feedback ===== */}
          <CollapsibleSection title={isZh ? '文字回饋' : 'Text Feedback'}>
            <div className="survey-demographics-grid">
              <div>
                <h3 className="survey-section-subtitle" style={{ marginBottom: 12, color: '#f87171' }}>
                  {isZh ? `改善建議 (${textFeedback.bad.length})` : `Improvement Suggestions (${textFeedback.bad.length})`}
                </h3>
                <FeedbackList items={textFeedback.bad} showAll={showAllBad} setShowAll={setShowAllBad} />
              </div>
              <div>
                <h3 className="survey-section-subtitle" style={{ marginBottom: 12, color: '#4ade80' }}>
                  {isZh ? `正面回饋 (${textFeedback.positive.length})` : `Positive Feedback (${textFeedback.positive.length})`}
                </h3>
                <FeedbackList items={textFeedback.positive} showAll={showAllPositive} setShowAll={setShowAllPositive} />
              </div>
            </div>
          </CollapsibleSection>
        </>
      )}

      {/* ===== 7. Upload (bottom, collapsible) ===== */}
      <CollapsibleSection title={isZh ? '上傳問卷 CSV' : 'Upload Survey CSV'} defaultOpen={false}>
        <p className="survey-section-subtitle">
          {isZh
            ? '從 Google Sheets 下載 CSV 後上傳對應地區的檔案'
            : 'Download CSV from Google Sheets and upload for each region'}
        </p>
        <div className="survey-upload-grid">
          {(['BC', 'CA', 'ON'] as Scope[]).map((r) => (
            <div key={r} className="survey-upload-card">
              <span className="survey-upload-region">{r}</span>
              <input ref={fileRefs[r]} type="file" accept=".csv"
                style={{ display: 'none' }} onChange={() => handleUpload(r)} />
              <button className="survey-upload-btn"
                onClick={() => fileRefs[r].current?.click()} disabled={uploading}>
                {uploading ? (isZh ? '上傳中…' : 'Uploading…') : (isZh ? '選擇檔案' : 'Choose File')}
              </button>
              {uploadResults.find((u) => u.region === r) && (
                <div className="survey-upload-result">
                  {(() => {
                    const ur = uploadResults.find((u) => u.region === r)!;
                    return (
                      <>
                        <span className="survey-upload-success">
                          {isZh ? `已處理 ${ur.inserted} 筆` : `${ur.inserted} processed`}
                        </span>
                        {ur.skipped > 0 && (
                          <span className="survey-upload-skip">
                            {isZh ? `${ur.skipped} 筆跳過` : `${ur.skipped} skipped`}
                          </span>
                        )}
                        {ur.errors.length > 0 && (
                          <span className="survey-upload-error">{ur.errors[0]}</span>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}
