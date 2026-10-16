import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { X, RefreshCw, Upload, Smartphone, Watch, CheckCircle2, AlertCircle, Database } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'garmin' | 'apple' | 'demo'>('apple');

  // Garmin states
  const [garminEmail, setGarminEmail] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [garminDays, setGarminDays] = useState(30);

  // Apple states
  const [applePath, setApplePath] = useState('~/Downloads/export.zip');

  // Status
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll sync status if processing
  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      interval = setInterval(async () => {
        try {
          const res = await api.getSyncStatus();
          if (res.message) setStatusMessage(res.message);
          if (!res.running) {
            setIsProcessing(false);
            onSuccess();
          }
        } catch (e) {
          console.error(e);
        }
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isProcessing, onSuccess]);

  if (!isOpen) return null;

  const handleGarminSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsProcessing(true);
    setStatusMessage('Initiating Garmin Connect live session...');
    try {
      await api.syncGarmin({ email: garminEmail, password: garminPassword }, garminDays);
    } catch (err: any) {
      setError(err.message || 'Garmin sync failed');
      setIsProcessing(false);
    }
  };

  const handleAppleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsProcessing(true);
    setStatusMessage('Extracting and parsing Apple Health archive...');
    try {
      await api.importAppleHealthPath(applePath);
    } catch (err: any) {
      setError(err.message || 'Apple Health import failed');
      setIsProcessing(false);
    }
  };

  const handleSeedDemo = async () => {
    setError(null);
    setIsProcessing(true);
    setStatusMessage('Generating combined Apple Health & Garmin dataset (45 days)...');
    try {
      await api.seedDemo(45);
      setStatusMessage('Demo data seeded successfully!');
      setTimeout(() => {
        setIsProcessing(false);
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to seed sample data');
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '8px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '10px', color: '#38BDF8' }}>
            <Database size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Data Import & Live Sync</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Combine datasets seamlessly from Apple Health & Garmin Connect.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <button
            className={`pill-btn ${activeTab === 'apple' ? 'active' : ''}`}
            onClick={() => setActiveTab('apple')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Smartphone size={15} /> Apple Health (export.zip)
          </button>
          <button
            className={`pill-btn ${activeTab === 'garmin' ? 'active' : ''}`}
            onClick={() => setActiveTab('garmin')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Watch size={15} /> Garmin Live Sync
          </button>
          <button
            className={`pill-btn ${activeTab === 'demo' ? 'active' : ''}`}
            onClick={() => setActiveTab('demo')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Database size={15} /> Sample / Demo Data
          </button>
        </div>

        {/* Status / Message Banner */}
        {statusMessage && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38BDF8',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <RefreshCw size={16} className={isProcessing ? 'animate-spin' : ''} />
            <span>{statusMessage}</span>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#EF4444',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Apple Health Tab */}
        {activeTab === 'apple' && (
          <form onSubmit={handleAppleImport} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Local Path to Apple Health Export</label>
              <input
                type="text"
                className="form-input"
                value={applePath}
                onChange={(e) => setApplePath(e.target.value)}
                placeholder="~/Downloads/export.zip"
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                Reads directly from your local filesystem without browser upload limits.
              </span>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={isProcessing}
              style={{ justifyContent: 'center' }}
            >
              {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
              Start Apple Health Import
            </button>
          </form>
        )}

        {/* Garmin Connect Live Tab */}
        {activeTab === 'garmin' && (
          <form onSubmit={handleGarminSync} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Garmin Connect Email</label>
              <input
                type="email"
                className="form-input"
                value={garminEmail}
                onChange={(e) => setGarminEmail(e.target.value)}
                placeholder="runner@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Garmin Connect Password</label>
              <input
                type="password"
                className="form-input"
                value={garminPassword}
                onChange={(e) => setGarminPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>
                Tokens are saved locally in .garmin_tokens/ for continuous password-free syncs.
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">Sync Period (Days)</label>
              <select
                className="form-input"
                value={garminDays}
                onChange={(e) => setGarminDays(Number(e.target.value))}
              >
                <option value={14}>Last 14 Days</option>
                <option value={30}>Last 30 Days (Recommended)</option>
                <option value={60}>Last 60 Days</option>
                <option value={90}>Last 90 Days</option>
              </select>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={isProcessing}
              style={{ justifyContent: 'center' }}
            >
              {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <Watch size={16} />}
              Connect & Sync Garmin Data
            </button>
          </form>
        )}

        {/* Demo Tab */}
        {activeTab === 'demo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Want to explore the charts and activity selector immediately? Click below to populate
              realistic multi-source timelines (heart rate, HRV, sleep stages, running, cycling, hiking).
            </p>
            <button
              onClick={handleSeedDemo}
              className="btn-secondary"
              disabled={isProcessing}
              style={{ justifyContent: 'center', background: 'rgba(56, 189, 248, 0.08)', borderColor: '#38BDF8', color: '#38BDF8' }}
            >
              <Database size={16} /> Load 45 Days Demo Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
