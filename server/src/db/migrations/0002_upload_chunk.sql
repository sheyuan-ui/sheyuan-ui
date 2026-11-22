-- 分块回执：记录已接收的分块，用于去重、断点续传与进度重算。
-- 分块文件本体落在 uploadDir/<file_id>.part，不入库。

CREATE TABLE upload_chunk (
  file_id     TEXT NOT NULL REFERENCES upload (file_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  size_bytes  INTEGER NOT NULL CHECK (size_bytes >= 0),
  received_at TEXT NOT NULL,
  PRIMARY KEY (file_id, chunk_index)
);

CREATE INDEX idx_upload_chunk_file ON upload_chunk (file_id);