import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useTrendData } from '../hooks/useTrendData';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

function formatMonthLabel(iso: string): string {
  // '2025-10-01' -> 'Oct 2025'
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

type Props = {
  selectedRegion: string;
  selectedMonth: string;
};

export const RevenueTrend: React.FC<Props> = ({ selectedRegion, selectedMonth }) => {
  const { loading, error, months, rows } = useTrendData();

  const { labels, data } = useMemo(() => {
    if (months.length === 0) {
      return { labels: [] as string[], data: [] as number[] };
    }

    const selectedIdx = months.indexOf(selectedMonth);
    const lastThree =
      selectedIdx === -1
        ? months.slice(-3)
        : months.slice(Math.max(0, selectedIdx - 2), selectedIdx + 1);
    const labels = lastThree.map(formatMonthLabel);

    const data = lastThree.map(month => {
      return rows
        .filter(r => r.month === month && r.region === selectedRegion)
        .reduce((sum, r) => sum + r.revenue, 0);
    });

    return { labels, data };
  }, [months, rows]);

  if (loading) {
    return <div style={{ fontSize: 13 }}>Loading revenue trend...</div>;
  }

  if (error) {
    return (
      <div style={{ fontSize: 13, color: '#f97373' }}>
        Error loading revenue trend: {error}
      </div>
    );
  }

  if (labels.length === 0) return null;

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Total Revenue (3 months)',
        data,
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.25)',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 5,
        tension: 0.25,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: '#e5e7eb',
          font: { size: 11 },
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const v = ctx.raw as number;
            return ' Revenue: $' + v.toLocaleString();
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#9ca3af', font: { size: 11 } },
        grid: { color: 'rgba(31,41,55,0.8)' },
      },
      y: {
        ticks: {
          color: '#9ca3af',
          font: { size: 11 },
          callback: (value: any) => '$' + Number(value).toLocaleString(),
        },
        grid: { color: 'rgba(31,41,55,0.6)' },
      },
    },
  } as const;

  return (
    <section>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
        Revenue Trend (Last 3 Months)
      </h2>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
        Company-wide revenue trend across the latest three months.
      </p>
      <div
        style={{
          borderRadius: 16,
          border: '1px solid #4b5563',
          background: '#020617',
          padding: '12px 16px',
        }}
      >
        <Line data={chartData} options={options} />
      </div>
    </section>
  );
};
