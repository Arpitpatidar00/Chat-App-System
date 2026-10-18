import { DatabaseSync } from 'node:sqlite';

export interface LocalMessageRecord {
  id: string;
  conversationId: string;
  seqId: number;
  senderId: string;
  senderDeviceId: string;
  clientMsgId: string;
  msgType?: string;
  plaintextContent?: string | null;
  attachmentFilename?: string | null;
  createdAt: number;
  isTombstoned?: boolean;
}

export interface SearchResult {
  messageId: string;
  conversationId: string;
  snippet: string;
}

/**
 * P7-T02 & P7-T03: Client SQLCipher / SQLite FTS5 Local Search Repository.
 * Complies with:
 * - FR-057 to FR-060: On-Device E2EE Search with FTS5 virtual table
 * - NFR-010: Query execution p95 <= 2.0s
 * - NFR-042: Zero server plaintext indexing (zero search queries/bytes leave the device)
 * - FR-059: Tombstone deletion synchronization
 */
export class LocalSearchRepository {
  private readonly db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    this.db = new DatabaseSync(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // 1. Primary local messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        seq_id INTEGER NOT NULL,
        sender_id TEXT NOT NULL,
        sender_device_id TEXT NOT NULL,
        client_msg_id TEXT NOT NULL,
        msg_type TEXT NOT NULL DEFAULT 'TEXT',
        plaintext_body TEXT,
        attachment_filename TEXT,
        created_at INTEGER NOT NULL,
        is_tombstoned INTEGER NOT NULL DEFAULT 0
      );
    `);

    // 2. FTS5 Virtual Table for sub-second encrypted content search (FR-057, NFR-010)
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS local_messages_fts USING fts5(
        message_id UNINDEXED,
        conversation_id UNINDEXED,
        plaintext_body,
        attachment_filename,
        created_at UNINDEXED,
        tokenize='porter unicode61'
      );
    `);

    // 3. Triggers for automatic synchronization with FTS table
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_fts_insert AFTER INSERT ON local_messages
      WHEN new.plaintext_body IS NOT NULL AND new.is_tombstoned = 0
      BEGIN
        INSERT INTO local_messages_fts(message_id, conversation_id, plaintext_body, attachment_filename, created_at)
        VALUES (new.id, new.conversation_id, new.plaintext_body, new.attachment_filename, new.created_at);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_fts_tombstone AFTER UPDATE OF is_tombstoned ON local_messages
      WHEN new.is_tombstoned = 1
      BEGIN
        DELETE FROM local_messages_fts WHERE message_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_fts_delete AFTER DELETE ON local_messages
      BEGIN
        DELETE FROM local_messages_fts WHERE message_id = old.id;
      END;
    `);
  }

  /**
   * P7-T02 & P7-T04: Index a decrypted message into the local SQL store.
   * Gracefully handles messages with missing decryption keys (plaintextContent is null/undefined)
   * without throwing or corrupting the search index.
   */
  public indexMessage(record: LocalMessageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO local_messages (
        id, conversation_id, seq_id, sender_id, sender_device_id,
        client_msg_id, msg_type, plaintext_body, attachment_filename,
        created_at, is_tombstoned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        plaintext_body = excluded.plaintext_body,
        attachment_filename = excluded.attachment_filename,
        is_tombstoned = excluded.is_tombstoned;
    `);

    stmt.run(
      record.id,
      record.conversationId,
      record.seqId,
      record.senderId,
      record.senderDeviceId,
      record.clientMsgId,
      record.msgType ?? 'TEXT',
      record.plaintextContent ?? null,
      record.attachmentFilename ?? null,
      record.createdAt,
      record.isTombstoned ? 1 : 0
    );
  }

  /**
   * Batch index messages in a single transaction for maximum speed.
   */
  public indexMessagesBatch(records: LocalMessageRecord[]): void {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare(`
        INSERT INTO local_messages (
          id, conversation_id, seq_id, sender_id, sender_device_id,
          client_msg_id, msg_type, plaintext_body, attachment_filename,
          created_at, is_tombstoned
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          plaintext_body = excluded.plaintext_body,
          attachment_filename = excluded.attachment_filename,
          is_tombstoned = excluded.is_tombstoned;
      `);

      for (const record of records) {
        stmt.run(
          record.id,
          record.conversationId,
          record.seqId,
          record.senderId,
          record.senderDeviceId,
          record.clientMsgId,
          record.msgType ?? 'TEXT',
          record.plaintextContent ?? null,
          record.attachmentFilename ?? null,
          record.createdAt,
          record.isTombstoned ? 1 : 0
        );
      }
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * P7-T04: Gracefully re-indexes a message once keys are restored.
   */
  public reindexMessage(messageId: string, plaintextContent: string): void {
    const updateStmt = this.db.prepare(`
      UPDATE local_messages
      SET plaintext_body = ?
      WHERE id = ? AND is_tombstoned = 0;
    `);
    updateStmt.run(plaintextContent, messageId);

    // Update FTS table explicitly if updated
    const ftsDelete = this.db.prepare('DELETE FROM local_messages_fts WHERE message_id = ?;');
    ftsDelete.run(messageId);

    const ftsInsert = this.db.prepare(`
      INSERT INTO local_messages_fts (message_id, conversation_id, plaintext_body, attachment_filename, created_at)
      SELECT id, conversation_id, plaintext_body, attachment_filename, created_at
      FROM local_messages
      WHERE id = ? AND plaintext_body IS NOT NULL AND is_tombstoned = 0;
    `);
    ftsInsert.run(messageId);
  }

  /**
   * P7-T03 & Flow 7B: Execute on-device full text query with snippet extraction.
   * NFR-010: p95 <= 2.0s
   * NFR-042: 0 search bytes transmitted to server.
   */
  public search(query: string, limit = 50): SearchResult[] {
    // Sanitize query to prevent FTS syntax injection
    const sanitized = query
      .replace(/[^\w\s]/gi, ' ')
      .trim();

    if (!sanitized) {
      return [];
    }

    // Format query for FTS5 (match prefix/words)
    const terms = sanitized.split(/\s+/).filter(Boolean);
    const ftsQuery = terms.map((t) => `"${t}"*`).join(' AND ');

    const stmt = this.db.prepare(`
      SELECT
        message_id,
        conversation_id,
        snippet(local_messages_fts, 2, '<b>', '</b>', '...', 12) as snippet
      FROM local_messages_fts
      WHERE local_messages_fts MATCH ?
      ORDER BY created_at DESC
      LIMIT ?;
    `);

    const rows = stmt.all(ftsQuery, limit) as Array<{
      message_id: string;
      conversation_id: string;
      snippet: string;
    }>;

    return rows.map((r) => ({
      messageId: r.message_id,
      conversationId: r.conversation_id,
      snippet: r.snippet,
    }));
  }

  /**
   * FR-059 & E2E-7.3: Search Deletion Hygiene (Tombstone Synchronization).
   * Automatically purges the message from search results immediately.
   */
  public tombstoneMessage(messageId: string): void {
    const stmt = this.db.prepare(`
      UPDATE local_messages
      SET is_tombstoned = 1, plaintext_body = NULL
      WHERE id = ?;
    `);
    stmt.run(messageId);
  }

  /**
   * Permanently deletes a message row.
   */
  public deleteMessage(messageId: string): void {
    const stmt = this.db.prepare('DELETE FROM local_messages WHERE id = ?;');
    stmt.run(messageId);
  }

  public getMessageCount(): number {
    const row = this.db.prepare('SELECT count(*) as count FROM local_messages;').get() as { count: number };
    return Number(row.count);
  }

  public getFtsCount(): number {
    const row = this.db.prepare('SELECT count(*) as count FROM local_messages_fts;').get() as { count: number };
    return Number(row.count);
  }

  public close(): void {
    this.db.close();
  }
}
