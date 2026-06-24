import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, CheckCircle2, XCircle, Users, Receipt, Phone, Hash, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';

function GenerationList({ refreshTrigger, onDataChange }) {
  const [activeSubTab, setActiveSubTab] = useState('bills'); // 'bills' or 'generations'
  
  // 1. 세대 관련 상태
  const [generations, setGenerations] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [editingGen, setEditingGen] = useState(null);
  const [genForm, setGenForm] = useState({ unit_name: '', resident_name: '', contact: '', car_model: '', car_number: '' });
  const [genError, setGenError] = useState('');
  const [genToDelete, setGenToDelete] = useState(null); // 삭제 확인용 커스텀 모달 상태 추가

  // 2. 수납 관련 상태
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateAmount, setGenerateAmount] = useState(() => {
    return localStorage.getItem('default_billing_amount') || '30000';
  });
  const [billError, setBillError] = useState('');

  // 3. 완납 일자 지정 상태
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBillForPay, setSelectedBillForPay] = useState(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  // 4. 관리비 부과 대상 호수 선택 상태
  const [selectedGenIdsForBill, setSelectedGenIdsForBill] = useState([]);

  // 5. 공지 템플릿 및 히스토리 관련 상태
  const [templateText, setTemplateText] = useState('');
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [editTemplateInput, setEditTemplateInput] = useState('');
  const [historyList, setHistoryList] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  // ----------------------------------------------------
  // 공지 템플릿 및 히스토리 로직
  // ----------------------------------------------------
  const fetchTemplate = async () => {
    setTemplateLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // 기본 템플릿 저장
        const defaultText = `[MoneyMan 관리비 공지]\n\n입주민 여러분 안녕하십니까.\n{청구월}분 관리비가 부과되었습니다.\n\n바쁘시더라도 납부 기한인 매월 25일까지 입금을 부탁드립니다.\n\n날씨가 많이 더워지는데 건강 유의하시기 바랍니다. 감사합니다.`;
        const { data: inserted, error: insertError } = await supabase
          .from('message_templates')
          .insert([{ id: 1, template_text: defaultText }])
          .select()
          .single();

        if (insertError) throw insertError;
        setTemplateText(inserted.template_text);
        setEditTemplateInput(inserted.template_text);
      } else {
        setTemplateText(data.template_text);
        setEditTemplateInput(data.template_text);
      }
    } catch (err) {
      console.error('Error fetching template:', err);
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    if (!editTemplateInput.trim()) {
      alert('템플릿 내용을 입력해주세요.');
      return;
    }
    try {
      const { error: updateError } = await supabase
        .from('message_templates')
        .update({ template_text: editTemplateInput, updated_at: new Date().toISOString() })
        .eq('id', 1);

      if (updateError) throw updateError;

      const { error: historyError } = await supabase
        .from('message_history')
        .insert([{
          action_type: 'EDIT',
          content: editTemplateInput
        }]);

      if (historyError) throw historyError;

      setTemplateText(editTemplateInput);
      setIsEditingTemplate(false);
      alert('템플릿이 성공적으로 저장되었습니다.');
      fetchHistory();
    } catch (err) {
      console.error('Error saving template:', err);
      alert(`템플릿 저장 실패: ${err.message}`);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setHistoryList(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCopyAnnouncement = async () => {
    if (!templateText) {
      alert('공지문자 템플릿을 불러오는 중이거나 템플릿이 비어있습니다.');
      return;
    }

    try {
      const [year, month] = selectedMonth.split('-');
      const formattedMonth = `${year}년 ${month}월`;

      const finalContent = templateText.replace(/{청구월}/g, formattedMonth);

      await navigator.clipboard.writeText(finalContent);
      alert('공지문자가 클립보드에 복사되었습니다! 단톡방에 붙여넣기(Ctrl+V) 하세요.');

      const { error: historyError } = await supabase
        .from('message_history')
        .insert([{
          action_type: 'COPY',
          content: finalContent
        }]);

      if (historyError) throw historyError;

      fetchHistory();
    } catch (err) {
      console.error('Error copying/logging announcement:', err);
      alert(`복사에 실패했거나 히스토리 저장 중 오류가 발생했습니다: ${err.message}`);
    }
  };

  // ----------------------------------------------------
  // 세대 관리 로직
  // ----------------------------------------------------
  const fetchGenerations = async () => {
    setGenLoading(true);
    try {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .order('unit_name', { ascending: true });

      if (error) throw error;
      setGenerations(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setGenLoading(false);
    }
  };

  const handleGenSubmit = async (e) => {
    e.preventDefault();
    setGenError('');
    if (!genForm.unit_name || !genForm.resident_name) {
      setGenError('호수와 세대주명은 필수 입력입니다.');
      return;
    }

    try {
      if (editingGen) {
        const { error } = await supabase
          .from('generations')
          .update({
            unit_name: genForm.unit_name,
            resident_name: genForm.resident_name,
            contact: genForm.contact,
            car_model: genForm.car_model,
            car_number: genForm.car_number
          })
          .eq('id', editingGen.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('generations')
          .insert([{
            unit_name: genForm.unit_name,
            resident_name: genForm.resident_name,
            contact: genForm.contact,
            car_model: genForm.car_model,
            car_number: genForm.car_number
          }]);

        if (error) {
          if (error.message && error.message.includes('unique')) {
            throw new Error('이미 존재하는 호수입니다.');
          }
          throw error;
        }
      }

      setShowGenModal(false);
      setGenForm({ unit_name: '', resident_name: '', contact: '', car_model: '', car_number: '' });
      setEditingGen(null);
      fetchGenerations();
      // 수납 현황도 갱신
      fetchBills();
    } catch (err) {
      setGenError(err.message);
    }
  };

  const startEditGen = (gen) => {
    setEditingGen(gen);
    setGenForm({
      unit_name: gen.unit_name,
      resident_name: gen.resident_name,
      contact: gen.contact || '',
      car_model: gen.car_model || '',
      car_number: gen.car_number || ''
    });
    setShowGenModal(true);
  };

  const handleDeleteGen = async (id) => {
    try {
      const { error } = await supabase
        .from('generations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setGenToDelete(null); // 삭제 성공 시 모달 닫기
      fetchGenerations();
      fetchBills();
      onDataChange(); // 잔액 갱신용
    } catch (err) {
      console.error("[Frontend] Delete generation error:", err);
      alert(`세대 삭제 오류: ${err.message}`);
    }
  };

  // ----------------------------------------------------
  // 수납 관리 로직
  // ----------------------------------------------------
  const fetchBills = async () => {
    setBillsLoading(true);
    try {
      const { data, error } = await supabase
        .from('generations')
        .select(`
          id,
          unit_name,
          resident_name,
          maintenance_bills (
            id,
            billing_month,
            amount,
            is_paid,
            payment_date,
            transaction_id
          )
        `)
        .eq('maintenance_bills.billing_month', selectedMonth)
        .order('unit_name', { ascending: true });

      if (error) throw error;

      // Flat 형태로 변환 (기존 SQLite LEFT JOIN UI 호환)
      const formattedBills = (data || []).map(gen => {
        const bill = gen.maintenance_bills && gen.maintenance_bills[0];
        return {
          id: bill ? bill.id : null,
          unit_id: gen.id,
          unit_name: gen.unit_name,
          resident_name: gen.resident_name,
          billing_month: bill ? bill.billing_month : selectedMonth,
          amount: bill ? bill.amount : null,
          is_paid: bill ? bill.is_paid : 0,
          payment_date: bill ? bill.payment_date : null,
          transaction_id: bill ? bill.transaction_id : null
        };
      });

      setBills(formattedBills);
    } catch (err) {
      console.error(err);
    } finally {
      setBillsLoading(false);
    }
  };

  const openGenerateModal = () => {
    setSelectedGenIdsForBill(generations.map(g => g.id));
    setGenerateAmount(localStorage.getItem('default_billing_amount') || '30000');
    setBillError('');
    setShowGenerateModal(true);
  };

  const handleGenerateBills = async (e) => {
    e.preventDefault();
    setBillError('');
    if (!generateAmount || isNaN(generateAmount) || parseInt(generateAmount) <= 0) {
      setBillError('올바른 부과 금액을 입력해 주세요.');
      return;
    }
    if (selectedGenIdsForBill.length === 0) {
      setBillError('부과 대상 세대를 최소 1곳 이상 선택해 주세요.');
      return;
    }

    try {
      const billsToInsert = selectedGenIdsForBill.map(genId => ({
        unit_id: genId,
        billing_month: selectedMonth,
        amount: parseInt(generateAmount),
        is_paid: 0
      }));

      const { error: upsertError } = await supabase
        .from('maintenance_bills')
        .upsert(billsToInsert, { onConflict: 'unit_id,billing_month', ignoreDuplicates: true });

      if (upsertError) throw upsertError;

      // 성공적으로 부과 시 입력한 금액을 로컬 스토리지에 기억
      localStorage.setItem('default_billing_amount', generateAmount);

      setShowGenerateModal(false);
      fetchBills();
    } catch (err) {
      setBillError(err.message);
    }
  };

  const handleTogglePay = async (bill) => {
    if (!bill.id) return;
    
    if (bill.is_paid === 1) {
      // 이미 완납 상태 -> 미납 변경 처리 (모달 없이 즉시 실행)
      if (!window.confirm(`${bill.unit_name} 세대의 납부 상태를 미납으로 변경하시겠습니까?\n관련 입금 거래 내역도 자동으로 삭제됩니다.`)) return;
      try {
        if (bill.transaction_id) {
          const { error: deleteTxError } = await supabase
            .from('transactions')
            .delete()
            .eq('id', bill.transaction_id);

          if (deleteTxError) throw deleteTxError;
        }

        const { error: updateBillError } = await supabase
          .from('maintenance_bills')
          .update({
            is_paid: 0,
            payment_date: null,
            transaction_id: null
          })
          .eq('id', bill.id);

        if (updateBillError) throw updateBillError;

        fetchBills();
        onDataChange();
      } catch (err) {
        alert(err.message);
      }
    } else {
      // 미납 상태 -> 완납 처리 모달 오픈
      setSelectedBillForPay(bill);
      setPayDate(new Date().toISOString().slice(0, 10)); // 오늘 날짜 기본값
      setShowPayModal(true);
    }
  };

  const executePay = async () => {
    if (!selectedBillForPay) return;
    try {
      const bill = selectedBillForPay;
      const category = '관리비 입금';
      const description = `${bill.unit_name} (${bill.resident_name}) ${bill.billing_month} 관리비 납부`;
      
      const { data: newTx, error: txError } = await supabase
        .from('transactions')
        .insert([{
          type: 'IN',
          category,
          amount: bill.amount,
          date: payDate,
          description
        }])
        .select()
        .single();

      if (txError) throw txError;

      const { error: updateBillError } = await supabase
        .from('maintenance_bills')
        .update({
          is_paid: 1,
          payment_date: payDate,
          transaction_id: newTx.id
        })
        .eq('id', bill.id);

      if (updateBillError) throw updateBillError;

      setShowPayModal(false);
      setSelectedBillForPay(null);
      fetchBills();
      onDataChange();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddBill = async (unitId, unitName, residentName) => {
    const defaultAmount = localStorage.getItem('default_billing_amount') || '30000';
    const amountStr = window.prompt(
      `[개별 부과] ${unitName} (${residentName}) 세대의 ${selectedMonth} 관리비 부과 금액을 입력하세요.`,
      defaultAmount
    );
    if (amountStr === null) return; // 취소 클릭
    if (!amountStr || isNaN(amountStr) || parseInt(amountStr) <= 0) {
      alert('올바른 부과 금액을 입력해 주세요.');
      return;
    }

    try {
      const amount = parseInt(amountStr);
      const { error } = await supabase
        .from('maintenance_bills')
        .insert([{
          unit_id: unitId,
          billing_month: selectedMonth,
          amount: amount,
          is_paid: 0
        }]);

      if (error) {
        if (error.message && error.message.includes('unique')) {
          throw new Error('이미 해당 월의 관리비가 부과된 세대입니다.');
        }
        throw error;
      }

      fetchBills();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCancelBill = async (bill) => {
    const confirmMsg = bill.is_paid === 1
      ? `${bill.unit_name} 세대는 완납 상태입니다.\n부과를 취소하면 수납 입금 거래 내역도 함께 삭제됩니다.\n그래도 청구(부과)를 취소하시겠습니까?`
      : `${bill.unit_name} 세대의 ${selectedMonth} 관리비 청구(부과)를 취소하시겠습니까?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      // 1) 완납 상태이고 입출금 거래 내역 연계 시 먼저 삭제
      if (bill.is_paid === 1 && bill.transaction_id) {
        const { error: deleteTxError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', bill.transaction_id);

        if (deleteTxError) throw deleteTxError;
      }

      // 2) 고지서 삭제
      const { error: deleteBillError } = await supabase
        .from('maintenance_bills')
        .delete()
        .eq('id', bill.id);

      if (deleteBillError) throw deleteBillError;

      fetchBills();
      onDataChange();
    } catch (err) {
      alert(err.message);
    }
  };

  useEffect(() => {
    fetchGenerations();
    fetchTemplate();
    fetchHistory();
  }, []);

  useEffect(() => {
    fetchBills();
  }, [selectedMonth, refreshTrigger]);

  const formatKRW = (value) => {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(value);
  };

  // 현재 청구서가 발행된 호수가 몇 개인지, 완납된 세대는 몇 개인지 계산
  const billedCount = bills.filter(b => b.id !== null).length;
  const paidCount = bills.filter(b => b.id !== null && b.is_paid === 1).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
      {/* Header and Sub Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700 }}>세대 & 수납 관리</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>세대 정보를 관리하고 월별 관리비 부과 및 납부 여부를 관리합니다.</p>
        </div>
        
        {/* Sub Navigation Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button 
            onClick={() => setActiveSubTab('bills')}
            style={{
              padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500,
              backgroundColor: activeSubTab === 'bills' ? 'var(--color-primary)' : 'transparent',
              color: activeSubTab === 'bills' ? 'white' : 'var(--text-muted)',
              transition: 'var(--transition-smooth)'
            }}
          >
            <Receipt size={14} style={{ marginRight: '6px', display: 'inline', verticalAlign: 'middle' }} />
            관리비 수납 현황
          </button>
          <button 
            onClick={() => setActiveSubTab('generations')}
            style={{
              padding: '8px 16px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500,
              backgroundColor: activeSubTab === 'generations' ? 'var(--color-primary)' : 'transparent',
              color: activeSubTab === 'generations' ? 'white' : 'var(--text-muted)',
              transition: 'var(--transition-smooth)'
            }}
          >
            <Users size={14} style={{ marginRight: '6px', display: 'inline', verticalAlign: 'middle' }} />
            세대 정보 관리
          </button>
        </div>
      </div>

      {/* Main Sub Panel */}
      {activeSubTab === 'bills' ? (
        // ----------------------------------------------------
        // 탭 1: 관리비 수납 현황 뷰
        // ----------------------------------------------------
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Month Filter and Generate Bar */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>조회 및 부과 월:</span>
              <input 
                type="month" 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)} 
                style={{ padding: '8px 12px' }}
              />
            </div>
            
            {billedCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  수납 현황: <strong style={{ color: '#fff' }}>{paidCount}</strong> / {billedCount} 세대 완납
                </span>
                <div style={{ width: '120px', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(paidCount / billedCount) * 100}%`, height: '100%', background: 'var(--color-success)', transition: 'var(--transition-smooth)' }}></div>
                </div>
              </div>
            ) : (
              <button onClick={openGenerateModal} className="btn-primary">
                <Plus size={16} /> 이 달의 관리비 일괄 부과
              </button>
            )}
          </div>

          {/* 공지 메시지 관리 패널 */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <span style={{ fontWeight: 600, fontSize: '1rem', color: '#fff' }}>카카오톡 단체방 공지 메시지 관리</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {!isEditingTemplate ? (
                  <>
                    <button 
                      onClick={() => setIsEditingTemplate(true)} 
                      className="btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                      템플릿 수정
                    </button>
                    <button 
                      onClick={handleCopyAnnouncement} 
                      className="btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      공지문자 복사
                    </button>
                    <button 
                      onClick={() => setShowHistoryModal(true)} 
                      className="btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                      이력 보기
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      onClick={() => {
                        setEditTemplateInput(templateText);
                        setIsEditingTemplate(false);
                      }} 
                      className="btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                      취소
                    </button>
                    <button 
                      onClick={handleSaveTemplate} 
                      className="btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                      저장
                    </button>
                  </>
                )}
              </div>
            </div>

            {templateLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>템플릿 로딩 중...</div>
            ) : isEditingTemplate ? (
              <form onSubmit={handleSaveTemplate} style={{ width: '100%' }}>
                <textarea
                  value={editTemplateInput}
                  onChange={(e) => setEditTemplateInput(e.target.value)}
                  style={{
                    width: '100%',
                    height: '120px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.85rem',
                    lineHeight: '1.5',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                  placeholder="공지 템플릿을 입력하세요. {청구월} 변수를 사용할 수 있습니다."
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  * 문구 내에 <strong>{`{청구월}`}</strong>을 입력하면 복사할 때 현재 조회 월(예: {selectedMonth.split('-')[0]}년 {selectedMonth.split('-')[1]}월)로 자동 치환되어 복사됩니다.
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{
                  padding: '12px 15px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  border: '1px dashed var(--border-color)',
                  fontSize: '0.85rem',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-main)'
                }}>
                  {templateText ? (
                    templateText.replace(/{청구월}/g, `${selectedMonth.split('-')[0]}년 ${selectedMonth.split('-')[1]}월`)
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>등록된 공지 템플릿이 없습니다. [템플릿 수정]을 눌러 작성해 주세요.</span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  ※ [공지문자 복사] 버튼을 누르면 위 내용이 클립보드에 복사됩니다. 복사된 내용을 카카오톡 단체방에 붙여넣으세요.
                </div>
              </div>
            )}
          </div>

          {/* Bills Table */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            {billsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>로딩 중...</div>
            ) : bills.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>호수</th>
                      <th>세대주</th>
                      <th>청구월</th>
                      <th style={{ textAlign: 'right' }}>부과 금액</th>
                      <th style={{ textAlign: 'center' }}>수납 상태</th>
                      <th>납부일자</th>
                      <th style={{ textAlign: 'center', width: '210px' }}>납부 처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((bill) => {
                      const isBilled = bill.id !== null;
                      return (
                        <tr key={bill.unit_id}>
                          <td style={{ fontWeight: 600 }}>{bill.unit_name}</td>
                          <td>{bill.resident_name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{selectedMonth}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>
                            {isBilled ? formatKRW(bill.amount) : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>미부과</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isBilled ? (
                              <span className={`badge ${bill.is_paid === 1 ? 'badge-success' : 'badge-danger'}`}>
                                {bill.is_paid === 1 ? '완납' : '미납'}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {isBilled && bill.payment_date ? bill.payment_date : '-'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {isBilled ? (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                                <button 
                                  onClick={() => handleTogglePay(bill)}
                                  className={bill.is_paid === 1 ? 'btn-secondary' : 'btn-primary'}
                                  style={{ padding: '6px 10px', fontSize: '0.8rem', gap: '4px', minWidth: '98px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  {bill.is_paid === 1 ? (
                                    <>
                                      <XCircle size={14} /> 미납 변경
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 size={14} /> 완납 처리
                                    </>
                                  )}
                                </button>
                                <button 
                                  onClick={() => handleCancelBill(bill)}
                                  className="btn-danger"
                                  style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '6px', minWidth: '82px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                  title="청구서 부과 취소"
                                >
                                  부과 취소
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', minHeight: '32px' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minWidth: '98px', textAlign: 'center', display: 'inline-block' }}>부과 필요</span>
                                <button 
                                  onClick={() => handleAddBill(bill.unit_id, bill.unit_name, bill.resident_name)}
                                  className="btn-primary"
                                  style={{ padding: '6px 10px', fontSize: '0.8rem', borderRadius: '6px', minWidth: '82px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  부과
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                등록된 세대가 없습니다. '세대 정보 관리' 탭에서 세대를 먼저 등록해 주세요.
              </div>
            )}
          </div>
        </div>
      ) : (
        // ----------------------------------------------------
        // 탭 2: 세대 정보 관리 뷰
        // ----------------------------------------------------
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => { setEditingGen(null); setGenForm({ unit_name: '', resident_name: '', contact: '', car_model: '', car_number: '' }); setShowGenModal(true); }} className="btn-primary">
              <Plus size={16} /> 신규 세대 등록
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            {genLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>로딩 중...</div>
            ) : generations.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>호수</th>
                      <th>세대주 이름</th>
                      <th>연락처</th>
                      <th>차량 정보</th>
                      <th style={{ textAlign: 'center', width: '150px' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generations.map((gen) => (
                      <tr key={gen.id}>
                        <td style={{ fontWeight: 600 }}>{gen.unit_name}</td>
                        <td>{gen.resident_name}</td>
                        <td style={{ color: gen.contact ? 'var(--text-main)' : 'var(--text-muted)' }}>
                          {gen.contact || '등록된 연락처 없음'}
                        </td>
                        <td style={{ color: (gen.car_model || gen.car_number) ? 'var(--text-main)' : 'var(--text-muted)', fontSize: '0.9rem' }}>
                          {gen.car_model || gen.car_number ? `${gen.car_model}${gen.car_number ? ` (${gen.car_number})` : ''}` : '등록 없음'}
                        </td>
                        <td style={{ textAlign: 'center', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                          <button onClick={() => startEditGen(gen)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '4px' }}>
                            <Edit2 size={13} /> 수정
                          </button>
                          <button onClick={() => setGenToDelete(gen)} className="btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '4px' }}>
                            <Trash2 size={13} /> 삭제
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                등록된 세대가 없습니다. 빌라 호수를 먼저 추가해 주세요.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. 세대 등록/수정 모달 */}
      {showGenModal && (
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
            width: '400px',
            padding: '30px',
            backgroundColor: '#111827',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{editingGen ? '세대 정보 수정' : '신규 세대 등록'}</h3>
              <button onClick={() => setShowGenModal(false)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>

            {genError && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#FCA5A5', fontSize: '0.85rem' }}>
                <AlertTriangle size={16} />
                <span>{genError}</span>
              </div>
            )}

            <form onSubmit={handleGenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>호수 (예: 101호)</label>
                <input 
                  type="text" 
                  name="unit_name" 
                  placeholder="예: 101호"
                  value={genForm.unit_name}
                  onChange={(e) => setGenForm(p => ({ ...p, unit_name: e.target.value }))}
                  disabled={!!editingGen} // 수정 시에는 동호수 수정불가로 방어
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>세대주명</label>
                <input 
                  type="text" 
                  name="resident_name" 
                  placeholder="세대주 이름 입력..."
                  value={genForm.resident_name}
                  onChange={(e) => setGenForm(p => ({ ...p, resident_name: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>연락처 (선택)</label>
                <input 
                  type="text" 
                  name="contact" 
                  placeholder="010-0000-0000"
                  value={genForm.contact}
                  onChange={(e) => setGenForm(p => ({ ...p, contact: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>차종 (선택)</label>
                <input 
                  type="text" 
                  name="car_model" 
                  placeholder="예: 그랜저"
                  value={genForm.car_model}
                  onChange={(e) => setGenForm(p => ({ ...p, car_model: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>차량번호 (선택)</label>
                <input 
                  type="text" 
                  name="car_number" 
                  placeholder="예: 12가 3456"
                  value={genForm.car_number}
                  onChange={(e) => setGenForm(p => ({ ...p, car_number: e.target.value }))}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowGenModal(false)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>취소</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>저장</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. 관리비 일괄 부과 모달 */}
      {showGenerateModal && (
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
            width: '400px',
            padding: '30px',
            backgroundColor: '#111827',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>{selectedMonth} 관리비 일괄 부과</h3>
              <button onClick={() => setShowGenerateModal(false)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>

            {billError && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#FCA5A5', fontSize: '0.85rem' }}>
                <AlertTriangle size={16} />
                <span>{billError}</span>
              </div>
            )}

            <form onSubmit={handleGenerateBills} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>세대별 청구 금액 (원)</label>
                <input 
                  type="number" 
                  value={generateAmount} 
                  onChange={(e) => setGenerateAmount(e.target.value)} 
                  placeholder="예: 70000"
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>부과 대상 호수 선택</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.75rem' }}>
                  <button 
                    type="button" 
                    onClick={() => setSelectedGenIdsForBill(generations.map(g => g.id))}
                    style={{ background: 'transparent', border: 'none', color: '#818CF8', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                  >
                    전체 선택
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setSelectedGenIdsForBill([])}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                  >
                    선택 해제
                  </button>
                </div>
                <div style={{ 
                  maxHeight: '150px', 
                  overflowY: 'auto', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '8px', 
                  padding: '10px',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '10px'
                }}>
                  {generations.map((gen) => {
                    const isChecked = selectedGenIdsForBill.includes(gen.id);
                    return (
                      <label key={gen.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedGenIdsForBill(prev => prev.filter(id => id !== gen.id));
                            } else {
                              setSelectedGenIdsForBill(prev => [...prev, gen.id]);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>{gen.unit_name} ({gen.resident_name})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                * 확인 버튼을 누르면 선택된 세대에 대해 지정된 월의 관리비 청구서가 발행됩니다. 이미 청구된 세대는 덮어쓰지 않습니다.
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowGenerateModal(false)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>취소</button>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>확인</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. 세대 삭제 재확인 커스텀 모달 */}
      {genToDelete && (
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
            width: '400px',
            padding: '30px',
            backgroundColor: '#111827',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#EF4444" />
                세대 삭제 경고
              </h3>
              <button onClick={() => setGenToDelete(null)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>

            <div style={{ fontSize: '0.95rem', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p>
                정말로 <strong style={{ color: '#fff' }}>{genToDelete.unit_name} ({genToDelete.resident_name})</strong> 세대를 삭제하시겠습니까?
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                ※ 세대를 삭제하면 해당 세대에 부과된 월별 관리비 청구서 및 수납 정보가 **함께 영구적으로 삭제**됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={() => setGenToDelete(null)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>취소</button>
              <button 
                type="button" 
                onClick={() => handleDeleteGen(genToDelete.id)} 
                className="btn-danger" 
                style={{ flex: 1, justifyContent: 'center' }}
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. 관리비 완납 처리 (납부일자 선택) 모달 */}
      {showPayModal && selectedBillForPay && (
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
            width: '400px',
            padding: '30px',
            backgroundColor: '#111827',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>관리비 완납 처리</h3>
              <button onClick={() => { setShowPayModal(false); setSelectedBillForPay(null); }} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>

            <div style={{ fontSize: '0.95rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>대상 세대:</span>
                <strong>{selectedBillForPay.unit_name} ({selectedBillForPay.resident_name})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>청구 월:</span>
                <strong>{selectedBillForPay.billing_month}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>납부 금액:</span>
                <strong style={{ color: '#818CF8' }}>{formatKRW(selectedBillForPay.amount)}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>실제 납부 일자</label>
              <input 
                type="date" 
                value={payDate} 
                onChange={(e) => setPayDate(e.target.value)} 
                style={{ width: '100%', padding: '10px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" onClick={() => { setShowPayModal(false); setSelectedBillForPay(null); }} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>취소</button>
              <button type="button" onClick={executePay} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>완납 완료</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. 공지/템플릿 히스토리 모달 */}
      {showHistoryModal && (
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
            width: '600px',
            maxHeight: '80vh',
            padding: '30px',
            backgroundColor: '#111827',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            animation: 'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>공지 관리 및 복사 이력 (최근 50건)</h3>
              <button onClick={() => setShowHistoryModal(false)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', paddingRight: '5px' }}>
              {historyLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>히스토리 로딩 중...</div>
              ) : historyList.length > 0 ? (
                historyList.map((hist) => {
                  const dateStr = new Date(hist.created_at).toLocaleString('ko-KR');
                  const isEdit = hist.action_type === 'EDIT';
                  return (
                    <div 
                      key={hist.id} 
                      style={{
                        padding: '15px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: isEdit ? 'rgba(99, 102, 241, 0.03)' : 'rgba(52, 211, 153, 0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className={`badge`} style={{ backgroundColor: isEdit ? 'rgba(99, 102, 241, 0.2)' : 'rgba(52, 211, 153, 0.2)', color: isEdit ? '#818CF8' : '#34D399', border: `1px solid ${isEdit ? '#6366F1' : '#34D399'}`, padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                          {isEdit ? '템플릿 수정' : '공지문자 복사'}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{dateStr}</span>
                      </div>
                      <div style={{
                        fontSize: '0.85rem',
                        lineHeight: '1.5',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--text-main)',
                        backgroundColor: 'rgba(0,0,0,0.15)',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.03)'
                      }}>
                        {hist.content}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>아직 기록된 이력이 없습니다.</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button type="button" onClick={() => setShowHistoryModal(false)} className="btn-secondary" style={{ minWidth: '100px', justifyContent: 'center' }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GenerationList;
