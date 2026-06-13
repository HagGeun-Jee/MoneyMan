import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, RefreshCw, Image as ImageIcon, X } from 'lucide-react';
import { supabase } from '../supabaseClient';

const COLORS = ['#6366F1', '#34D399', '#EF4444', '#F59E0B', '#A78BFA', '#EC4899'];

function Dashboard({ refreshTrigger, onDataChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState(null); // 영수증 보기 모달 상태 추가

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // 1) 전체 거래 정보 가져오기 (대시보드 통계 연산용)
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('type, amount, date, category');
        
      if (txError) throw txError;
      
      // 2) 최근 거래 내역 (최대 10개)
      const { data: recentTransactions, error: recentError } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .limit(10);
        
      if (recentError) throw recentError;

      // --- 통계 가공 시작 ---
      const txList = transactions || [];
      
      // 1) 전체 잔액
      const totalBalance = txList.reduce((acc, tx) => {
        return tx.type === 'IN' ? acc + tx.amount : acc - tx.amount;
      }, 0);

      // 2) 이번 달 총 입금/출금
      const today = new Date();
      const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM
      const thisMonthTransactions = txList.filter(tx => tx.date && tx.date.startsWith(currentMonth));
      
      const monthlyIncome = thisMonthTransactions
        .filter(tx => tx.type === 'IN')
        .reduce((acc, tx) => acc + tx.amount, 0);
        
      const monthlyExpense = thisMonthTransactions
        .filter(tx => tx.type === 'OUT')
        .reduce((acc, tx) => acc + tx.amount, 0);

      // 3) 카테고리별 지출 통계 (이번 달 기준)
      const expenseThisMonth = thisMonthTransactions.filter(tx => tx.type === 'OUT');
      const categoryMap = {};
      expenseThisMonth.forEach(tx => {
        categoryMap[tx.category] = (categoryMap[tx.category] || 0) + tx.amount;
      });
      const categoryStats = Object.keys(categoryMap)
        .map(cat => ({ category: cat, value: categoryMap[cat] }))
        .sort((a, b) => b.value - a.value);

      // 4) 최근 6개월간 월별 입출금 추이
      const getRecentMonths = () => {
        const months = [];
        const d = new Date();
        for (let i = 0; i < 6; i++) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          months.push(`${year}-${month}`);
          d.setMonth(d.getMonth() - 1);
        }
        return months.reverse(); // 연대순 정렬
      };
      
      const recent6Months = getRecentMonths();
      const monthlyTrend = recent6Months.map(month => {
        const monthTxs = txList.filter(tx => tx.date && tx.date.startsWith(month));
        const income = monthTxs.filter(tx => tx.type === 'IN').reduce((acc, tx) => acc + tx.amount, 0);
        const expense = monthTxs.filter(tx => tx.type === 'OUT').reduce((acc, tx) => acc + tx.amount, 0);
        return { month, income, expense };
      });

      setData({
        totalBalance,
        monthlyIncome,
        monthlyExpense,
        recentTransactions: recentTransactions || [],
        categoryStats,
        monthlyTrend
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [refreshTrigger]);

  const formatKRW = (value) => {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(value);
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', gap: '10px' }}>
        <RefreshCw size={24} className="spin" style={{ animation: 'spin 1.5s linear infinite' }} />
        <span>데이터를 불러오는 중입니다...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', color: '#FCA5A5' }}>
        <h3>에러가 발생했습니다.</h3>
        <p>{error}</p>
        <button onClick={fetchDashboardData} className="btn-secondary" style={{ marginTop: '10px' }}>다시 시도</button>
      </div>
    );
  }

  const { totalBalance, monthlyIncome, monthlyExpense, recentTransactions, categoryStats, monthlyTrend } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>대시보드</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>빌라 관리비 계좌 현황을 실시간으로 확인합니다.</p>
        </div>
        <button onClick={() => { fetchDashboardData(); onDataChange(); }} className="btn-secondary">
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>

      {/* Quick Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {/* Balance Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'radial-gradient(circle, var(--color-primary-glow) 0%, transparent 70%)' }}></div>
          <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '16px', borderRadius: '12px', color: 'var(--color-primary)' }}>
            <Wallet size={28} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>통장 잔액</span>
            <h3 style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '4px', letterSpacing: '-0.5px' }}>{formatKRW(totalBalance)}</h3>
          </div>
        </div>

        {/* Income Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'radial-gradient(circle, var(--color-success-glow) 0%, transparent 70%)' }}></div>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '16px', borderRadius: '12px', color: 'var(--color-success)' }}>
            <TrendingUp size={28} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>이번 달 총 입금</span>
            <h3 style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '4px', color: '#34D399', letterSpacing: '-0.5px' }}>{formatKRW(monthlyIncome)}</h3>
          </div>
        </div>

        {/* Expense Card */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: 'radial-gradient(circle, var(--color-danger-glow) 0%, transparent 70%)' }}></div>
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '16px', borderRadius: '12px', color: 'var(--color-danger)' }}>
            <TrendingDown size={28} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>이번 달 총 출금</span>
            <h3 style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '4px', color: '#FCA5A5', letterSpacing: '-0.5px' }}>{formatKRW(monthlyExpense)}</h3>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', minHeight: '380px' }}>
        {/* Monthly Trend Area Chart */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '20px' }}>월별 입출금 추이 (최근 6달)</h4>
          <div style={{ width: '100%', height: '300px', flex: 1 }}>
            {monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34D399" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#34D399" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="expenseGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} tickFormatter={(v) => v >= 10000 ? `${v / 10000}만` : v} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1F2937', borderColor: 'var(--border-color)', borderRadius: '8px', color: '#fff' }}
                    formatter={(value) => [formatKRW(value), '']}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Area name="입금" type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#incomeGlow)" />
                  <Area name="출금" type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#expenseGlow)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                추이 데이터가 충분하지 않습니다.
              </div>
            )}
          </div>
        </div>

        {/* Category Stats Pie Chart */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h4 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '20px' }}>이번 달 지출 분류</h4>
          <div style={{ width: '100%', height: '300px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {categoryStats.length > 0 ? (
              <>
                <div style={{ height: '180px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryStats}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="category"
                      >
                        {categoryStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1F2937', borderColor: 'var(--border-color)', borderRadius: '8px', color: '#fff' }}
                        formatter={(value) => [formatKRW(value), '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', overflowY: 'auto', maxHeight: '100px', paddingRight: '4px' }}>
                  {categoryStats.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: COLORS[idx % COLORS.length] }}></span>
                        <span style={{ color: 'var(--text-muted)' }}>{item.category}</span>
                      </div>
                      <span style={{ fontWeight: 500 }}>{formatKRW(item.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
                이번 달 지출(출금) 내역이<br />존재하지 않습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions List */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h4 style={{ fontSize: '1.05rem', fontWeight: 600 }}>최근 입출금 거래 내역</h4>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {recentTransactions.length > 0 ? (
            <table className="premium-table">
              <thead>
                <tr>
                  <th>일자</th>
                  <th>구분</th>
                  <th>카테고리</th>
                  <th>적요/비고</th>
                  <th style={{ textAlign: 'center', width: '80px' }}>영수증</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ color: 'var(--text-muted)' }}>{tx.date}</td>
                    <td>
                      <span className={`badge ${tx.type === 'IN' ? 'badge-in' : 'badge-out'}`}>
                        {tx.type === 'IN' ? '입금' : '출금'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{tx.category}</td>
                    <td style={{ color: tx.description ? 'var(--text-main)' : 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {tx.description || '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {tx.receipt_image ? (
                        <button 
                          onClick={() => setViewingReceiptUrl(tx.receipt_image)}
                          className="btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '6px', color: '#818CF8', gap: '4px' }}
                          title="영수증 보기"
                        >
                          <ImageIcon size={14} />
                          보기
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>없음</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: tx.type === 'IN' ? '#34D399' : '#FCA5A5' }}>
                      {tx.type === 'IN' ? '+' : '-'}{formatKRW(tx.amount).replace('₩', '')}원
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '40px 0', textPosition: 'center', textAlign: 'center', color: 'var(--text-muted)' }}>
              등록된 거래 내역이 없습니다.
            </div>
          )}
        </div>
      </div>
      {/* 영수증 이미지 크게 보기 모달 */}
      {viewingReceiptUrl && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100
        }}>
          <div className="glass-panel" style={{
            padding: '24px',
            backgroundColor: '#111827',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            maxWidth: '90%',
            maxHeight: '90%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '1.05rem' }}>영수증 사진 확대 보기</span>
              <button onClick={() => setViewingReceiptUrl(null)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <div style={{ overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
              <img 
                src={viewingReceiptUrl} 
                alt="Receipt Detail" 
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px', objectFit: 'contain', border: '1px solid rgba(255,255,255,0.05)' }} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
