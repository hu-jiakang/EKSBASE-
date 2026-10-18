import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const databaseDirectory =
  path.resolve(
    __dirname,
    "../../data"
  );

fs.mkdirSync(
  databaseDirectory,
  {
    recursive: true,
  }
);

const databasePath =
  path.join(
    databaseDirectory,
    "kingdee.db"
  );

export const db =
  new DatabaseSync(databasePath);


// ========================================
// Serial Main File
// ========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS serial_main_file (
    serial_number TEXT NOT NULL,

    material_code TEXT,
    material_name TEXT,
    material_group TEXT,

    model TEXT,
    color TEXT,
    category TEXT,
    brand TEXT,
    sales_amount REAL,

    organization_code TEXT NOT NULL,
    organization_name TEXT,

    stock_status_code TEXT,
    stock_status TEXT,

    supplier TEXT,
    production_dept TEXT,

    warehouse_code TEXT,
    warehouse TEXT,
    mall_name TEXT,
    store_type TEXT,

    district TEXT,
    region TEXT,
    sub_region TEXT,

    customer_code TEXT,
    customer TEXT,
    customer_short_name TEXT,
    customer_region TEXT,
    customer_district TEXT,
    customer_group TEXT,

    sales_time TEXT,
    resign_time TEXT,

    sales_no TEXT,
    sales TEXT,

    role TEXT,
    hired_date TEXT,
    sales_lwd TEXT,
    sales_workday INTEGER,

    type_of_seller TEXT,
    month_of_incentive TEXT,
    incentive_status TEXT,

    PRIMARY KEY (
      serial_number,
      organization_code
    )
  );
`);

const serialColumns = db
  .prepare(
    "PRAGMA table_info(serial_main_file)"
  )
  .all();

const serialColumnNames =
  new Set(
    serialColumns.map(
      (column) => column.name
    )
  );
if (
  !serialColumnNames.has(
    "stock_status_code"
  )
) {
  db.exec(`
    ALTER TABLE serial_main_file
    ADD COLUMN stock_status_code TEXT
  `);

  console.log(
    "[DATABASE] Added stock_status_code column"
  );
}
if (
  !serialColumnNames.has(
    "mall_name"
  )
) {
  db.exec(`
    ALTER TABLE serial_main_file
    ADD COLUMN mall_name TEXT
  `);

  console.log(
    "[DATABASE] Added mall_name column"
  );
}

if (
  !serialColumnNames.has(
    "store_type"
  )
) {
  db.exec(`
    ALTER TABLE serial_main_file
    ADD COLUMN store_type TEXT
  `);

  console.log(
    "[DATABASE] Added store_type column"
  );
}
// ========================================
// Serial Sync Log
// ========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS serial_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    sync_type TEXT NOT NULL,

    from_date TEXT,
    to_date TEXT,

    started_at TEXT NOT NULL,
    completed_at TEXT,

    status TEXT NOT NULL,

    pages_processed INTEGER DEFAULT 0,
    total_fetched INTEGER DEFAULT 0,
    total_saved INTEGER DEFAULT 0,
    unique_records INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,

    error_message TEXT
  );
`);


// ========================================
// Indexes
// ========================================

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_serial_sales_time
  ON serial_main_file(
    sales_time
  );

  CREATE INDEX IF NOT EXISTS idx_serial_org_sales_time
  ON serial_main_file(
    organization_code,
    sales_time
  );

  CREATE INDEX IF NOT EXISTS idx_serial_region_sales_time
  ON serial_main_file(
    region,
    sales_time
  );

  CREATE INDEX IF NOT EXISTS idx_serial_customer_code
  ON serial_main_file(
    customer_code
  );

  CREATE INDEX IF NOT EXISTS idx_serial_material_code
  ON serial_main_file(
    material_code
  );

  CREATE INDEX IF NOT EXISTS idx_serial_sync_log_started_at
  ON serial_sync_log(
    started_at DESC
  );
`);


// ========================================
// Startup Logs
// ========================================

console.log(
  `[DATABASE] SQLite connected: ${databasePath}`
);

console.log(
  "[DATABASE] serial_main_file table ready"
);

// ========================================
// Current Live Sell-out Snapshot
// ========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS sellout_live_serial (
    serial_number TEXT NOT NULL,
    organization_code TEXT NOT NULL,

    PRIMARY KEY (
      serial_number,
      organization_code
    )
  );

  CREATE INDEX IF NOT EXISTS idx_sellout_live_serial_number
  ON sellout_live_serial(serial_number);
`);

console.log(
  "[DATABASE] sellout_live_serial table ready"
);

// ========================================
// Current Inventory Snapshot
// ========================================

// Inventory is current-state data. Keep the latest successfully completed
// STK_Inventory extraction as a shared snapshot so multiple dashboard users
// do not independently query Kingdee.
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_snapshot (
    snapshot_id INTEGER PRIMARY KEY CHECK (snapshot_id = 1),
    updated_at TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    rows_json TEXT NOT NULL
  );
`);

console.log(
  "[DATABASE] inventory_snapshot table ready"
);

console.log(
  "[DATABASE] serial_sync_log table ready"
);
