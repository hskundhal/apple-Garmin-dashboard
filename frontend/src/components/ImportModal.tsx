import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { X, RefreshCw, Upload, Smartphone, Watch, CheckCircle2, AlertCircle, Database, Check, KeyRound, Terminal } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  hasRealData?: boolean;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onSuccess, hasRealData }) => {
  const [activeTab, setActiveTab] = useState<'garmin' | 'apple' | 'demo'>('apple');

  // Garmin states
  const [garminEmail, setGarminEmail] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [garminDays, setGarminDays] = useState(30);
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [showPasscodeField, setShowPasscodeField] = useState(false);

  // Apple states
  const [applePath, setApplePath] = useState('~/Downloads/export.zip');

  // Status
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset status on modal open or tab change
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsCompleted(false);
      setStatusMessage(null);
      setNeedsMfa(false);
      setMfaCode('');
      setShowPasscodeField(false);
      if (hasRealData && activeTab === 'demo') {
        setActiveTab('apple');
      }
    }
  }, [isOpen, activeTab, hasRealData]);

  // Poll sync status if processing
  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      interval = setInterval(async () => {
        try {
          const res = await api.getSyncStatus();
          if (res.message) setStatusMessage(res.message);

          if (res.needs_mfa) {
            setNeedsMfa(true);
            setShowPasscodeField(true);
            setIsProcessing(false);
            return;
          }

          if (!res.running) {
            setIsProcessing(false);
            onSuccess();
            if (res.message && res.message.toLowerCase().includes('error')) {
              setError(res.message);
            } else {
              setIsCompleted(true);
            }
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
    if (isCompleted) {
      handleDoneClose();
      return;
    }

    const effectiveMfa = mfaCode.trim();

    // If an MFA passcode is entered or required:
    if (needsMfa || (showPasscodeField && effectiveMfa)) {
      if (!effectiveMfa) {
        setError('Please enter the security passcode sent by Garmin');
        return;
      }
      setError(null);
      setIsProcessing(true);
      setStatusMessage('Verifying Garmin security passcode...');
      try {
        await api.submitGarminMfa(effectiveMfa);
      } catch (err: any) {
        // Fallback: try syncGarmin with mfa_code parameter
        try {
          await api.syncGarmin({ email: garminEmail, password: garminPassword, mfa_code: effectiveMfa }, garminDays);
        } catch (err2: any) {
          setError(err2.message || err.message || 'Passcode verification failed');
          setIsProcessing(false);
        }
      }
      return;
    }

    setError(null);
    setIsCompleted(false);
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
    if (isCompleted) {
      handleDoneClose();
      return;
    }
    setError(null);
    setIsCompleted(false);
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
    if (isCompleted) {
      handleDoneClose();
      return;
    }
    setError(null);
    setIsCompleted(false);
    setIsProcessing(true);
    setStatusMessage('Generating combined Apple Health & Garmin dataset (45 days)...');
    try {
      await api.seedDemo(45);
      setStatusMessage('Demo data seeded successfully!');
      setIsProcessing(false);
      setIsCompleted(true);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to seed sample data');
      setIsProcessing(false);
    }
  };

  const handleDoneClose = () => {
    setIsCompleted(false);
    setStatusMessage(null);
    setError(null);
    setNeedsMfa(false);
    setShowPasscodeField(false);
    onSuccess();
    onClose();
  };

  const isMfaActive = needsMfa || showPasscodeField;

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
            disabled={isProcessing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Smartphone size={15} /> Apple Health (export.zip)
          </button>
          <button
            className={`pill-btn ${activeTab === 'garmin' ? 'active' : ''}`}
            onClick={() => setActiveTab('garmin')}
            disabled={isProcessing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Watch size={15} /> Garmin Live Sync
          </button>
          {/* Demo tab hidden once real data has been imported */}
          {!hasRealData && (
            <button
              className={`pill-btn ${activeTab === 'demo' ? 'active' : ''}`}
              onClick={() => setActiveTab('demo')}
              disabled={isProcessing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Database size={15} /> Sample / Demo Data
            </button>
          )}
        </div>

        {/* Success Confirmation Banner when completed */}
        {isCompleted && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10B981',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#10B981' }}>
                Import Completed!
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {statusMessage || 'Your health metrics and activities are up to date.'}
              </div>
            </div>
          </div>
        )}

        {/* Processing Status Banner */}
        {isProcessing && statusMessage && (
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
            <RefreshCw size={16} className="animate-spin" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Error Banner */}
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
                disabled={isProcessing || isCompleted}
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
              style={{
                justifyContent: 'center',
                ...(isCompleted ? { background: '#10B981', borderColor: '#10B981', color: '#FFFFFF' } : {})
              }}
            >
              {isProcessing && <RefreshCw size={16} className="animate-spin" />}
              {!isProcessing && !isCompleted && <Upload size={16} />}
              {isCompleted && <Check size={16} />}
              {isProcessing ? 'Importing Apple Health...' : isCompleted ? 'Done' : 'Start Apple Health Import'}
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
                disabled={isProcessing || isCompleted}
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
                disabled={isProcessing || isCompleted}
                required
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)' }}>
                Tokens are saved locally in .garmin_tokens/ for continuous password-free syncs.
              </span>
            </div>

            {/* Quick Toggle to show Passcode input anytime */}
            {!isCompleted && !needsMfa && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <button
                  type="button"
                  onClick={() => setShowPasscodeField(!showPasscodeField)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38BDF8',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <KeyRound size={14} />
                  {showPasscodeField
                    ? 'Hide passcode field'
                    : 'Already received a security code on your email/phone? Click here to enter it'}
                </button>
              </div>
            )}

            {/* Passcode / MFA Entry Box */}
            {isMfaActive && !isCompleted && (
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.08)',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38BDF8', fontWeight: 700 }}>
                  <KeyRound size={20} />
                  <span>Garmin Security Passcode (Verification Code)</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                  Enter the 6-digit one-time verification passcode sent by Garmin to your email or SMS:
                </p>
                <input
                  type="text"
                  className="form-input"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="e.g. 123456"
                  autoFocus
                  disabled={isProcessing}
                  required
                  style={{
                    fontSize: '1.25rem',
                    letterSpacing: '4px',
                    textAlign: 'center',
                    fontWeight: 700,
                    padding: '10px',
                  }}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Sync Period (Days)</label>
              <select
                className="form-input"
                value={garminDays}
                onChange={(e) => setGarminDays(Number(e.target.value))}
                disabled={isProcessing || isCompleted}
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
              style={{
                justifyContent: 'center',
                ...(isCompleted ? { background: '#10B981', borderColor: '#10B981', color: '#FFFFFF' } : {})
              }}
            >
              {isProcessing && <RefreshCw size={16} className="animate-spin" />}
              {!isProcessing && !isCompleted && !isMfaActive && <Watch size={16} />}
              {!isProcessing && !isCompleted && isMfaActive && <KeyRound size={16} />}
              {isCompleted && <Check size={16} />}
              {isProcessing
                ? (isMfaActive ? 'Verifying Passcode...' : 'Connecting & Syncing...')
                : isCompleted
                ? 'Done'
                : isMfaActive
                ? 'Submit Passcode & Complete Sync'
                : 'Connect & Sync Garmin Data'}
            </button>

            {/* Optional Terminal CLI note */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.74rem',
              color: 'var(--text-subtle)',
              marginTop: '4px',
              paddingTop: '8px',
              borderTop: '1px solid var(--border)'
            }}>
              <Terminal size={13} />
              <span>Or run in terminal: <code>./scripts/garmin_login.py</code></span>
            </div>
          </form>
        )}

        {/* Demo Tab (Only available if no real data has been imported) */}
        {!hasRealData && activeTab === 'demo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Want to explore the charts and activity selector immediately? Click below to populate
              realistic multi-source timelines (heart rate, HRV, sleep stages, running, cycling, hiking).
            </p>
            <button
              onClick={handleSeedDemo}
              className="btn-secondary"
              disabled={isProcessing}
              style={{
                justifyContent: 'center',
                ...(isCompleted
                  ? { background: '#10B981', borderColor: '#10B981', color: '#FFFFFF' }
                  : { background: 'rgba(56, 189, 248, 0.08)', borderColor: '#38BDF8', color: '#38BDF8' })
              }}
            >
              {isProcessing && <RefreshCw size={16} className="animate-spin" />}
              {!isProcessing && !isCompleted && <Database size={16} />}
              {isCompleted && <Check size={16} />}
              {isProcessing ? 'Generating Demo Data...' : isCompleted ? 'Done' : 'Load 45 Days Demo Data'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
