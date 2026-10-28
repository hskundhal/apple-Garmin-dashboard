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
    margin: { l: 50, r: 28, t: 32, b: 44 },
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
      tickfont: { size: 10 },
    },
    yaxis: {
      gridcolor: t.grid,
      zerolinecolor: t.grid,
      tickcolor: t.grid,
      color: t.tick,
      showline: false,
      tickfont: { size: 10 },
    },
    hoverlabel: {
      bgcolor: theme === 'dark' ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.97)',
      bordercolor: theme === 'dark' ? '#38BDF8' : '#0284C7',
      font: {
        family: "'Plus Jakarta Sans', system-ui, sans-serif",
        size: 13,
        color: theme === 'dark' ? '#F8FAFC' : '#0F172A',
      },
      namelength: -1,
    },
    hovermode: 'x unified',
    legend: {
      orientation: 'h',
      x: 0,
      y: 1.14,
      font: { color: t.textMuted, size: 11 },
      bgcolor: 'rgba(0,0,0,0)',
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
          displayModeBar: true,
          modeBarButtonsToRemove: [
            'select2d', 'lasso2d', 'toggleSpikelines',
            'hoverCompareCartesian', 'hoverClosestCartesian',
          ],
          displaylogo: false,
          showTips: false,
        }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
