-- SQLCipher (AES-256) Client Schema with FTS5 Full-Text Search (DEC-03)
PRAGMA cipher_compatibility = 4;
PRAGMA kdf_iter = 256000;
PRAGMA cipher_page_size = 4096;

-- Decrypted local message store
CREATE TABLE IF NOT EXISTS local_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    seq_id INTEGER NOT NULL,
    sender_id TEXT NOT NULL,
    sender_device_id TEXT NOT NULL,
    client_msg_id TEXT NOT NULL,
    msg_type TEXT NOT NULL DEFAULT 'TEXT',
    plaintext_body TEXT,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    is_tombstoned INTEGER NOT NULL DEFAULT 0,
    is_edited INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_seq ON local_messages(conversation_id, seq_id ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_msg ON local_messages(client_msg_id);

-- FTS5 Full-Text Search Virtual Table for fast sub-2s offline searching (DEC-03)
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    message_id UNINDEXED,
    conversation_id UNINDEXED,
    plaintext_content,
    tokenize='unicode61 remove_diacritics 2'
);

-- Triggers to synchronize plaintext content with FTS index automatically
CREATE TRIGGER IF NOT EXISTS trg_messages_fts_insert AFTER INSERT ON local_messages
WHEN new.plaintext_body IS NOT NULL AND new.is_tombstoned = 0
BEGIN
    INSERT INTO messages_fts(message_id, conversation_id, plaintext_content)
    VALUES (new.id, new.conversation_id, new.plaintext_body);
END;

CREATE TRIGGER IF NOT EXISTS trg_messages_fts_delete AFTER UPDATE OF is_tombstoned ON local_messages
WHEN new.is_tombstoned = 1
BEGIN
    DELETE FROM messages_fts WHERE message_id = old.id;
END;
