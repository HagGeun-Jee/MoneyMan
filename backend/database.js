import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'maintenance.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // 1. 세대 정보 테이블 (generations)
    db.run(`
      CREATE TABLE IF NOT EXISTS generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_name TEXT UNIQUE NOT NULL,
        resident_name TEXT NOT NULL,
        contact TEXT
      )
    `);

    // 2. 입출금 내역 테이블 (transactions)
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('IN', 'OUT')),
        category TEXT NOT NULL,
        amount INTEGER NOT NULL,
        date TEXT NOT NULL,
        description TEXT,
        receipt_image TEXT
      )
    `);

    // 기존 데이터베이스 마이그레이션: 컬럼 누락 시 동적 추가
    db.run("ALTER TABLE transactions ADD COLUMN receipt_image TEXT", (err) => {
      if (err) {
        if (!err.message.includes('duplicate column name')) {
          console.log("Migration note:", err.message);
        }
      } else {
        console.log("Database migrated: receipt_image column added to transactions table.");
      }
    });

    // 3. 월별 세대 관리비 부과 및 수납 관리 테이블 (maintenance_bills)
    db.run(`
      CREATE TABLE IF NOT EXISTS maintenance_bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id INTEGER NOT NULL,
        billing_month TEXT NOT NULL,
        amount INTEGER NOT NULL,
        is_paid INTEGER DEFAULT 0 CHECK(is_paid IN (0, 1)),
        payment_date TEXT,
        transaction_id INTEGER,
        FOREIGN KEY(unit_id) REFERENCES generations(id) ON DELETE CASCADE,
        FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
        UNIQUE(unit_id, billing_month)
      )
    `);

    // 기본 데이터 추가 (테이블이 비어있을 경우에만 샘플 데이터를 입력합니다)
    db.get("SELECT COUNT(*) as count FROM generations", [], (err, row) => {
      if (row && row.count === 0) {
        const insertStmt = db.prepare("INSERT INTO generations (unit_name, resident_name, contact) VALUES (?, ?, ?)");
        insertStmt.run("101호", "김철수", "010-1234-5678");
        insertStmt.run("102호", "이영희", "010-2345-6789");
        insertStmt.run("201호", "박민수", "010-3456-7890");
        insertStmt.run("202호", "최지우", "010-4567-8901");
        insertStmt.run("301호", "정우성", "010-5678-9012");
        insertStmt.run("302호", "한효주", "010-6789-0123");
        insertStmt.finalize();
        console.log("Sample generations inserted.");
      }
    });
  });
}

// Promise 기반으로 DB 쿼리 실행을 쉽게 도와주는 헬퍼 함수
export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export default db;
