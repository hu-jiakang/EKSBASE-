import { db } from "./database.js";

/**
 * Normalize text values before saving.
 */
function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

/**
 * Normalize numeric values before saving.
 */
function normalizeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}


function toExclusiveEndDate(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  // User-facing YYYY-MM-DD end dates are inclusive.
  // SQL/Kingdee queries remain "< exclusiveEndDate".
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const [year, month, day] =
    text.split("-").map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return date
    .toISOString()
    .slice(0, 10);
}

/**
 * Validate composite primary key.
 *
 * serial_number + organization_code
 */
function validateSerialRecord(record) {
  if (!record) {
    throw new Error(
      "Serial record is required."
    );
  }

  const serialNumber =
    normalizeText(
      record.serialNumber
    );

  const organizationCode =
    normalizeText(
      record.organizationCode
    );

  if (!serialNumber) {
    throw new Error(
      "Serial record is missing serialNumber."
    );
  }

  if (!organizationCode) {
    throw new Error(
      `Serial record ${serialNumber} is missing organizationCode.`
    );
  }
}

/**
 * Total local record count.
 */
const getSerialCountStatement =
  db.prepare(`
    SELECT
      COUNT(*) AS totalCount
    FROM serial_main_file
  `);

/**
 * Insert / update Serial Main File.
 *
 * Final dataset:
 * 37 fields
 */
const upsertSerialStatement =
  db.prepare(`
    INSERT INTO serial_main_file (
      serial_number,
      material_code,
      material_name,
      material_group,
      model,
      color,
      category,
      brand,
      sales_amount,
      organization_code,
      organization_name,
      stock_status_code,
      stock_status,
      supplier,
      production_dept,
      warehouse_code,
      warehouse,
      mall_name,
      store_type,
      district,
      region,
      sub_region,
      customer_code,
      customer,
      customer_short_name,
      customer_region,
      customer_district,
      customer_group,
      sales_time,
      resign_time,
      sales_no,
      sales,
      role,
      hired_date,
      sales_lwd,
      sales_workday,
      type_of_seller,
      month_of_incentive,
      incentive_status
    )
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(
      serial_number,
      organization_code
    )
    DO UPDATE SET
      material_code =
        excluded.material_code,

      material_name =
        excluded.material_name,

      material_group =
        excluded.material_group,

      model =
        excluded.model,

      color =
        excluded.color,

      category =
        excluded.category,

      brand =
        excluded.brand,

      sales_amount =
        excluded.sales_amount,

      organization_name =
        excluded.organization_name,

      stock_status =
        excluded.stock_status,

      supplier =
        excluded.supplier,

      production_dept =
        excluded.production_dept,

      warehouse_code =
        excluded.warehouse_code,

      warehouse =
       excluded.warehouse,

      mall_name =
       excluded.mall_name,

      store_type =
       excluded.store_type,

      district =
       excluded.district,

      region =
        excluded.region,

      sub_region =
        excluded.sub_region,

      customer_code =
        excluded.customer_code,

      customer =
        excluded.customer,

      customer_short_name =
        excluded.customer_short_name,

      customer_region =
        excluded.customer_region,

      customer_district =
        excluded.customer_district,

      customer_group =
        excluded.customer_group,

      sales_time =
        excluded.sales_time,

      resign_time =
        excluded.resign_time,

      sales_no =
        excluded.sales_no,

      sales =
        excluded.sales,

      role =
        excluded.role,

      hired_date =
        excluded.hired_date,

      sales_lwd =
        excluded.sales_lwd,

      sales_workday =
        excluded.sales_workday,

      type_of_seller =
        excluded.type_of_seller,

      month_of_incentive =
        excluded.month_of_incentive,

      incentive_status =
        excluded.incentive_status,

      stock_status_code =
        excluded.stock_status_code

    WHERE
      material_code IS NOT excluded.material_code OR
      material_name IS NOT excluded.material_name OR
      material_group IS NOT excluded.material_group OR
      model IS NOT excluded.model OR
      color IS NOT excluded.color OR
      category IS NOT excluded.category OR
      brand IS NOT excluded.brand OR
      sales_amount IS NOT excluded.sales_amount OR
      organization_name IS NOT excluded.organization_name OR
      stock_status_code IS NOT excluded.stock_status_code OR
      stock_status IS NOT excluded.stock_status OR
      supplier IS NOT excluded.supplier OR
      production_dept IS NOT excluded.production_dept OR
      warehouse_code IS NOT excluded.warehouse_code OR
      warehouse IS NOT excluded.warehouse OR
      mall_name IS NOT excluded.mall_name OR
      store_type IS NOT excluded.store_type OR
      district IS NOT excluded.district OR
      region IS NOT excluded.region OR
      sub_region IS NOT excluded.sub_region OR
      customer_code IS NOT excluded.customer_code OR
      customer IS NOT excluded.customer OR
      customer_short_name IS NOT excluded.customer_short_name OR
      customer_region IS NOT excluded.customer_region OR
      customer_district IS NOT excluded.customer_district OR
      customer_group IS NOT excluded.customer_group OR
      sales_time IS NOT excluded.sales_time OR
      resign_time IS NOT excluded.resign_time OR
      sales_no IS NOT excluded.sales_no OR
      sales IS NOT excluded.sales OR
      role IS NOT excluded.role OR
      hired_date IS NOT excluded.hired_date OR
      sales_lwd IS NOT excluded.sales_lwd OR
      sales_workday IS NOT excluded.sales_workday OR
      type_of_seller IS NOT excluded.type_of_seller OR
      month_of_incentive IS NOT excluded.month_of_incentive OR
      incentive_status IS NOT excluded.incentive_status
  `);

