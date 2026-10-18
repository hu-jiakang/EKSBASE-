import { db } from "../database/database.js";

/*
 * EKSBASE Employee Access
 *
 * Uses the existing EKSBASE SQLite connection:
 *   backend/data/kingdee.db
 *
 * No better-sqlite3 dependency is required.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS employee_access (
    employee_no TEXT PRIMARY KEY COLLATE NOCASE,

    access_level TEXT NOT NULL DEFAULT 'NONE',
    department TEXT NOT NULL DEFAULT 'NONE',
    role TEXT NOT NULL DEFAULT 'STAFF',

    district TEXT DEFAULT '',
    region TEXT DEFAULT '',
    sub_region TEXT DEFAULT '',

    warehouse_code TEXT DEFAULT '',
    sales_no TEXT DEFAULT '',

    is_active INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    provider TEXT NOT NULL,
    provider_subject TEXT NOT NULL,
    employee_no TEXT NOT NULL COLLATE NOCASE,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(provider, provider_subject),
    UNIQUE(provider, employee_no),

    FOREIGN KEY (employee_no)
      REFERENCES employee_access(employee_no)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_employee_access_warehouse
    ON employee_access(warehouse_code);

  CREATE INDEX IF NOT EXISTS idx_employee_access_sales
    ON employee_access(sales_no);

  CREATE INDEX IF NOT EXISTS idx_employee_access_scope
    ON employee_access(
      district,
      region,
      sub_region
    );

  CREATE INDEX IF NOT EXISTS idx_user_identities_employee
    ON user_identities(employee_no);
`);

/*
 * Migration for existing EKSBASE databases.
 * Department is the authoritative non-Promoter access field.
 * access_level is retained as a compatibility alias for existing code.
 */
const employeeAccessColumns = db
  .prepare("PRAGMA table_info(employee_access)")
  .all();

if (
  !employeeAccessColumns.some(
    (column) => column.name === "department"
  )
) {
  db.exec(`
    ALTER TABLE employee_access
    ADD COLUMN department TEXT NOT NULL DEFAULT 'NONE'
  `);
}

/*
 * Backfill department from the previous access_level field.
 * This preserves existing authorization records during migration.
 */
db.exec(`
  UPDATE employee_access
  SET department = access_level
  WHERE (
    department IS NULL
    OR TRIM(department) = ''
    OR UPPER(TRIM(department)) = 'NONE'
  )
  AND access_level IS NOT NULL
  AND TRIM(access_level) <> ''
`);

