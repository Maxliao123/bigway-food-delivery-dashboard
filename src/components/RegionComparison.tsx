import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useTrendData } from '../hooks/useTrendData';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function formatMonthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

type Props = {
  selectedRegion: string;
  selectedMonth: string;
};

export const RegionComparison: React.FC<Props> = ({ selectedRegion, selectedMonth }) => {
  const { loading, error, months, regions, rows } = useTrendData();

  const { labels, datasets } = useMemo(() => {
    if (months.length === 0 || regions.length === 0) {
      return { labels: [] as string[], datasets: [] as any[] };
    }

    const selectedIdx = months.indexOf(selectedMonth);
    const lastThree =
      selectedIdx === -1
        ? months.slice(-3)
        : months.slice(Math.max(0, selectedIdx - 2), selectedIdx + 1);
    const labels = regions.filter((r) => r === selectedRegion);

    const baseColors = [
      'rgba(59, 130, 246, 0.7)',  // blue
      'rgba(16, 185, 129, 0.7)',  // green
      'rgba(234, 179, 8, 0.7)',   // amber
    ];

    const borderColors = [
      'rgba(59, 130, 246, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(234, 179, 8, 1)',
    ];

    const datasets = lastThree.map((month, idx) => {
      const data = labels.map(region => {
        return rows
          .filter(r => r.month === month && r.region === region)
          .reduce((sum, r) => sum + r.revenue, 0);
      });

      return {
        label: formatMonthLabel(month),
        data,
        backgroundColor: baseColors[idx % baseColors.length],
        borderColor: borderColors[idx % borderColors.length],
        borderWidth: 1,
      };
    });

    return { labels, datasets };
  }, [months, regions, rows]);

  if (loading) {
    return <div style={{ fontSize: 13 }}>Loading region comparison...</div>;
  }

  if (error) {
    return (
      <div style={{ fontSize: 13, color: '#f97373' }}>
        Error loading region comparison: {error}
      </div>
    );
  }

  if (labels.length === 0 || datasets.length === 0) return null;

  const chartData = {
    labels,
    datasets,
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
            return `${ctx.dataset.label}: $${v.toLocaleString()}`;
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
        Region Revenue Comparison (Last 3 Months)
      </h2>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
        BC / ON / USA (or other regions) revenue comparison across the latest three months.
      </p>
      <div
        style={{
          borderRadius: 16,
          border: '1px solid #4b5563',
          background: '#020617',
          padding: '12px 16px',
        }}
      >
        <Bar data={chartData} options={options} />
      </div>
    </section>
  );
};
