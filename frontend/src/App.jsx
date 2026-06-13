import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import TransactionList from './components/TransactionList';
import GenerationList from './components/GenerationList';
import { LayoutDashboard, Receipt, Users, Building2, HelpCircle } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '40px', paddingLeft: '10px' }}>
          <Building2 size={28} color="#6366F1" />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.5px', background: 'linear-gradient(to right, #6366F1, #34D399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            MoneyMan
          </h1>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            className="btn-nav"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              textAlign: 'left',
              fontWeight: 500,
              fontSize: '0.95rem',
              backgroundColor: activeTab === 'dashboard' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'dashboard' ? '#818CF8' : 'var(--text-muted)',
              borderLeft: activeTab === 'dashboard' ? '3px solid #6366F1' : '3px solid transparent',
              transition: 'var(--transition-smooth)'
            }}
          >
            <LayoutDashboard size={20} />
            대시보드
          </button>

          <button
            onClick={() => setActiveTab('transactions')}
            className="btn-nav"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              textAlign: 'left',
              fontWeight: 500,
              fontSize: '0.95rem',
              backgroundColor: activeTab === 'transactions' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'transactions' ? '#818CF8' : 'var(--text-muted)',
              borderLeft: activeTab === 'transactions' ? '3px solid #6366F1' : '3px solid transparent',
              transition: 'var(--transition-smooth)'
            }}
          >
            <Receipt size={20} />
            입출금 내역
          </button>

          <button
            onClick={() => setActiveTab('generations')}
            className="btn-nav"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              textAlign: 'left',
              fontWeight: 500,
              fontSize: '0.95rem',
              backgroundColor: activeTab === 'generations' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'generations' ? '#818CF8' : 'var(--text-muted)',
              borderLeft: activeTab === 'generations' ? '3px solid #6366F1' : '3px solid transparent',
              transition: 'var(--transition-smooth)'
            }}
          >
            <Users size={20} />
            세대 & 수납 관리
          </button>
        </nav>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HelpCircle size={18} color="var(--text-muted)" />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>빌라 관리비 앱 v1.0</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content fade-in">
        {activeTab === 'dashboard' && <Dashboard refreshTrigger={refreshTrigger} onDataChange={triggerRefresh} />}
        {activeTab === 'transactions' && <TransactionList refreshTrigger={refreshTrigger} onDataChange={triggerRefresh} />}
        {activeTab === 'generations' && <GenerationList refreshTrigger={refreshTrigger} onDataChange={triggerRefresh} />}
      </main>
    </div>
  );
}

export default App;
