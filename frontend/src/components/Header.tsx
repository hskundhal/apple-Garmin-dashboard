import React from 'react';
import { ThemeName } from '../theme/colors';
import { Zap, Sun, Moon, Database, RefreshCw, Calendar, Sparkles } from 'lucide-react';

interface HeaderProps {
  theme: ThemeName;
  onToggleTheme: () => void;
  onOpenImport: () => void;
  startDate: string;
  endDate: string;
  onChangeDates: (start: string, end: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  isDemo: boolean;
  onToggleDemo: (enabled: boolean) => void;
  hasRealData?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  onOpenImport,
  startDate,
  endDate,
  onChangeDates,
  onRefresh,
  isRefreshing,
  isDemo,
  onToggleDemo,
  hasRealData,
}) => {
  const applyPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    onChangeDates(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
  };

  const isCurrentPreset = (days: number) => {
    const end = new Date().toISOString().split('T')[0];
    const expectedStart = new Date();
    expectedStart.setDate(new Date().getDate() - days);
    const startStr = expectedStart.toISOString().split('T')[0];
    return startDate === startStr && endDate === end;
  };

  return (
    <header className="app-header">
      {/* Brand & Title */}
      <div className="brand-section">
        <div className="brand-logo-badge">
          <Zap size={24} />
        </div>
        <div className="brand-text">
          <h1>
            Health & Activity
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8' }}>
              APPLE + GARMIN
            </span>
          </h1>
          <p className="brand-subtitle">
            Unified Biometrics, Heart Timelines & Multisport Performance
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="header-actions">
        {/* Demo Mode Toggle Switch (Hidden once real data is imported) */}
        {!hasRealData && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: isDemo ? 'rgba(56, 189, 248, 0.12)' : 'var(--card-glass)',
              border: `1px solid ${isDemo ? 'rgba(56, 189, 248, 0.35)' : 'var(--border)'}`,
              padding: '4px 10px',
              borderRadius: '10px',
              transition: 'all 0.2s ease',
            }}
          >
            <Sparkles size={14} color={isDemo ? '#38BDF8' : 'var(--text-muted)'} />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isDemo ? '#38BDF8' : 'var(--text-muted)' }}>
              Demo Data: <b style={{ color: isDemo ? '#38BDF8' : 'var(--text-subtle)' }}>{isDemo ? 'ON' : 'OFF'}</b>
            </span>
            <button
              onClick={() => onToggleDemo(!isDemo)}
              style={{
                width: '36px',
                height: '20px',
                borderRadius: '999px',
                background: isDemo ? '#38BDF8' : 'var(--border)',
                position: 'relative',
                padding: '2px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              title={isDemo ? 'Turn Demo Data OFF (clears demo data)' : 'Turn Demo Data ON (loads sample data)'}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  transform: isDemo ? 'translateX(16px)' : 'translateX(0)',
                  transition: 'transform 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </button>
          </div>
        )}

        {/* Preset Range Pills */}
        <div className="date-presets" style={{ background: 'var(--card-glass)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
          {[
            { label: '7D', days: 7 },
            { label: '14D', days: 14 },
            { label: '30D', days: 30 },
            { label: '90D', days: 90 },
          ].map((preset) => (
            <button
              key={preset.label}
              className={`preset-btn ${isCurrentPreset(preset.days) ? 'active' : ''}`}
              onClick={() => applyPreset(preset.days)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Date pickers */}
        <div className="date-inputs">
          <Calendar size={15} />
          <input
            type="date"
            className="date-field"
            value={startDate}
            onChange={(e) => onChangeDates(e.target.value, endDate)}
          />
          <span>to</span>
          <input
            type="date"
            className="date-field"
            value={endDate}
            onChange={(e) => onChangeDates(startDate, e.target.value)}
          />
        </div>

        {/* Sync/Import Button */}
        <button className="btn-primary" onClick={onOpenImport}>
          <Database size={16} /> Import / Sync
        </button>

        {/* Refresh Button */}
        <button className="btn-secondary" onClick={onRefresh} title="Refresh data">
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
        </button>

        {/* Dark/Light Mode Toggle */}
        <button className="btn-secondary" onClick={onToggleTheme} title="Toggle Theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
};
