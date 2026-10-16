import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number | null;
  unit?: string;
  subtext?: string;
  color?: string;
  icon?: React.ReactNode;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  unit,
  subtext,
  color = '#38BDF8',
  icon,
}) => {
  return (
    <div
      className="kpi-card"
      style={{ '--kpi-color': color } as React.CSSProperties}
    >
      <div className="kpi-header">
        <span className="kpi-title">{title}</span>
        {icon && <div className="kpi-icon">{icon}</div>}
      </div>
      <div className="kpi-value-row">
        <span className="kpi-value">{value !== null && value !== undefined ? value : '—'}</span>
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {subtext && <div className="kpi-subtext">{subtext}</div>}
    </div>
  );
};