/**
 * Internal single-record UPSERT.
 */
function runUpsert(record) {
  validateSerialRecord(record);

  const result =
    upsertSerialStatement.run(
    normalizeText(
      record.serialNumber
    ),

    normalizeText(
      record.materialCode
    ),

    normalizeText(
      record.materialName
    ),

    normalizeText(
      record.materialGroup
    ),

    normalizeText(
      record.model
    ),

    normalizeText(
      record.color
    ),

    normalizeText(
      record.category
    ),

    normalizeText(
      record.brand
    ),

    normalizeNumber(
      record.salesAmount
    ),

    normalizeText(
      record.organizationCode
    ),

    normalizeText(
      record.organizationName
    ),

    normalizeText(
     record.stockStatusCode
    ),
    normalizeText(
      record.stockStatus
    ),

    normalizeText(
      record.supplier
    ),

    normalizeText(
      record.productionDept
    ),

    normalizeText(
      record.warehouseCode
    ),

    normalizeText(
     record.warehouse
    ),

    normalizeText(
     record.mallName
    ),

    normalizeText(
    record.storeType
    ),

    normalizeText(
    record.district
    ),

    normalizeText(
      record.region
    ),

    normalizeText(
      record.subRegion
    ),

    normalizeText(
      record.customerCode
    ),

    normalizeText(
      record.customer
    ),

    normalizeText(
      record.customerShortName
    ),

    normalizeText(
      record.customerRegion
    ),

    normalizeText(
      record.customerDistrict
    ),

    normalizeText(
      record.customerGroup
    ),

    normalizeText(
      record.salesTime
    ),

    normalizeText(
      record.resignTime
    ),

    normalizeText(
      record.salesNo
    ),

    normalizeText(
      record.sales
    ),

    normalizeText(
      record.role
    ),

    normalizeText(
      record.hiredDate
    ),

    normalizeText(
      record.salesLwd
    ),

    normalizeNumber(
      record.salesWorkday
    ),

    normalizeText(
      record.typeOfSeller
    ),

    normalizeText(
      record.monthOfIncentive
    ),

    normalizeText(
      record.incentiveStatus
    )
  );

  return Number(result?.changes) || 0;
}

/**
 * Upsert one Serial Main File record.
 */
export function upsertSerialRecord(
  record
) {
  runUpsert(record);

  return 1;
}

/**
 * Upsert multiple Serial Main File records
 * using one transaction.
 */
export function upsertSerialRecords(
  records = []
) {
  if (!Array.isArray(records)) {
    throw new TypeError(
      "records must be an array."
    );
  }

  if (records.length === 0) {
    return 0;
  }

  db.exec("BEGIN");

  try {
    for (const record of records) {
      runUpsert(record);
    }

    db.exec("COMMIT");

    return records.length;
  } catch (error) {
    db.exec("ROLLBACK");

    throw error;
  }
}

/**
 * Retrieve Serial Main File records
 * from SQLite.
 *
 * Supports:
 * - from date
 * - to date
 * - pagination
 */
/**
 * Remove Sell-out records whose current Kingdee status is On-hand.
 *
 * This is intentionally keyed by serial_number + organization_code so
 * only the current Org 110 Sell-out record is removed.
 */
