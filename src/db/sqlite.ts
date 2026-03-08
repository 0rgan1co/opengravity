import Database from "better-sqlite3";
import { config } from "../config.js";
import fs from "fs";
import path from "path";

// Ensure the directory for the database exists
const dbDir = path.dirname(config.db.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize the database
export const db = new Database(config.db.path);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

  CREATE TABLE IF NOT EXISTS core_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fact TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_core_memory_user_id ON core_memory(user_id);

  CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    summary TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_summaries_user_id ON summaries(user_id);
`); //Tier 1 Memory Schema

export interface MessageRow {
  id: number;
  user_id: number;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp: string;
}

export interface CoreMemoryRow {
  id: number;
  user_id: number;
  fact: string;
  updated_at: string;
}

export interface SummaryRow {
  id: number;
  user_id: number;
  summary: string;
  created_at: string;
}

export const dbService = {
  // --- Messages ---
  addMessage(userId: number, role: "system" | "user" | "assistant" | "tool", content: string) {
    const stmt = db.prepare(`
      INSERT INTO messages (user_id, role, content)
      VALUES (?, ?, ?)
    `);
    stmt.run(userId, role, content);
  },

  getHistory(userId: number, limit: number = 20): MessageRow[] {
    const stmt = db.prepare(`
      SELECT * FROM (
        SELECT * FROM messages
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      ) ORDER BY timestamp ASC
    `);
    return stmt.all(userId, limit) as MessageRow[];
  },

  getMessageCount(userId: number): number {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE user_id = ?`);
    const result = stmt.get(userId) as { count: number };
    return result.count;
  },

  deleteOldestMessages(userId: number, keepLatestCount: number) {
    // Delete all except the latest keepLatestCount
    const stmt = db.prepare(`
      DELETE FROM messages 
      WHERE user_id = ? 
      AND id NOT IN (
        SELECT id FROM messages 
        WHERE user_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      )
    `);
    stmt.run(userId, userId, keepLatestCount);
  },

  clearHistory(userId: number) {
    const stmt = db.prepare(`DELETE FROM messages WHERE user_id = ?`);
    stmt.run(userId);
  },

  // --- Core Memory (Facts) ---
  addFact(userId: number, fact: string) {
    const stmt = db.prepare(`
      INSERT INTO core_memory (user_id, fact)
      VALUES (?, ?)
    `);
    stmt.run(userId, fact);
  },

  getFacts(userId: number): CoreMemoryRow[] {
    const stmt = db.prepare(`SELECT * FROM core_memory WHERE user_id = ?`);
    return stmt.all(userId) as CoreMemoryRow[];
  },

  // --- Summaries ---
  addSummary(userId: number, summary: string) {
    const stmt = db.prepare(`
      INSERT INTO summaries (user_id, summary)
      VALUES (?, ?)
    `);
    stmt.run(userId, summary);
  },

  getLatestSummary(userId: number): SummaryRow | undefined {
    const stmt = db.prepare(`
      SELECT * FROM summaries 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    return stmt.get(userId) as SummaryRow | undefined;
  }
};
