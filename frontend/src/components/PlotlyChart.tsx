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
  theme = 'light',
  height = 300,
  className = '',
}) => {
  const t = THEMES[theme];
  const isLight = theme === 'light';

  const defaultLayout = {
    autosize: true,
    height,
    margin: { l: 46, r: 20, t: 24, b: 38 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      family: "'Plus Jakarta Sans', system-ui, sans-serif",
      color: t.tick,
      size: 11,
    },
    xaxis: {
      gridcolor: t.grid,
      zerolinecolor: 'rgba(0,0,0,0)',
      tickcolor: 'rgba(0,0,0,0)',
      color: t.tick,
      showline: false,
      tickfont: { size: 10, color: t.textMuted },
      // Show ticks cleanly
      nticks: 8,
    },
    yaxis: {
      gridcolor: t.grid,
      zerolinecolor: 'rgba(0,0,0,0)',
      tickcolor: 'rgba(0,0,0,0)',
      color: t.tick,
      showline: false,
      tickfont: { size: 10, color: t.textMuted },
      // Add small padding so markers don't clip
      rangemode: 'tozero' as const,
    },
    hoverlabel: {
      bgcolor: isLight ? 'rgba(255,255,255,0.98)' : 'rgba(15,23,42,0.97)',
      bordercolor: isLight ? '#0284C7' : '#38BDF8',
      font: {
        family: "'Plus Jakarta Sans', system-ui, sans-serif",
        size: 12,
        color: isLight ? '#0F172A' : '#F8FAFC',
      },
      namelength: -1,
      align: 'left' as const,
    },
    // Unified crosshair hover — shows all series values at once
    hovermode: 'x unified' as const,
    legend: {
      orientation: 'h' as const,
      x: 0,
      y: 1.16,
      font: { color: t.textMuted, size: 10 },
      bgcolor: 'rgba(0,0,0,0)',
      traceorder: 'normal' as const,
    },
    // Subtle spike line to guide the eye
    xaxis_spikecolor: isLight ? 'rgba(2,132,199,0.25)' : 'rgba(56,189,248,0.25)',
    xaxis_spikethickness: 1,
    xaxis_spikedash: 'dot',
    xaxis_spikemode: 'across',
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
            'autoScale2d',
          ],
          displaylogo: false,
          showTips: false,
          // Smoother interactions
          scrollZoom: false,
        }}
        useResizeHandler
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
