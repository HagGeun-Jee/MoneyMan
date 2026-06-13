import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { query, get, run } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 업로드 저장용 디렉토리 자동 생성
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer 스토리지 구성 (한글 파일명 깨짐 방지 및 고유 파일명 부여)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // 원래 확장자 추출
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ----------------------------------------------------
// 1. 대시보드 API (Dashboard)
// ----------------------------------------------------
app.get('/api/dashboard', async (req, res) => {
  try {
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7); // YYYY-MM

    // 1) 전체 잔액 계산
    const balanceResult = await get(`
      SELECT 
        SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END) - 
        SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END) as balance
      FROM transactions
    `);
    const totalBalance = balanceResult.balance || 0;

    // 2) 이번 달 총 입금/출금
    const monthStats = await get(`
      SELECT 
        SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END) as expense
      FROM transactions
      WHERE date LIKE ?
    `, [`${currentMonth}%`]);
    const monthlyIncome = monthStats.income || 0;
    const monthlyExpense = monthStats.expense || 0;

    // 3) 최근 거래 내역 (최대 10개)
    const recentTransactions = await query(`
      SELECT * FROM transactions
      ORDER BY date DESC, id DESC
      LIMIT 10
    `);

    // 4) 카테고리별 지출 통계 (이번 달 기준)
    const categoryStats = await query(`
      SELECT category, SUM(amount) as value
      FROM transactions
      WHERE type = 'OUT' AND date LIKE ?
      GROUP BY category
      ORDER BY value DESC
    `, [`${currentMonth}%`]);

    // 5) 최근 6개월간 월별 입출금 추이
    // SQLite에서 substr(date, 1, 7)로 월을 그룹화
    const monthlyTrend = await query(`
      SELECT 
        substr(date, 1, 7) as month,
        SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END) as expense
      FROM transactions
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `);

    // 최신 순으로 정렬되어 있으므로 연대순으로 reverse
    monthlyTrend.reverse();

    res.json({
      totalBalance,
      monthlyIncome,
      monthlyExpense,
      recentTransactions,
      categoryStats,
      monthlyTrend
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '대시보드 데이터를 가져오는데 실패했습니다.' });
  }
});

// ----------------------------------------------------
// 2. 세대 관리 API (Generations)
// ----------------------------------------------------
app.get('/api/generations', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM generations ORDER BY unit_name ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: '세대 정보를 조회할 수 없습니다.' });
  }
});

app.post('/api/generations', async (req, res) => {
  const { unit_name, resident_name, contact } = req.body;
  if (!unit_name || !resident_name) {
    return res.status(400).json({ error: '호수와 세대주 이름은 필수입니다.' });
  }
  try {
    const result = await run(
      'INSERT INTO generations (unit_name, resident_name, contact) VALUES (?, ?, ?)',
      [unit_name, resident_name, contact]
    );
    res.json({ id: result.id, unit_name, resident_name, contact });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: '이미 존재하는 호수입니다.' });
    } else {
      res.status(500).json({ error: '세대 등록에 실패했습니다.' });
    }
  }
});

app.put('/api/generations/:id', async (req, res) => {
  const { id } = req.params;
  const { unit_name, resident_name, contact } = req.body;
  try {
    await run(
      'UPDATE generations SET unit_name = ?, resident_name = ?, contact = ? WHERE id = ?',
      [unit_name, resident_name, contact, id]
    );
    res.json({ message: '세대 정보가 성공적으로 수정되었습니다.' });
  } catch (error) {
    res.status(500).json({ error: '세대 정보 수정에 실패했습니다.' });
  }
});

app.delete('/api/generations/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[DELETE /api/generations/${id}] 요청 수신`);
  try {
    const result = await run('DELETE FROM generations WHERE id = ?', [id]);
    console.log(`[DELETE /api/generations/${id}] 삭제 성공, 변경된 행 수:`, result.changes);
    res.json({ message: '세대가 삭제되었습니다.' });
  } catch (error) {
    console.error(`[DELETE /api/generations/${id}] 에러 발생:`, error.message);
    res.status(500).json({ error: '세대 삭제에 실패했습니다.' });
  }
});

