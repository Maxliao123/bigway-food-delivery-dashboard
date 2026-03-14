import React, { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabaseClient';
import type { Lang, Scope } from '../App';
import { useSurveyData, computeStoreStats } from '../hooks/useSurveyData';
import type { StoreStats } from '../hooks/useSurveyData';

/* ------------------------------------------------------------------ */
/*  CSV → Supabase helpers                                            */
/* ------------------------------------------------------------------ */

/** Normalise column header: strip leading number/dot, trim whitespace */
function normaliseHeader(h: string): string {
  return h.replace(/^\d+\.\s*/, '').trim().toLowerCase();
}

/** Find column index whose normalised header includes `needle` */
function findCol(headers: string[], needle: string): number {
  return headers.findIndex((h) => normaliseHeader(h).includes(needle));
}

/** Parse US-style timestamp  "M/D/YYYY H:M:S"  →  ISO string */
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

async function uploadCsv(
  file: File,
  region: Scope,
): Promise<UploadResult> {
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
        const colTs = 0; // Timestamp is always col 0
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
        const colName = headers.findIndex(
          (h) => h.trim().toLowerCase() === 'name',
        );
        const colEmail = headers.findIndex((h) =>
          h.trim().toLowerCase().includes('email'),
        );

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

        // Upsert via RPC one-by-one (to bypass schema cache issue)
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

        resolve({
          region,
          total: records.length,
          inserted,
          skipped: rows.length - 1 - records.length,
          errors: errs,
        });
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Pie Chart SVG                                                     */
/* ------------------------------------------------------------------ */

interface PieSlice {
  label: string;
  value: number;
  color: string;
}

function PieChart({
  slices,
  size = 180,
  isZh,
}: {
  slices: PieSlice[];
  size?: number;
  isZh: boolean;
}) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) {
    return (
      <div className="survey-pie-empty">
        {isZh ? '沒有差評資料' : 'No negative reviews'}
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
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
      <path
        key={idx}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={sl.color}
        stroke="rgba(2,6,23,0.8)"
        strokeWidth={2}
      />,
    );

    // Label position at middle of arc
    const midAngle = cumAngle + angle / 2;
    const lr = r * 0.65;
    const lx = cx + lr * Math.cos(midAngle);
    const ly = cy + lr * Math.sin(midAngle);
    if (pct > 0.05) {
      labels.push(
        <text
          key={`l${idx}`}
          x={lx}
          y={ly}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize={12}
          fontWeight={600}
        >
          {(pct * 100).toFixed(0)}%
        </text>,
      );
    }

    cumAngle += angle;
  });

  return (
    <div className="survey-pie-container">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths}
        {labels}
      </svg>
      <div className="survey-pie-legend">
        {slices.map((sl, i) => (
          <div key={i} className="survey-pie-legend-item">
            <span
              className="survey-pie-legend-dot"
              style={{ background: sl.color }}
            />
            <span className="survey-pie-legend-label">
              {sl.label}: {sl.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main SurveyPanel                                                  */
/* ------------------------------------------------------------------ */

interface Props {
  language: Lang;
  selectedRegion: Scope;
}

export function SurveyPanel({ language, selectedRegion }: Props) {
  const isZh = language === 'zh';
  const { loading, error, data } = useSurveyData(selectedRegion);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRefs = {
    BC: useRef<HTMLInputElement>(null),
    CA: useRef<HTMLInputElement>(null),
    ON: useRef<HTMLInputElement>(null),
  };

  // Force re-fetch after upload
  const { data: liveData } = useSurveyData(selectedRegion);
  const displayData = refreshKey > 0 ? liveData : data;

  const storeStats = useMemo(
    () => computeStoreStats(displayData),
    [displayData],
  );

  // Aggregate pie data across all stores for current region
  const pieSlices = useMemo((): PieSlice[] => {
    let svc = 0, clean = 0, food = 0;
    for (const s of storeStats) {
      svc += s.serviceBad;
      clean += s.cleanlinessBad;
      food += s.foodBad;
    }
    return [
      {
        label: isZh ? '服務 (Service)' : 'Service',
        value: svc,
        color: '#f97316',
      },
      {
        label: isZh ? '衛生 (Cleanliness)' : 'Cleanliness',
        value: clean,
        color: '#06b6d4',
      },
      {
        label: isZh ? '食物品質 (Food)' : 'Food Quality',
        value: food,
        color: '#a855f7',
      },
    ];
  }, [storeStats, isZh]);

  const handleUpload = useCallback(
    async (region: Scope) => {
      const input = fileRefs[region].current;
      if (!input?.files?.length) return;
      setUploading(true);
      try {
        const result = await uploadCsv(input.files[0], region);
        setUploadResults((prev) => [
          result,
          ...prev.filter((r) => r.region !== region),
        ]);
        setRefreshKey((k) => k + 1);
      } finally {
        setUploading(false);
        if (input) input.value = '';
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Per-store pie data
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  const storePieSlices = useMemo((): PieSlice[] => {
    if (!selectedStore) return pieSlices;
    const s = storeStats.find((st) => st.storeName === selectedStore);
    if (!s) return pieSlices;
    return [
      {
        label: isZh ? '服務 (Service)' : 'Service',
        value: s.serviceBad,
        color: '#f97316',
      },
      {
        label: isZh ? '衛生 (Cleanliness)' : 'Cleanliness',
        value: s.cleanlinessBad,
        color: '#06b6d4',
      },
      {
        label: isZh ? '食物品質 (Food)' : 'Food Quality',
        value: s.foodBad,
        color: '#a855f7',
      },
    ];
  }, [selectedStore, storeStats, pieSlices, isZh]);

  const totalBadReviews = storeStats.reduce((s, st) => s + st.badReviews, 0);
  const totalResponses = storeStats.reduce((s, st) => s + st.totalResponses, 0);

  return (
    <div className="survey-panel">
      {/* ===== Upload Section ===== */}
      <section className="section-card survey-upload-section">
        <h2 className="survey-section-title">
          {isZh ? '上傳問卷 CSV' : 'Upload Survey CSV'}
        </h2>
        <p className="survey-section-subtitle">
          {isZh
            ? '從 Google Sheets 下載 CSV 後上傳對應地區的檔案'
            : 'Download CSV from Google Sheets and upload for each region'}
        </p>
        <div className="survey-upload-grid">
          {(['BC', 'CA', 'ON'] as Scope[]).map((r) => (
            <div key={r} className="survey-upload-card">
              <span className="survey-upload-region">{r}</span>
              <input
                ref={fileRefs[r]}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={() => handleUpload(r)}
              />
              <button
                className="survey-upload-btn"
                onClick={() => fileRefs[r].current?.click()}
                disabled={uploading}
              >
                {uploading
                  ? isZh
                    ? '上傳中…'
                    : 'Uploading…'
                  : isZh
                    ? '選擇檔案'
                    : 'Choose File'}
              </button>
              {uploadResults.find((u) => u.region === r) && (
                <div className="survey-upload-result">
                  {(() => {
                    const ur = uploadResults.find((u) => u.region === r)!;
                    return (
                      <>
                        <span className="survey-upload-success">
                          {isZh
                            ? `已處理 ${ur.inserted} 筆`
                            : `${ur.inserted} processed`}
                        </span>
                        {ur.skipped > 0 && (
                          <span className="survey-upload-skip">
                            {isZh
                              ? `${ur.skipped} 筆跳過`
                              : `${ur.skipped} skipped`}
                          </span>
                        )}
                        {ur.errors.length > 0 && (
                          <span className="survey-upload-error">
                            {ur.errors[0]}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ===== Loading / Error ===== */}
      {loading && (
        <div className="status status-loading">
          {isZh ? '載入問卷資料…' : 'Loading survey data…'}
        </div>
      )}
      {error && (
        <div className="status status-error">
          {isZh ? '錯誤：' : 'Error: '}
          {error}
        </div>
      )}

      {/* ===== Stats ===== */}
      {!loading && !error && (
        <>
          {/* KPI summary */}
          <section className="section-card">
            <div className="survey-kpi-row">
              <div className="survey-kpi-card">
                <div className="survey-kpi-value">{totalResponses}</div>
                <div className="survey-kpi-label">
                  {isZh ? '總回覆數' : 'Total Responses'}
                </div>
              </div>
              <div className="survey-kpi-card survey-kpi-bad">
                <div className="survey-kpi-value">{totalBadReviews}</div>
                <div className="survey-kpi-label">
                  {isZh ? '差評數 (≤3分)' : 'Bad Reviews (≤3)'}
                </div>
              </div>
              <div className="survey-kpi-card">
                <div className="survey-kpi-value">
                  {totalResponses > 0
                    ? ((totalBadReviews / totalResponses) * 100).toFixed(1) + '%'
                    : '—'}
                </div>
                <div className="survey-kpi-label">
                  {isZh ? '差評率' : 'Bad Review Rate'}
                </div>
              </div>
            </div>
          </section>

          {/* Two-column layout: table + pie */}
          <div className="survey-analysis-grid">
            {/* Bad review table */}
            <section className="section-card">
              <h2 className="survey-section-title">
                {isZh ? '門店差評統計' : 'Store Bad Review Stats'}
              </h2>
              <div className="survey-table-wrap">
                <table className="survey-table">
                  <thead>
                    <tr>
                      <th>{isZh ? '門店' : 'Store'}</th>
                      <th>{isZh ? '回覆數' : 'Responses'}</th>
                      <th>{isZh ? '差評數' : 'Bad Reviews'}</th>
                      <th>{isZh ? '差評率' : 'Rate'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeStats.map((s) => (
                      <tr
                        key={s.storeName}
                        className={
                          selectedStore === s.storeName
                            ? 'survey-table-row-active'
                            : ''
                        }
                        onClick={() =>
                          setSelectedStore(
                            selectedStore === s.storeName
                              ? null
                              : s.storeName,
                          )
                        }
                      >
                        <td className="survey-table-store">{s.storeName}</td>
                        <td>{s.totalResponses}</td>
                        <td
                          className={
                            s.badReviews > 0 ? 'survey-table-bad' : ''
                          }
                        >
                          {s.badReviews}
                        </td>
                        <td>{(s.badRate * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                    {storeStats.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', opacity: 0.5 }}>
                          {isZh ? '尚無資料' : 'No data yet'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Pie chart */}
            <section className="section-card">
              <h2 className="survey-section-title">
                {isZh ? '差評原因分佈' : 'Bad Review Reasons'}
              </h2>
              <p className="survey-section-subtitle">
                {selectedStore
                  ? `${selectedStore} — ${isZh ? '點擊表格切換門店' : 'Click table to switch store'}`
                  : isZh
                    ? `${selectedRegion} 全部門店 — 點擊左側表格可查看單店`
                    : `All ${selectedRegion} stores — Click table for single store`}
              </p>
              <PieChart slices={storePieSlices} isZh={isZh} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
