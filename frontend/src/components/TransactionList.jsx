import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Filter, Calendar, X, AlertTriangle, Image as ImageIcon, Edit2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

function TransactionList({ refreshTrigger, onDataChange }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters (초기값: 당월 1일 ~ 당월 말일)
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    type: 'OUT',
    category: '청소비',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    description: ''
  });
  const [formError, setFormError] = useState('');
  const [receiptFile, setReceiptFile] = useState(null); // 영수증 파일 상태 추가
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState(null); // 영수증 보기 모달 상태 추가
  const [editingTransaction, setEditingTransaction] = useState(null); // 수정 중인 거래 내역
  const [deleteExistingReceipt, setDeleteExistingReceipt] = useState(false); // 기존 영수증 삭제 여부 추가

  const categories = {
    IN: ['관리비 입금', '이자 수익', '기타 입금'],
    OUT: ['청소비', '공동 전기료', '수선유지비', '소방안전대행료', '수도료', '승강기유지비', '기타 출금']
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      let query = supabase.from('transactions').select('*');

      if (typeFilter !== 'ALL') {
        query = query.eq('type', typeFilter);
      }
      if (startDate) {
        query = query.gte('date', startDate);
      }
      if (endDate) {
        query = query.lte('date', endDate);
      }
      if (searchQuery) {
        query = query.or(`category.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('id', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [typeFilter, startDate, endDate, refreshTrigger]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchTransactions();
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // 구분이 변경되면 카테고리 목록의 첫 번째 값으로 자동 업데이트
      if (name === 'type') {
        updated.category = categories[value][0];
      }
      return updated;
    });
  };

  const startEditTransaction = (tx) => {
    setEditingTransaction(tx);
    setFormData({
      type: tx.type,
      category: tx.category,
      amount: tx.amount.toString(),
      date: tx.date,
      description: tx.description || ''
    });
    setReceiptFile(null);
    setDeleteExistingReceipt(false);
    setShowAddForm(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const { type, category, amount, date, description } = formData;
    if (!amount || isNaN(amount) || parseInt(amount) <= 0) {
      setFormError('올바른 금액을 입력해 주세요.');
      return;
    }
    if (!date) {
      setFormError('날짜를 입력해 주세요.');
      return;
    }

    try {
      let receiptImageUrl = editingTransaction ? editingTransaction.receipt_image : null;
      
      if (deleteExistingReceipt) {
        receiptImageUrl = null;
      }
      
      if (type === 'OUT' && receiptFile) {
        const fileExt = receiptFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, receiptFile);
          
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('receipts')
          .getPublicUrl(fileName);
          
        receiptImageUrl = publicUrl;
      }

      if (editingTransaction) {
        const { error: updateError } = await supabase
          .from('transactions')
          .update({
            type,
            category,
            amount: parseInt(amount),
            date,
            description,
            receipt_image: receiptImageUrl
          })
          .eq('id', editingTransaction.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('transactions')
          .insert([{
            type,
            category,
            amount: parseInt(amount),
            date,
            description,
            receipt_image: receiptImageUrl
          }]);

        if (insertError) throw insertError;
      }

      // 폼 초기화 및 닫기
      setFormData({
        type: 'OUT',
        category: '청소비',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        description: ''
      });
      setReceiptFile(null); // 파일 초기화
      setDeleteExistingReceipt(false);
      setEditingTransaction(null);
      setShowAddForm(false);
      onDataChange(); // 부모 상태 리프레시 유도
      fetchTransactions();
    } catch (err) {
      if (err.message && err.message.includes('row-level security policy')) {
        setFormError('영수증 업로드 권한이 없습니다. Supabase Storage의 receipts 버킷 RLS 정책(insert)을 설정해 주세요.');
      } else {
        setFormError(err.message);
      }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('이 내역을 정말 삭제하시겠습니까?\n관리비 수납과 연계된 경우 해당 수납 내역도 미납 상태로 변경됩니다.')) return;
    try {
      // 1) 연계된 관리비 청구서가 있다면 상태 초기화
      const { error: updateBillError } = await supabase
        .from('maintenance_bills')
        .update({ is_paid: 0, payment_date: null, transaction_id: null })
        .eq('transaction_id', id);

      if (updateBillError) throw updateBillError;

      // 2) 트랜잭션 삭제
      const { error: deleteTxError } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (deleteTxError) throw deleteTxError;

      onDataChange();
      fetchTransactions();
    } catch (err) {
      alert(err.message);
    }
  };

  const formatKRW = (value) => {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(value);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>입출금 내역</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>통장의 모든 입금과 출금 세부 내역을 기록하고 조회합니다.</p>
        </div>
        <button onClick={() => { setEditingTransaction(null); setFormData({ type: 'OUT', category: '청소비', amount: '', date: new Date().toISOString().slice(0, 10), description: '' }); setReceiptFile(null); setShowAddForm(true); }} className="btn-primary">
          <Plus size={18} /> 거래 등록
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>거래 구분</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: '100%' }}>
              <option value="ALL">전체 내역</option>
              <option value="IN">입금 (+)</option>
              <option value="OUT">출금 (-)</option>
            </select>
          </div>
          
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>시작일</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>종료일</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%' }} />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>검색어 (적요 등)</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                placeholder="검색어 입력..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', paddingRight: '40px' }} 
              />
              <button type="submit" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                <Search size={16} />
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Transaction List Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>로딩 중...</div>
        ) : transactions.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>일자</th>
                  <th>구분</th>
                  <th>카테고리</th>
                  <th>적요/비고</th>
                  <th style={{ textAlign: 'center', width: '80px' }}>영수증</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                  <th style={{ textAlign: 'center', width: '80px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
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
                    <td style={{ textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button 
                        onClick={() => startEditTransaction(tx)}
                        className="btn-secondary" 
                        style={{ padding: '6px', borderRadius: '6px', color: '#818CF8' }}
                        title="거래 수정"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button 
                        onClick={() => handleDelete(tx.id)}
                        className="btn-danger" 
                        style={{ padding: '6px', borderRadius: '6px' }}
                        title="거래 삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            조회 조건에 맞는 거래 내역이 없습니다.
          </div>
        )}
      </div>

      {/* Add Transaction Modal */}
      {showAddForm && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel" style={{
            width: '450px',
            padding: '30px',
            backgroundColor: '#111827',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{editingTransaction ? '입출금 내역 수정' : '입출금 내역 등록'}</h3>
              <button onClick={() => { setShowAddForm(false); setEditingTransaction(null); setDeleteExistingReceipt(false); setReceiptFile(null); }} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>

            {formError && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#FCA5A5', fontSize: '0.85rem' }}>
                <AlertTriangle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>거래 구분</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="button"
                    onClick={() => handleInputChange({ target: { name: 'type', value: 'IN' }})}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px',
                      border: '1px solid',
                      borderColor: formData.type === 'IN' ? '#10B981' : 'var(--border-color)',
                      backgroundColor: formData.type === 'IN' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: formData.type === 'IN' ? '#34D399' : 'var(--text-muted)',
                      fontWeight: 600
                    }}
                  >
                    입금 (+)
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleInputChange({ target: { name: 'type', value: 'OUT' }})}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '8px',
                      border: '1px solid',
                      borderColor: formData.type === 'OUT' ? '#EF4444' : 'var(--border-color)',
                      backgroundColor: formData.type === 'OUT' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                      color: formData.type === 'OUT' ? '#FCA5A5' : 'var(--text-muted)',
                      fontWeight: 600
                    }}
                  >
                    출금 (-)
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>카테고리</label>
                <select 
                  name="category" 
                  value={formData.category} 
                  onChange={handleInputChange}
                  style={{ width: '100%' }}
                >
                  {categories[formData.type].map((cat, idx) => (
                    <option key={idx} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>금액 (원)</label>
                <input 
                  type="number" 
                  name="amount" 
                  placeholder="금액 입력..."
                  value={formData.amount} 
                  onChange={handleInputChange} 
                  style={{ width: '100%' }} 
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>일자</label>
                <input 
                  type="date" 
                  name="date" 
                  value={formData.date} 
                  onChange={handleInputChange} 
                  style={{ width: '100%' }} 
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>적요 / 비고 (선택)</label>
                <textarea 
                  name="description" 
                  placeholder="예: 2026년 6월 공동전기세 납부"
                  value={formData.description} 
                  onChange={handleInputChange} 
                  rows={3}
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>

              {/* 영수증 이미지 첨부 (출금일 때만 렌더링) */}
              {formData.type === 'OUT' && (
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>영수증 사진 첨부 (촬영/갤러리)</label>
                  {editingTransaction && editingTransaction.receipt_image && !deleteExistingReceipt && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#818CF8', marginBottom: '8px', padding: '6px 10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '6px' }}>
                      <span>✓ 기존 영수증 사진 있음</span>
                      <button 
                        type="button" 
                        onClick={() => setDeleteExistingReceipt(true)}
                        style={{ color: '#FCA5A5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.75rem', textDecoration: 'underline' }}
                      >
                        삭제하기
                      </button>
                    </div>
                  )}
                  {deleteExistingReceipt && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#FCA5A5', marginBottom: '8px', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>
                      <span>✗ 기존 영수증 삭제 예정</span>
                      <button 
                        type="button" 
                        onClick={() => setDeleteExistingReceipt(false)}
                        style={{ color: '#818CF8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.75rem', textDecoration: 'underline' }}
                      >
                        되돌리기
                      </button>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    onChange={(e) => {
                      setReceiptFile(e.target.files[0] || null);
                      if (e.target.files[0]) {
                        setDeleteExistingReceipt(false);
                      }
                    }}
                    style={{ width: '100%', background: 'rgba(17, 24, 39, 0.8)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', color: 'var(--text-main)' }} 
                  />
                  {receiptFile && (
                    <span style={{ fontSize: '0.75rem', color: '#34D399', marginTop: '4px', display: 'block' }}>
                      ✓ {receiptFile.name} 선택됨
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => { setShowAddForm(false); setReceiptFile(null); setDeleteExistingReceipt(false); setEditingTransaction(null); }} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>취소</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>{editingTransaction ? '수정' : '등록'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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

export default TransactionList;