// ----------------------------------------------------
// 3. 입출금 내역 API (Transactions)
// ----------------------------------------------------
app.get('/api/transactions', async (req, res) => {
  const { type, startDate, endDate, search } = req.query;
  let sql = 'SELECT * FROM transactions WHERE 1=1';
  const params = [];

  if (type && type !== 'ALL') {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (startDate) {
    sql += ' AND date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND date <= ?';
    params.push(endDate);
  }
  if (search) {
    sql += ' AND (category LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY date DESC, id DESC';

  try {
    const rows = await query(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: '입출금 내역을 조회할 수 없습니다.' });
  }
});

app.post('/api/transactions', upload.single('receipt'), async (req, res) => {
  const { type, category, amount, date, description } = req.body;
  if (!type || !category || !amount || !date) {
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
  }

  // 업로드된 파일이 있다면 가상 경로 저장
  const receiptImage = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = await run(
      'INSERT INTO transactions (type, category, amount, date, description, receipt_image) VALUES (?, ?, ?, ?, ?, ?)',
      [type, category, parseInt(amount), date, description, receiptImage]
    );
    res.json({ 
      id: result.id, 
      type, 
      category, 
      amount: parseInt(amount), 
      date, 
      description,
      receipt_image: receiptImage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '입출금 내역 등록에 실패했습니다.' });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // 1) 삭제 전에 트랜잭션 정보(영수증 이미지 유무) 획득
    const tx = await get('SELECT receipt_image FROM transactions WHERE id = ?', [id]);

    // 만약 이 transaction이 maintenance_bills에 매핑되어 있다면 빌스 상태도 미납으로 변경 처리
    await run(`
      UPDATE maintenance_bills 
      SET is_paid = 0, payment_date = NULL, transaction_id = NULL 
      WHERE transaction_id = ?
    `, [id]);

    await run('DELETE FROM transactions WHERE id = ?', [id]);

    // 2) 실제 영수증 이미지 파일이 있다면 디스크에서도 제거
    if (tx && tx.receipt_image) {
      const fileName = tx.receipt_image.replace('/uploads/', '');
      const filePath = path.join(uploadDir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Receipt file deleted from disk: ${filePath}`);
      }
    }

    res.json({ message: '입출금 내역이 삭제되었습니다.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '입출금 내역 삭제에 실패했습니다.' });
  }
});

// ----------------------------------------------------
// 4. 관리비 부과 및 납부 관리 API (Maintenance Bills)
// ----------------------------------------------------
// 특정 월의 청구 내역 목록 조회
app.get('/api/maintenance-bills', async (req, res) => {
  const { month } = req.query; // YYYY-MM
  if (!month) {
    return res.status(400).json({ error: '조회할 월(YYYY-MM)을 입력해주세요.' });
  }
  try {
    // 세대 정보와 조인하여 청구 내역이 있는지 확인
    const rows = await query(`
      SELECT 
        b.id,
        g.id as unit_id,
        g.unit_name,
        g.resident_name,
        b.billing_month,
        b.amount,
        COALESCE(b.is_paid, 0) as is_paid,
        b.payment_date,
        b.transaction_id
      FROM generations g
      LEFT JOIN maintenance_bills b ON g.id = b.unit_id AND b.billing_month = ?
      ORDER BY g.unit_name ASC
    `, [month]);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '관리비 부과 현황을 조회할 수 없습니다.' });
  }
});

// 특정 월의 모든 세대에 대해 관리비 일괄 부과
app.post('/api/maintenance-bills/generate', async (req, res) => {
  const { month, amount } = req.body;
  if (!month || !amount) {
    return res.status(400).json({ error: '부과 대상 월과 금액을 입력해주세요.' });
  }
  try {
    const generations = await query('SELECT id FROM generations');
    if (generations.length === 0) {
      return res.status(400).json({ error: '등록된 세대가 없습니다. 세대를 먼저 등록해주세요.' });
    }

    let insertCount = 0;
    for (const gen of generations) {
      try {
        // 이미 생성된 데이터가 있는지 확인하고 없으면 인서트
        await run(`
          INSERT INTO maintenance_bills (unit_id, billing_month, amount, is_paid)
          VALUES (?, ?, ?, 0)
        `, [gen.id, month, amount]);
        insertCount++;
      } catch (err) {
        // UNIQUE constraint failed인 경우는 이미 등록된 것이므로 스킵
        if (!err.message.includes('UNIQUE constraint failed')) {
          throw err;
        }
      }
    }
    res.json({ message: `${insertCount}개 세대에 관리비가 부과되었습니다. (이미 부과된 세대 제외)` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '관리비 일괄 부과에 실패했습니다.' });
  }
});

// 관리비 고지서 단건 생성/수정 (개별 부과용)
app.post('/api/maintenance-bills', async (req, res) => {
  const { unit_id, billing_month, amount } = req.body;
  if (!unit_id || !billing_month || !amount) {
    return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
  }
  try {
    const result = await run(`
      INSERT INTO maintenance_bills (unit_id, billing_month, amount, is_paid)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(unit_id, billing_month) DO UPDATE SET amount = excluded.amount
    `, [unit_id, billing_month, amount]);
    res.json({ message: '관리비가 부과되었습니다.', id: result.id });
  } catch (error) {
    res.status(500).json({ error: '관리비 부과에 실패했습니다.' });
  }
});

// 납부 상태 토글
app.put('/api/maintenance-bills/:id/toggle-pay', async (req, res) => {
  const { id } = req.params;
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // 1) 기존 청구 상태 조회
    const bill = await get(`
      SELECT b.*, g.unit_name, g.resident_name 
      FROM maintenance_bills b
      JOIN generations g ON b.unit_id = g.id
      WHERE b.id = ?
    `, [id]);

    if (!bill) {
      return res.status(404).json({ error: '해당 관리비 청구 내역을 찾을 수 없습니다.' });
    }

    const nextIsPaid = bill.is_paid === 1 ? 0 : 1;

    if (nextIsPaid === 1) {
      // 완납 처리할 경우 -> 거래 내역 자동 생성 후 매핑
      const category = '관리비 입금';
      const description = `${bill.unit_name} (${bill.resident_name}) ${bill.billing_month} 관리비 납부`;
      
      const txResult = await run(`
        INSERT INTO transactions (type, category, amount, date, description)
        VALUES ('IN', ?, ?, ?, ?)
      `, [category, bill.amount, todayStr, description]);

      await run(`
        UPDATE maintenance_bills 
        SET is_paid = 1, payment_date = ?, transaction_id = ?
        WHERE id = ?
      `, [todayStr, txResult.id, id]);

      res.json({ 
        message: '완납 처리되었으며 입출금 내역에 자동 등록되었습니다.',
        is_paid: 1, 
        payment_date: todayStr,
        transaction_id: txResult.id
      });
    } else {
      // 미납 처리할 경우 -> 기존 연관 거래 내역이 있으면 삭제
      if (bill.transaction_id) {
        await run('DELETE FROM transactions WHERE id = ?', [bill.transaction_id]);
      }

      await run(`
        UPDATE maintenance_bills 
        SET is_paid = 0, payment_date = NULL, transaction_id = NULL
        WHERE id = ?
      `, [id]);

      res.json({ 
        message: '미납 상태로 변경되었으며 관련 입금 거래 내역이 삭제되었습니다.',
        is_paid: 0, 
        payment_date: null,
        transaction_id: null
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '납부 상태 변경에 실패했습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