export function deleteSerialRecordsByKeys(keys = []) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return 0;
  }

  const normalizedKeys = [];
  const seen = new Set();

  for (const item of keys) {
    const serialNumber = normalizeText(item?.serialNumber);
    const organizationCode = normalizeText(item?.organizationCode);

    if (!serialNumber || !organizationCode) {
      continue;
    }

    const key = `${serialNumber}::${organizationCode}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedKeys.push({
      serialNumber,
      organizationCode,
    });
  }

  if (normalizedKeys.length === 0) {
    return 0;
  }

  const statement = db.prepare(
    `DELETE FROM serial_main_file
     WHERE serial_number = ?
       AND organization_code = ?`
  );

  db.exec("BEGIN");

  try {
    let deletedCount = 0;

    for (const item of normalizedKeys) {
      const result = statement.run(
        item.serialNumber,
        item.organizationCode
      );

      deletedCount += Number(result.changes) || 0;
    }

    db.exec("COMMIT");

    return deletedCount;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSerialRecords({
  fromDate = "",
  toDate = "",
  organizationCode = "",
  region = "",
  district = "",
  warehouseCode = "",
  customerCode = "",
  materialCode = "",
  category = "",
  brand = "",
  salesNo = "",

  warehouse = "",
  customer = "",
  materialName = "",
  sales = "",

  search = "",

  page = 1,
  limit = 100,
} = {}) {
  const parsedPage =
    Math.max(
      Number.parseInt(page, 10) || 1,
      1
    );

  const parsedLimit =
    Math.min(
      Math.max(
        Number.parseInt(limit, 10) || 100,
        1
      ),
      500
    );

  const offset =
    (parsedPage - 1) *
    parsedLimit;

  const conditions = [];
  const params = [];

  if (fromDate) {
    conditions.push(
      "sales_time >= ?"
    );

    params.push(
      normalizeText(fromDate)
    );
  }

  if (toDate) {
    conditions.push(
      "sales_time < ?"
    );

    params.push(
      toExclusiveEndDate(
        toDate
      )
    );
  }

  // ========================================
  // Exact filters
  // ========================================

  if (organizationCode) {
    conditions.push(
      "organization_code = ?"
    );

    params.push(
      normalizeText(
        organizationCode
      )
    );
  }

  if (region) {
    conditions.push(
      "region = ?"
    );

    params.push(
      normalizeText(region)
    );
  }

  if (district) {
    conditions.push(
      "district = ?"
    );

    params.push(
      normalizeText(district)
    );
  }

  if (warehouseCode) {
    conditions.push(
      "warehouse_code = ?"
    );

    params.push(
      normalizeText(
        warehouseCode
      )
    );
  }

  if (customerCode) {
    conditions.push(
      "customer_code = ?"
    );

    params.push(
      normalizeText(
        customerCode
      )
    );
  }

  if (materialCode) {
    conditions.push(
      "material_code = ?"
    );

    params.push(
      normalizeText(
        materialCode
      )
    );
  }

  if (category) {
    conditions.push(
      "category = ?"
    );

    params.push(
      normalizeText(category)
    );
  }

  if (brand) {
    conditions.push(
      "brand = ?"
    );

    params.push(
      normalizeText(brand)
    );
  }

  if (salesNo) {
    conditions.push(
      "sales_no = ?"
    );

    params.push(
      normalizeText(salesNo)
    );
  }

  // ========================================
  // Partial-text filters
  // ========================================

  if (warehouse) {
    conditions.push(
      "warehouse LIKE ? COLLATE NOCASE"
    );

    params.push(
      `%${normalizeText(
        warehouse
      )}%`
    );
  }

  if (customer) {
    conditions.push(
      "customer LIKE ? COLLATE NOCASE"
    );

    params.push(
      `%${normalizeText(
        customer
      )}%`
    );
  }

  if (materialName) {
    conditions.push(
      "material_name LIKE ? COLLATE NOCASE"
    );

    params.push(
      `%${normalizeText(
        materialName
      )}%`
    );
  }

  if (sales) {
    conditions.push(
      "sales LIKE ? COLLATE NOCASE"
    );

    params.push(
      `%${normalizeText(
        sales
      )}%`
    );
  }
  if (search) {
  const searchValue =
    `%${normalizeText(search)}%`;

  conditions.push(`
    (
      serial_number LIKE ? COLLATE NOCASE
      OR material_code LIKE ? COLLATE NOCASE
      OR material_name LIKE ? COLLATE NOCASE
      OR model LIKE ? COLLATE NOCASE
      OR warehouse_code LIKE ? COLLATE NOCASE
      OR warehouse LIKE ? COLLATE NOCASE
      OR customer_code LIKE ? COLLATE NOCASE
      OR customer LIKE ? COLLATE NOCASE
      OR customer_short_name LIKE ? COLLATE NOCASE
      OR sales_no LIKE ? COLLATE NOCASE
      OR sales LIKE ? COLLATE NOCASE
    )
  `);

  params.push(
    searchValue,
    searchValue,
    searchValue,
    searchValue,
    searchValue,
    searchValue,
    searchValue,
    searchValue,
    searchValue,
    searchValue,
    searchValue
  );
}
  const whereClause =
    conditions.length > 0
      ? `WHERE ${conditions.join(
          " AND "
        )}`
      : "";

  const countQuery = `
    SELECT
      COUNT(*) AS totalCount
    FROM serial_main_file
    ${whereClause}
  `;

  const countResult =
    db
      .prepare(countQuery)
      .get(...params);

  const totalCount =
    Number(
      countResult?.totalCount
    ) || 0;

  const query = `
    SELECT
      serial_number
        AS serialNumber,

      material_code
        AS materialCode,

      material_name
        AS materialName,

      material_group
        AS materialGroup,

      model
        AS model,

      color
        AS color,

      category
        AS category,

      brand
        AS brand,

      sales_amount
        AS salesAmount,

      organization_code
        AS organizationCode,

      organization_name
        AS organizationName,

      stock_status_code
       AS stockStatusCode,

      stock_status
       AS stockStatus,

      supplier
        AS supplier,

      production_dept
        AS productionDept,

      warehouse_code
        AS warehouseCode,

      warehouse
        AS warehouse,

      mall_name
        AS mallName,

      store_type
       AS storeType,

      district
       AS district,

      region
        AS region,

      sub_region
        AS subRegion,

      customer_code
        AS customerCode,

      customer
        AS customer,

      customer_short_name
        AS customerShortName,

      customer_region
        AS customerRegion,

      customer_district
        AS customerDistrict,

      customer_group
        AS customerGroup,

      sales_time
        AS salesTime,

      resign_time
        AS resignTime,

      sales_no
        AS salesNo,

      sales
        AS sales,

      role
        AS role,

      hired_date
        AS hiredDate,

      sales_lwd
        AS salesLwd,

      sales_workday
        AS salesWorkday,

      type_of_seller
        AS typeOfSeller,

      month_of_incentive
        AS monthOfIncentive,

      incentive_status
        AS incentiveStatus

    FROM serial_main_file

    ${whereClause}

    ORDER BY
      sales_time DESC,
      serial_number ASC,
      organization_code ASC

    LIMIT ?
    OFFSET ?
  `;

  const rows =
    db
      .prepare(query)
      .all(
        ...params,
        parsedLimit,
        offset
      );

  return {
    rows,
    totalCount,
  };
}

/**
 * Return total number of records
 * currently stored locally.
 */
export function getSerialRecordCount() {
  const result =
    getSerialCountStatement.get();

  return Number(
    result?.totalCount
  ) || 0;
}
export function getInventoryReport({
  fromDate = "",
  toDate = "",
  warehouseCode = "",
  region = "",
  district = "",
  materialCode = "",
  category = "",
  brand = "",
  page = 1,
  limit = 100,
} = {}) {
  const parsedPage = Math.max(
    Number.parseInt(page, 10) || 1,
    1
  );

  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(limit, 10) || 100,
      1
    ),
    500
  );

  const offset =
    (parsedPage - 1) *
    parsedLimit;

  const conditions = [
    "stock_status = 'On-hand'",
  ];

  const params = [];

  if (fromDate) {
    conditions.push(
      "sales_time >= ?"
    );

    params.push(
      normalizeText(fromDate)
    );
  }

  if (toDate) {
    conditions.push(
      "sales_time < ?"
    );

    params.push(
      toExclusiveEndDate(
        toDate
      )
    );
  }

  if (warehouseCode) {
    conditions.push(
      "warehouse_code = ?"
    );

    params.push(
      normalizeText(
        warehouseCode
      )
    );
  }

  if (region) {
    conditions.push(
      "region = ?"
    );

    params.push(
      normalizeText(region)
    );
  }

  if (district) {
    conditions.push(
      "district = ?"
    );

    params.push(
      normalizeText(district)
    );
  }

  if (materialCode) {
    conditions.push(
      "material_code = ?"
    );

    params.push(
      normalizeText(
        materialCode
      )
    );
  }

  if (category) {
    conditions.push(
      "category = ?"
    );

    params.push(
      normalizeText(category)
    );
  }

  if (brand) {
    conditions.push(
      "brand = ?"
    );

    params.push(
      normalizeText(brand)
    );
  }

  const whereClause =
    `WHERE ${conditions.join(
      " AND "
    )}`;

  const countQuery = `
    SELECT
      COUNT(*) AS totalCount
    FROM (
      SELECT
        warehouse_code,
        warehouse,
        mall_name,
        store_type,
        district,
        region,
        sub_region,
        customer_code,
        customer,
        customer_district,
        customer_region,
        material_code,
        material_name,
        material_group,
        model,
        color,
        category,
        brand

      FROM serial_main_file

      ${whereClause}

      GROUP BY
        warehouse_code,
        warehouse,
        mall_name,
        store_type,
        district,
        region,
        sub_region,
        customer_code,
        customer,
        customer_district,
        customer_region,
        material_code,
        material_name,
        material_group,
        model,
        color,
        category,
        brand
    )
  `;

  const countResult =
    db
      .prepare(countQuery)
      .get(...params);

  const totalCount =
    Number(
      countResult?.totalCount
    ) || 0;

  const query = `
    SELECT
      warehouse_code
        AS warehouseCode,

      warehouse
        AS warehouse,

      mall_name
        AS mallName,

      store_type
        AS storeType,

      district
        AS district,

      region
        AS region,

      sub_region
        AS subRegion,

      customer_code
        AS customerCode,

      customer
        AS customer,

      customer_district
        AS customerDistrict,

      customer_region
        AS customerRegion,

      material_code
        AS materialCode,

      material_name
        AS materialName,

      material_group
        AS materialGroup,

      model
        AS model,

      color
        AS color,

      category
        AS category,

      brand
        AS brand,

      COUNT(*) AS inventoryQty

    FROM serial_main_file

    ${whereClause}

    GROUP BY
      warehouse_code,
      warehouse,
      mall_name,
      store_type,
      district,
      region,
      sub_region,
      customer_code,
      customer,
      customer_district,
      customer_region,
      material_code,
      material_name,
      material_group,
      model,
      color,
      category,
      brand

    ORDER BY
      warehouse ASC,
      material_name ASC

    LIMIT ?
    OFFSET ?
  `;

  const rows =
    db
      .prepare(query)
      .all(
        ...params,
        parsedLimit,
        offset
      );

  return {
    rows,
    totalCount,
  };
  }
  export function getWarehouseCustomerLookup() {
  const rows = db
    .prepare(`
      SELECT
        warehouse_code
          AS warehouseCode,

        customer_code
          AS customerCode,

        customer
          AS customer,

        customer_region
          AS customerRegion,

        customer_district
          AS customerDistrict

      FROM serial_main_file

      WHERE organization_code = '110'
        AND warehouse_code <> ''
        AND customer_code <> ''

      ORDER BY
        sales_time DESC
    `)
    .all();

  const lookup = {};

  for (const row of rows) {
    const key =
      normalizeText(
        row.warehouseCode
      );

    if (
      key &&
      !lookup[key]
    ) {
      lookup[key] = {
        customerCode:
          row.customerCode ?? "",

        customer:
          row.customer ?? "",

        customerRegion:
          row.customerRegion ?? "",

        customerDistrict:
          row.customerDistrict ?? "",
      };
    }
  }

  return lookup;
}
export function getMaterialGroupLookup() {
  const rows = db
    .prepare(`
      SELECT
        material_code AS materialCode,
        material_group AS materialGroup
      FROM serial_main_file
      WHERE organization_code = '110'
        AND material_code IS NOT NULL
        AND material_code <> ''
        AND material_group IS NOT NULL
        AND material_group <> ''
      ORDER BY
        sales_time DESC
    `)
    .all();

  const lookup = {};

  for (const row of rows) {
    const key =
      String(
        row.materialCode ?? ""
      )
        .trim()
        .toUpperCase();

    if (
      key &&
      !lookup[key]
    ) {
      lookup[key] =
        row.materialGroup ?? "";
    }
  }

  return lookup;
}
export function getSellOutInventoryRows({
  fromDate = "",
  toDate = "",
  activationFromDate = "",
  activationToDate = "",
  warehouseCode = "",
  region = "",
  district = "",
  materialCode = "",
  category = "",
  brand = "",
} = {}) {
  const hasActivationFilter =
    Boolean(
      activationFromDate ||
      activationToDate
    );

  const hasSalesDateFilter =
    Boolean(
      fromDate ||
      toDate
    );

  const conditions = [
    "organization_code = '110'",
  ];

  const params = [];

  // Two independent dashboard modes:
  // Sales Date -> current True Scanned + Warehouse Delivery snapshot.
  // Activation Date -> Activated Serial regardless of Sales Time or current
  // stock status, including On-hand.
  if (!hasActivationFilter) {
    conditions.push(
      "stock_status = 'Warehouse Delivery'"
    );

    conditions.push(`
      EXISTS (
        SELECT 1
        FROM sellout_live_serial live_sellout
        WHERE live_sellout.serial_number = serial_main_file.serial_number
          AND live_sellout.organization_code = serial_main_file.organization_code
      )
    `);
  }

  // Use SQLite date() for dashboard date filtering so records with
  // timestamp values (e.g. "YYYY-MM-DD HH:mm:ss" or ISO timestamps)
  // are consistently matched by the user-facing YYYY-MM-DD filters.
  // Activation Date mode does not apply Sales Time filtering.
  if (!hasActivationFilter) {
    if (fromDate) {
      conditions.push(
        "date(sales_time) >= date(?)"
      );
      params.push(
        normalizeText(fromDate)
      );
    }

    if (toDate) {
      conditions.push(
        "date(sales_time) < date(?)"
      );
      params.push(
        toExclusiveEndDate(
          toDate
        )
      );
    }
  }

  if (activationFromDate) {
    conditions.push(
      "date(resign_time) >= date(?)"
    );
    params.push(
      normalizeText(
        activationFromDate
      )
    );
  }

  if (activationToDate) {
    conditions.push(
      "date(resign_time) < date(?)"
    );
    params.push(
      toExclusiveEndDate(
        activationToDate
      )
    );
  }

  if (warehouseCode) {
    conditions.push(
      "warehouse_code = ?"
    );
    params.push(
      normalizeText(warehouseCode)
    );
  }

  if (region) {
    conditions.push(
      "region = ?"
    );
    params.push(
      normalizeText(region)
    );
  }

  if (district) {
    conditions.push(
      "district = ?"
    );
    params.push(
      normalizeText(district)
    );
  }

  if (materialCode) {
    conditions.push(
      "material_code = ?"
    );
    params.push(
      normalizeText(materialCode)
    );
  }

  if (category) {
    conditions.push(
      "category = ?"
    );
    params.push(
      normalizeText(category)
    );
  }

  if (brand) {
    conditions.push(
      "brand = ?"
    );
    params.push(
      normalizeText(brand)
    );
  }

  const rows = db
    .prepare(`
      SELECT
        warehouse_code AS warehouseCode,
        MAX(warehouse) AS warehouse,
        MAX(mall_name) AS mallName,
        MAX(store_type) AS storeType,
        MAX(district) AS district,
        MAX(region) AS region,
        MAX(sub_region) AS subRegion,

        MAX(customer_code) AS customerCode,
        MAX(customer) AS customer,
        MAX(customer_district) AS customerDistrict,
        MAX(customer_region) AS customerRegion,

        material_code AS materialCode,
        MAX(material_name) AS materialName,
        MAX(material_group) AS materialGroup,
        MAX(model) AS model,
        MAX(color) AS color,
        MAX(category) AS category,
        MAX(brand) AS brand,

        COUNT(*) AS sellOutQty,

        SUM(
          CASE
            WHEN sales_amount IS NULL
              OR sales_amount = ''
            THEN 0
            ELSE CAST(
              sales_amount AS REAL
            )
          END
        ) AS salesAmount

      FROM serial_main_file

      WHERE ${conditions.join(
        " AND "
      )}

      GROUP BY
        warehouse_code,
        material_code

      ORDER BY
        warehouse_code ASC,
        material_code ASC
    `)
    .all(...params);

  return rows.map(
    (row) => ({
      ...row,
      inventoryQty: 0,
      sellOutQty:
        Number(
          row.sellOutQty
        ) || 0,
      salesAmount:
        Number(
          row.salesAmount
        ) || 0,
    })
  );
}

export function getSellOutSummaryLookup({
  fromDate = "",
  toDate = "",
  activationFromDate = "",
  activationToDate = "",
  warehouseCode = "",
  region = "",
  district = "",
  materialCode = "",
  category = "",
  brand = "",
} = {}) {
  const rows =
    getSellOutInventoryRows({
      fromDate,
      toDate,
      activationFromDate,
      activationToDate,
      warehouseCode,
      region,
      district,
      materialCode,
      category,
      brand,
    });

  const lookup = {};

  for (const row of rows) {
    const key =
      `${normalizeText(
        row.warehouseCode
      ).toUpperCase()}::${normalizeText(
        row.materialCode
      ).toUpperCase()}`;

    lookup[key] = {
      warehouseCode:
        row.warehouseCode ?? "",
      warehouse:
        row.warehouse ?? "",
      mallName:
        row.mallName ?? "",
      storeType:
        row.storeType ?? "",
      district:
        row.district ?? "",
      region:
        row.region ?? "",
      subRegion:
        row.subRegion ?? "",
      customerCode:
        row.customerCode ?? "",
      customer:
        row.customer ?? "",
      customerDistrict:
        row.customerDistrict ?? "",
      customerRegion:
        row.customerRegion ?? "",
      materialCode:
        row.materialCode ?? "",
      materialName:
        row.materialName ?? "",
      materialGroup:
        row.materialGroup ?? "",
      model:
        row.model ?? "",
      color:
        row.color ?? "",
      category:
        row.category ?? "",
      brand:
        row.brand ?? "",
      sellOutQty:
        Number(
          row.sellOutQty
        ) || 0,
      salesAmount:
        Number(
          row.salesAmount
        ) || 0,
    };
  }

  return lookup;
}

export function replaceLiveSellOutSerialSnapshot(records = []) {
  const normalized = [];
  const seen = new Set();

  for (const record of records) {
    const serialNumber = normalizeText(record?.serialNumber);
    const organizationCode = normalizeText(record?.organizationCode);
    if (!serialNumber || !organizationCode) continue;
    const key = `${serialNumber}::${organizationCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ serialNumber, organizationCode });
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const previousRow = db
      .prepare("SELECT COUNT(*) AS count FROM sellout_live_serial")
      .get();

    const previousCount = Number(previousRow?.count || 0);

    // This table is a CURRENT snapshot, not historical storage.
    // Rebuild it atomically from the latest completed Warehouse Delivery sync
    // so serials that are no longer Warehouse Delivery are removed.
    db.prepare("DELETE FROM sellout_live_serial").run();

    const insert = db.prepare(`
      INSERT INTO sellout_live_serial (serial_number, organization_code)
      VALUES (?, ?)
    `);

    for (const row of normalized) {
      insert.run(row.serialNumber, row.organizationCode);
    }

    db.exec("COMMIT");

    return {
      previousCount,
      currentCount: normalized.length,
      removedCount: Math.max(previousCount - normalized.length, 0),
      addedCount: Math.max(normalized.length - previousCount, 0),
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getLiveSellOutSnapshotCount() {
  const row = db.prepare("SELECT COUNT(*) AS count FROM sellout_live_serial").get();
  return Number(row?.count || 0);
}

export function replaceInventorySnapshot(rows = []) {
  const normalized = Array.isArray(rows) ? rows : [];
  const updatedAt = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM inventory_snapshot").run();
    db.prepare(`
      INSERT INTO inventory_snapshot (snapshot_id, updated_at, row_count, rows_json)
      VALUES (1, ?, ?, ?)
    `).run(
      updatedAt,
      normalized.length,
      JSON.stringify(normalized)
    );
    db.exec("COMMIT");

    return {
      updatedAt,
      rowCount: normalized.length,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getInventorySnapshot() {
  const row = db
    .prepare(`
      SELECT updated_at AS updatedAt, row_count AS rowCount, rows_json AS rowsJson
      FROM inventory_snapshot
      WHERE snapshot_id = 1
    `)
    .get();

  if (!row) {
    return { updatedAt: null, rowCount: 0, rows: [] };
  }

  let rows = [];
  try {
    const parsed = JSON.parse(row.rowsJson || "[]");
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    rows = [];
  }

  return {
    updatedAt: row.updatedAt || null,
    rowCount: Number(row.rowCount || rows.length),
    rows,
  };
}

export function getSellOutReport({
  fromDate = "",
  toDate = "",
  activationFromDate = "",
  activationToDate = "",
  warehouseCode = "",
  region = "",
  district = "",
  materialCode = "",
  category = "",
  brand = "",
  page = 1,
  limit = 100,
  includedSerialNumbers = [],
} = {}) {
  const parsedPage = Math.max(
    Number.parseInt(page, 10) || 1,
    1
  );

  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(limit, 10) || 100,
      1
    ),
    500
  );

  const offset =
    (parsedPage - 1) *
    parsedLimit;

  const hasActivationFilter =
    Boolean(
      activationFromDate ||
      activationToDate
    );

  const hasSalesDateFilter =
    Boolean(
      fromDate ||
      toDate
    );

  const conditions = [
    "organization_code = '110'",
  ];

  const params = [];

  // Two independent dashboard modes:
  // Sales Date -> current True Scanned + Warehouse Delivery snapshot.
  // Activation Date -> Activated Serial regardless of Sales Time or current
  // stock status, including On-hand.
  if (!hasActivationFilter) {
    conditions.push(
      "stock_status = 'Warehouse Delivery'"
    );

    conditions.push(`
      EXISTS (
        SELECT 1
        FROM sellout_live_serial live_sellout
        WHERE live_sellout.serial_number = serial_main_file.serial_number
          AND live_sellout.organization_code = serial_main_file.organization_code
      )
    `);
  }

  // Use SQLite date() for dashboard date filtering so records with
  // timestamp values (e.g. "YYYY-MM-DD HH:mm:ss" or ISO timestamps)
  // are consistently matched by the user-facing YYYY-MM-DD filters.
  // Activation Date mode does not apply Sales Time filtering.
  if (!hasActivationFilter) {
    if (fromDate) {
      conditions.push(
        "date(sales_time) >= date(?)"
      );
      params.push(
        normalizeText(fromDate)
      );
    }

    if (toDate) {
      conditions.push(
        "date(sales_time) < date(?)"
      );
      params.push(
        toExclusiveEndDate(
          toDate
        )
      );
    }
  }

  if (activationFromDate) {
    conditions.push(
      "date(resign_time) >= date(?)"
    );
    params.push(
      normalizeText(
        activationFromDate
      )
    );
  }

  if (activationToDate) {
    conditions.push(
      "date(resign_time) < date(?)"
    );
    params.push(
      toExclusiveEndDate(
        activationToDate
      )
    );
  }

  if (warehouseCode) {
    conditions.push(
      "warehouse_code = ?"
    );
    params.push(
      normalizeText(warehouseCode)
    );
  }

  if (region) {
    conditions.push(
      "region = ?"
    );
    params.push(
      normalizeText(region)
    );
  }

  if (district) {
    conditions.push(
      "district = ?"
    );
    params.push(
      normalizeText(district)
    );
  }

  if (materialCode) {
    conditions.push(
      "material_code = ?"
    );
    params.push(
      normalizeText(materialCode)
    );
  }

  if (category) {
    conditions.push(
      "category = ?"
    );
    params.push(
      normalizeText(category)
    );
  }

  if (brand) {
    conditions.push(
      "brand = ?"
    );
    params.push(
      normalizeText(brand)
    );
  }

  const whereClause =
    `WHERE ${conditions.join(
      " AND "
    )}`;

  const groupByClause = `
    GROUP BY
      warehouse_code,
      warehouse,
      mall_name,
      store_type,
      district,
      region,
      sub_region,
      customer_code,
      customer,
      customer_district,
      customer_region,
      material_code,
      material_name,
      material_group,
      model,
      color,
      category,
      brand,
      date(sales_time),
      CASE
        WHEN resign_time IS NULL
          OR resign_time = ''
        THEN ''
        ELSE date(resign_time)
      END,
      sales_no,
      sales,
      role,
      hired_date,
      sales_lwd
  `;

  const countResult =
    db
      .prepare(`
        SELECT
          COUNT(*) AS totalCount
        FROM (
          SELECT 1
          FROM serial_main_file
          ${whereClause}
          ${groupByClause}
        )
      `)
      .get(...params);

  const totalCount =
    Number(
      countResult?.totalCount
    ) || 0;

  const rows =
    db
      .prepare(`
        SELECT
          warehouse_code
            AS warehouseCode,

          warehouse
            AS warehouse,

          mall_name
            AS mallName,

          store_type
            AS storeType,

          district
            AS district,

          region
            AS region,

          sub_region
            AS subRegion,

          customer_code
            AS customerCode,

          customer
            AS customer,

          customer_district
            AS customerDistrict,

          customer_region
            AS customerRegion,

          material_code
            AS materialCode,

          material_name
            AS materialName,

          material_group
            AS materialGroup,

          model
            AS model,

          color
            AS color,

          category
            AS category,

          brand
            AS brand,

          date(sales_time)
            AS salesDate,

          CASE
            WHEN resign_time IS NULL
              OR resign_time = ''
            THEN ''
            ELSE date(resign_time)
          END
            AS activationDate,

          COUNT(*)
            AS sellOutQty,

          SUM(
            CASE
              WHEN sales_amount IS NULL
                OR sales_amount = ''
              THEN 0
              ELSE CAST(
                sales_amount AS REAL
              )
            END
          )
            AS salesAmount,

          sales_no
            AS salesNo,

          sales
            AS sales,

          role
            AS role,

          hired_date
            AS hiredDate,

          sales_lwd
            AS salesLwd,

          MAX(
            COALESCE(
              sales_workday,
              0
            )
          )
            AS salesWorkday

        FROM serial_main_file

        ${whereClause}

        ${groupByClause}

        ORDER BY
          date(sales_time) DESC,
          warehouse_code ASC,
          material_code ASC,
          sales_no ASC

        LIMIT ?
        OFFSET ?
      `)
      .all(
        ...params,
        parsedLimit,
        offset
      );

  return {
    rows,
    totalCount,
  };
}
