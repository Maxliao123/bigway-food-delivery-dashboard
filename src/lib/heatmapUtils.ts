export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return (value * 100).toFixed(1) + '%';
}

export function getMoMColor(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '#111827'; // 無資料：深灰
  }
  if (value > 0.2) return '#065f46';      // > 20% 深綠
  if (value > 0.05) return '#16a34a';     // 5~20% 中綠
  if (value > 0) return '#6ee7b7';        // 0~5% 淺綠
  if (value > -0.05) return '#fecaca';    // -5~0 淺紅
  if (value > -0.2) return '#f97373';     // -20~-5 中紅
  return '#7f1d1d';                       // < -20 深紅
}

export function formatMonthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
