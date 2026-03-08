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
`);

export interface MessageRow {
    id: number;
    user_id: number;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    timestamp: string;
}

export const dbService = {
    addMessage(userId: number, role: "system" | "user" | "assistant" | "tool", content: string) {
        const stmt = db.prepare(`
      INSERT INTO messages (user_id, role, content)
      VALUES (?, ?, ?)
    `);
        stmt.run(userId, role, content);
    },

    getHistory(userId: number, limit: number = 20): MessageRow[] {
        const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE user_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `);
        return stmt.all(userId, limit) as MessageRow[];
    },

    clearHistory(userId: number) {
        const stmt = db.prepare(`
      DELETE FROM messages
      WHERE user_id = ?
    `);
        stmt.run(userId);
    },
};
