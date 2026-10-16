import React from 'react';
import Plot from 'react-plotly.js';
import { THEMES, ThemeName } from '../theme/colors';

interface PlotlyChartProps {
  data: any[];
  layout?: any;
  theme?: ThemeName;
  height?: number;
  className?: string;
}

export const PlotlyChart: React.FC<PlotlyChartProps> = ({
  data,
  layout = {},
  theme = 'dark',
  height = 340,
  className = '',
}) => {
  const t = THEMES[theme];

  const defaultLayout = {
    autosize: true,
    height,
    margin: { l: 45, r: 25, t: 30, b: 40 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      family: "'Plus Jakarta Sans', system-ui, sans-serif",
      color: t.tick,
      size: 11,
    },
    xaxis: {
      gridcolor: t.grid,
      zerolinecolor: t.grid,
      tickcolor: t.grid,
      color: t.tick,
      showline: false,
    },
    yaxis: {
      gridcolor: t.grid,
      zerolinecolor: t.grid,
      tickcolor: t.grid,
      color: t.tick,
      showline: false,
    },
    hoverlabel: {
      bgcolor: theme === 'dark' ? '#1F2937' : '#FFFFFF',
      bordercolor: t.border,
      font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, color: t.text },
    },
    legend: {
      orientation: 'h',
      x: 0,
      y: 1.12,
      font: { color: t.textMuted, size: 11 },
    },
    ...layout,
  };

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <Plot
        data={data}
        layout={defaultLayout}
        config={{
          responsive: true,
          displayModeBar: false,
          showTips: false,
        }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