export function upsertEmployeeAccess({
  employeeNo,
  department = "",
  accessLevel = "NONE",
  role = "STAFF",
  district = "",
  region = "",
  subRegion = "",
  warehouseCode = "",
  salesNo = "",
  isActive = true,
}) {
  if (!employeeNo) {
    throw new Error("employeeNo is required.");
  }

  const normalizedDepartment =
    String(
      department || "NONE"
    )
      .trim()
      .toUpperCase();

  let normalizedAccessLevel =
    String(
      accessLevel || "NONE"
    )
      .trim()
      .toUpperCase();

  if (normalizedAccessLevel === "SUB-REGION" || normalizedAccessLevel === "SUB REGION") {
    normalizedAccessLevel = "SUB_REGION";
  }

  db.prepare(`
    INSERT INTO employee_access (
      employee_no,
      access_level,
      department,
      role,
      district,
      region,
      sub_region,
      warehouse_code,
      sales_no,
      is_active,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)

    ON CONFLICT(employee_no) DO UPDATE SET
      access_level = excluded.access_level,
      department = excluded.department,
      role = excluded.role,
      district = excluded.district,
      region = excluded.region,
      sub_region = excluded.sub_region,
      warehouse_code = excluded.warehouse_code,
      sales_no = excluded.sales_no,
      is_active = excluded.is_active,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    String(employeeNo).trim(),
    normalizedAccessLevel,
    normalizedDepartment,
    String(role).trim().toUpperCase(),
    district || "",
    region || "",
    subRegion || "",
    warehouseCode || "",
    salesNo || "",
    isActive === false ? 0 : 1
  );
}



/*
 * Resolve dashboard access from the actual dashboard hierarchy data.
 *
 * IMPORTANT:
 * - Kingdee Employee Department is treated as the value to match.
 * - We do NOT interpret department names such as "NCR" or "NMNL"
 *   as access levels.
 * - The match is always against the current local dashboard data.
 * - Deepest hierarchy wins: Sub-Region -> Region -> District.
 * - If no hierarchy value matches, access is NONE rather than reusing
 *   a stale previous scope.
 */
export function resolveDashboardAccessFromDepartment(department) {
  const normalizedDepartment = String(department ?? "").trim();

  if (!normalizedDepartment) {
    return {
      accessLevel: "NONE",
      district: "",
      region: "",
      subRegion: "",
    };
  }

  const rows = db.prepare(`
    SELECT
      MAX(CASE
        WHEN UPPER(TRIM(sub_region)) = UPPER(TRIM(?))
        THEN sub_region
      END) AS subRegion,
      MAX(CASE
        WHEN UPPER(TRIM(region)) = UPPER(TRIM(?))
        THEN region
      END) AS region,
      MAX(CASE
        WHEN UPPER(TRIM(district)) = UPPER(TRIM(?))
        THEN district
      END) AS district
    FROM serial_main_file
    WHERE
      TRIM(COALESCE(sub_region, '')) <> ''
      OR TRIM(COALESCE(region, '')) <> ''
      OR TRIM(COALESCE(district, '')) <> ''
  `).get(
    normalizedDepartment,
    normalizedDepartment,
    normalizedDepartment
  );

  if (rows?.subRegion) {
    return {
      accessLevel: "SUB_REGION",
      district: "",
      region: "",
      subRegion: String(rows.subRegion).trim(),
    };
  }

  if (rows?.region) {
    return {
      accessLevel: "REGION",
      district: "",
      region: String(rows.region).trim(),
      subRegion: "",
    };
  }

  if (rows?.district) {
    return {
      accessLevel: "DISTRICT",
      district: String(rows.district).trim(),
      region: "",
      subRegion: "",
    };
  }

  return {
    accessLevel: "NONE",
    district: "",
    region: "",
    subRegion: "",
  };
}

export function getEmployeeAccess(employeeNo) {
  if (!employeeNo) return null;

  return db.prepare(`
    SELECT
      employee_no AS employeeNo,
      department,
      access_level AS accessLevel,
      role,
      district,
      region,
      sub_region AS subRegion,
      warehouse_code AS warehouseCode,
      sales_no AS salesNo,
      is_active AS isActive
    FROM employee_access
    WHERE employee_no = ?
  `).get(String(employeeNo).trim());
}

export function upsertIdentity({
  provider,
  providerSubject,
  employeeNo,
}) {
  if (!provider || !providerSubject || !employeeNo) {
    throw new Error(
      "provider, providerSubject and employeeNo are required."
    );
  }

  const normalizedProvider =
    String(provider).trim().toLowerCase();

  const normalizedSubject =
    String(providerSubject).trim();

  const normalizedEmployeeNo =
    String(employeeNo).trim();

  /*
   * Identity can only point to an existing EKSBASE
   * Employee Access record.
   */
  const employee =
    getEmployeeAccess(normalizedEmployeeNo);

  if (!employee) {
    throw new Error(
      `Employee ${normalizedEmployeeNo} is not registered in employee_access.`
    );
  }

  db.prepare(`
    INSERT INTO user_identities (
      provider,
      provider_subject,
      employee_no,
      updated_at
    )
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)

    ON CONFLICT(provider, provider_subject) DO UPDATE SET
      employee_no = excluded.employee_no,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    normalizedProvider,
    normalizedSubject,
    normalizedEmployeeNo
  );
}

export function getEmployeeByIdentity({
  provider,
  providerSubject,
}) {
  if (!provider || !providerSubject) {
    return null;
  }

  return db.prepare(`
    SELECT
      a.employee_no AS employeeNo,
      a.department,
      a.access_level AS accessLevel,
      a.role,

      a.district,
      a.region,
      a.sub_region AS subRegion,

      a.warehouse_code AS warehouseCode,
      a.sales_no AS salesNo,

      a.is_active AS isActive,

      i.provider,
      i.provider_subject AS providerSubject

    FROM user_identities i

    INNER JOIN employee_access a
      ON a.employee_no = i.employee_no

    WHERE i.provider = ?
      AND i.provider_subject = ?
  `).get(
    String(provider).trim().toLowerCase(),
    String(providerSubject).trim()
  );
}
