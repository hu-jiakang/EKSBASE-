import { db } from "./database.js";

const insertSyncLogStatement = db.prepare(`
  INSERT INTO serial_sync_log (
    sync_type,
    from_date,
    to_date,
    started_at,
    completed_at,
    status,
    pages_processed,
    total_fetched,
    total_saved,
    unique_records,
    duplicate_count,
    error_message
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateSyncLogStatement = db.prepare(`
  UPDATE serial_sync_log
  SET
    completed_at = ?,
    status = ?,
    pages_processed = ?,
    total_fetched = ?,
    total_saved = ?,
    unique_records = ?,
    duplicate_count = ?,
    error_message = ?
  WHERE id = ?
`);

const getLatestSyncLogStatement = db.prepare(`
  SELECT
    id,
    sync_type AS syncType,
    from_date AS fromDate,
    to_date AS toDate,
    started_at AS startedAt,
    completed_at AS completedAt,
    status,
    pages_processed AS pagesProcessed,
    total_fetched AS totalFetched,
    total_saved AS totalSaved,
    unique_records AS uniqueRecords,
    duplicate_count AS duplicateCount,
    error_message AS errorMessage
  FROM serial_sync_log
  ORDER BY id DESC
  LIMIT 1
`);
const getSyncLogsStatement = db.prepare(`
  SELECT
    id,
    sync_type AS syncType,
    from_date AS fromDate,
    to_date AS toDate,
    started_at AS startedAt,
    completed_at AS completedAt,
    status,
    pages_processed AS pagesProcessed,
    total_fetched AS totalFetched,
    total_saved AS totalSaved,
    unique_records AS uniqueRecords,
    duplicate_count AS duplicateCount,
    error_message AS errorMessage
  FROM serial_sync_log
  ORDER BY id DESC
  LIMIT ?
`);
export function createSyncLog({
  syncType,
  fromDate = "",
  toDate = "",
} = {}) {
  const startedAt =
    new Date().toISOString();

  const result =
    insertSyncLogStatement.run(
      syncType,
      fromDate,
      toDate,
      startedAt,
      null,
      "running",
      0,
      0,
      0,
      0,
      0,
      null
    );

  return Number(
    result.lastInsertRowid
  );
}

export function completeSyncLog(
  id,
  {
    pagesProcessed = 0,
    totalFetched = 0,
    totalSaved = 0,
    uniqueRecords = 0,
    duplicateCount = 0,
  } = {}
) {
  const completedAt =
    new Date().toISOString();

  updateSyncLogStatement.run(
    completedAt,
    "success",
    pagesProcessed,
    totalFetched,
    totalSaved,
    uniqueRecords,
    duplicateCount,
    null,
    id
  );
}

export function failSyncLog(
  id,
  error
) {
  const completedAt =
    new Date().toISOString();

  updateSyncLogStatement.run(
    completedAt,
    "failed",
    0,
    0,
    0,
    0,
    0,
    error?.message ||
      String(error),
    id
  );
}

export function getLatestSyncLog() {
  return getLatestSyncLogStatement.get();
}
export function getSyncLogs({
  limit = 20,
} = {}) {
  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(limit, 10) || 20,
      1
    ),
    100
  );

  return getSyncLogsStatement.all(
    parsedLimit
  );
}
