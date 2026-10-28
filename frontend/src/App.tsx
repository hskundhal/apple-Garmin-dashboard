import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from '@tanstack/react-query';
import { ThemeName } from './theme/colors';
import { Header } from './components/Header';
import { HealthTab } from './components/HealthTab';
import { ActivityTab } from './components/ActivityTab';
import { ImportModal } from './components/ImportModal';
import { HeartPulse, Activity as ActivityIcon } from 'lucide-react';
import { api, demoApi } from './api/client';
import './theme/styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function DashboardContent() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'health' | 'activity'>('health');
  const [theme, setTheme] = useState<ThemeName>('light');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Default to past 30 days
  const today = new Date();
  const past30 = new Date();
  past30.setDate(today.getDate() - 30);

  const [startDate, setStartDate] = useState(past30.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

  // Demo status query
  const { data: demoStatusData } = useQuery({
    queryKey: ['demoStatus'],
    queryFn: () => demoApi.getStatus(),
  });
  // Meta query for date bounds
  const { data: meta } = useQuery({
    queryKey: ['meta'],
    queryFn: () => api.getMeta(),
  });

  useEffect(() => {
    if (meta && meta.max_date) {
      const endD = new Date(meta.max_date);
      const startD = new Date(meta.max_date);
      startD.setDate(endD.getDate() - 30);
      setStartDate(startD.toISOString().split('T')[0]);
      setEndDate(meta.max_date);
    }
  }, [meta]);

  const isDemo = demoStatusData?.enabled ?? false;

  // Synchronize theme attribute to DOM root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleToggleDemo = async (enable: boolean) => {
    setIsRefreshing(true);
    try {
      await demoApi.toggle(enable);
      await qc.invalidateQueries();
    } catch (e) {
      console.error('Demo toggle failed', e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await qc.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenImport={() => setIsImportOpen(true)}
        startDate={startDate}
        endDate={endDate}
        onChangeDates={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        isDemo={isDemo}
        onToggleDemo={handleToggleDemo}
        hasRealData={meta?.has_real_data}
      />

      {/* Main Tabs Navigation */}
      <nav className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          <HeartPulse size={18} />
          Health & Sleep Timelines
        </button>
        <button
          className={`tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          <ActivityIcon size={18} />
          Activities & Performance
        </button>
      </nav>

      {/* Active Tab View */}
      <main>
        {activeTab === 'health' ? (
          <HealthTab startDate={startDate} endDate={endDate} theme={theme} />
        ) : (
          <ActivityTab startDate={startDate} endDate={endDate} theme={theme} />
        )}
      </main>

      {/* Import / Sync Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        hasRealData={meta?.has_real_data}
        onSuccess={() => {
          qc.invalidateQueries();
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardContent />
    </QueryClientProvider>
  );
}
