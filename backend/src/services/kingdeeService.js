import ExcelJS from "exceljs";
import { config } from "../config/env.js";
import { KingdeeClient } from "../kingdee/kingdeeClient.js";
import {
  upsertSerialRecords,
  getSerialRecords,
  getSerialRecordCount,
  getInventoryReport,
  getWarehouseCustomerLookup,
  getMaterialGroupLookup,
  getSellOutInventoryRows,
  getSellOutSummaryLookup,
  getSellOutReport,
  replaceLiveSellOutSerialSnapshot,
  getLiveSellOutSnapshotCount,
  replaceInventorySnapshot,
  getInventorySnapshot,
} from "../database/serialRepository.js";
import {
  createSyncLog,
  completeSyncLog,
  failSyncLog,
  getLatestSyncLog,
  getSyncLogs,
} from "../database/syncRepository.js";
let serialSyncRunning = false;
let serialSyncStartedAt = null;
const stockStatusMap = {
  "0": "To be Stocked",
  "1": "On-hand",
  "2": "To be Delivered",
  "3": "Warehouse Delivery",
  "4": "To be Sold",
  "5": "Sold",
  "6": "Material to be Returned",
  "7": "Material Return",
};

const primarySalesPriceList = "XSJMB0009";
const fallbackSalesPriceList = "XSJMB0254";
const inventoryFields = [
  "FStockId.FNumber",
  "FStockId.FName",
  "FStockId.F_RTA_MallName",
  "FStockId.F_PARV_StoreType",
  "FStockId.F_RTA_Region",
  "FStockId.F_RTA_Department",
  "FMaterialId.FNumber",
  "FMaterialId.FName",
  "FBaseQty",
];

const inventoryFieldIndex =
  Object.fromEntries(
    inventoryFields.map(
      (field, index) => [
        field,
        index,
      ]
    )
  );

function mapInventoryRow(row) {
  const getValue = (fieldKey) =>
    row[
      inventoryFieldIndex[fieldKey]
    ] ?? "";

  return {
    warehouseCode:
      getValue(
        "FStockId.FNumber"
      ),

    warehouse:
      getValue(
        "FStockId.FName"
      ),

    mallName:
      getValue(
        "FStockId.F_RTA_MallName"
      ),

    storeType:
      getValue(
        "FStockId.F_PARV_StoreType"
      ),

      region:
      getValue(
       "FStockId.F_RTA_Region"
      ),

      subRegion:
      getValue(
      "FStockId.F_RTA_Department"
     ),

    materialCode:
      getValue(
        "FMaterialId.FNumber"
      ),

    materialName:
      getValue(
        "FMaterialId.FName"
      ),

    inventoryQty:
      Number(
        getValue("FBaseQty")
      ) || 0,
  };
}
const serialFields = [
  "FNumber",
  "FMaterialID.FNumber",
  "FMaterialID.FName",
  "FMaterialGroup",
  "FOrgId.FNumber",
  "FOrgName",
  "FStockId.FNumber",
  "FStockId.FName",
  "FStockId.F_RTA_MallName",
  "FStockId.F_PARV_StoreType",
  "FSUPPLYID.FName",
  "FProduceDeptID.FName",
  "FCustId.FName",
  "F_RTA_SalesNo",
  "F_RTA_SALES.FName",
  "F_RTA_SaleDateTime",
  "F_RTA_ResignTime",
  "F_RTA_Region",
  "F_RTA_SubRegion",
  "FREMARK1",
  "FREMARK2",
  "FREMARK3",
  "FStockStatus",
];

const materialFields = [
  "FNumber",
  "FName",
  "F_RTA_Model",
  "F_RTA_Model.FNumber",
  "F_RTA_Modelcode",
  "F_PARV_Category",
  "F_PARV_Category.FNumber",
  "F_PARV_Brand",
  "F_PARV_Brand.FNumber",
];

const modelFields = [
  "FNumber",
  "FModelName",
];

const colorFields = [
  "FNumber",
  "FColorName",
];

const salesPriceFields = [
  "FNumber",
  "FMaterialId.FNumber",
  "FEntryEffectiveDate",
  "FPrice",
];

const customerFields = [
  "FName",
  "FNumber",
  "FShortName",
  "FGroup.FName",
  "F_RTA_Region.FName",
];
const departmentFields = [
  "FNumber",
  "F_RTA_Territory.FNumber",
];

const employeeFields = [
  "FStaffNumber",
  "FName",
  "F_RTA_Department",
  "F_RTA_Department.FName",
  "F_RTA_Role",
  "F_RTA_Role.FNumber",
  "F_RTA_Role.FName",
  "F_RTA_HireDate",
  "F_RTA_ResignDate",
  "FForbidStatus",
];

function createFieldIndex(fields) {
  return Object.fromEntries(
    fields.map((field, index) => [
      field,
      index,
    ])
  );
}

const serialFieldIndex =
  createFieldIndex(serialFields);

const materialFieldIndex =
  createFieldIndex(materialFields);

const modelFieldIndex =
  createFieldIndex(modelFields);

const colorFieldIndex =
  createFieldIndex(colorFields);

const salesPriceFieldIndex =
  createFieldIndex(salesPriceFields);

const customerFieldIndex =
  createFieldIndex(customerFields);

const departmentFieldIndex =
  createFieldIndex(departmentFields);

const employeeFieldIndex =
  createFieldIndex(employeeFields);


const inventoryExportColumns = [
  { header: "Warehouse Code", key: "warehouseCode", width: 20 },
  { header: "Warehouse", key: "warehouse", width: 32 },
  { header: "Mall Name", key: "mallName", width: 24 },
  { header: "Store Type", key: "storeType", width: 16 },
  { header: "District", key: "district", width: 14 },
  { header: "Region", key: "region", width: 14 },
  { header: "Sub-Region", key: "subRegion", width: 16 },
  { header: "Customer Code", key: "customerCode", width: 18 },
  { header: "Customer", key: "customer", width: 32 },
  { header: "Customer District", key: "customerDistrict", width: 18 },
  { header: "Customer Region", key: "customerRegion", width: 18 },
  { header: "Material Code", key: "materialCode", width: 34 },
  { header: "Material Name", key: "materialName", width: 42 },
  { header: "Material Group", key: "materialGroup", width: 24 },
  { header: "Model", key: "model", width: 30 },
  { header: "Color", key: "color", width: 18 },
  { header: "Category", key: "category", width: 20 },
  { header: "Brand", key: "brand", width: 18 },
  { header: "Inventory Qty", key: "inventoryQty", width: 14 },
  { header: "Sell-out Qty", key: "sellOutQty", width: 14 },
  { header: "Sales Amount", key: "salesAmount", width: 16 },
  { header: "Average Daily Sell-out", key: "averageDailySellOut", width: 20 },
  { header: "Days of Supply", key: "daysOfSupply", width: 16 },
];

const sellOutExportColumns = [
  { header: "Warehouse Code", key: "warehouseCode", width: 20 },
  { header: "Warehouse", key: "warehouse", width: 32 },
  { header: "Mall Name", key: "mallName", width: 24 },
  { header: "Store Type", key: "storeType", width: 16 },
  { header: "District", key: "district", width: 14 },
  { header: "Region", key: "region", width: 14 },
  { header: "Sub-Region", key: "subRegion", width: 16 },
  { header: "Customer Code", key: "customerCode", width: 18 },
  { header: "Customer", key: "customer", width: 32 },
  { header: "Customer District", key: "customerDistrict", width: 18 },
  { header: "Customer Region", key: "customerRegion", width: 18 },
  { header: "Material Code", key: "materialCode", width: 34 },
  { header: "Material Name", key: "materialName", width: 42 },
  { header: "Material Group", key: "materialGroup", width: 24 },
  { header: "Model", key: "model", width: 30 },
  { header: "Color", key: "color", width: 18 },
  { header: "Category", key: "category", width: 20 },
  { header: "Brand", key: "brand", width: 18 },
  { header: "Sales Date", key: "salesDate", width: 14 },
  { header: "Activation Date", key: "activationDate", width: 16 },
  { header: "Sell-out Qty", key: "sellOutQty", width: 14 },
  { header: "Sales Amount", key: "salesAmount", width: 16 },
  { header: "Sales No", key: "salesNo", width: 16 },
  { header: "Sales", key: "sales", width: 28 },
  { header: "Role", key: "role", width: 18 },
  { header: "Hired Date", key: "hiredDate", width: 14 },
  { header: "Sales LWD", key: "salesLwd", width: 14 },
  { header: "Sales Workday", key: "salesWorkday", width: 16 },
];

function parseDateSafely(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getTime());
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  // Kingdee date fields may be returned as:
  // YYYY-MM-DD
  // YYYY-MM-DDT00:00:00
  // YYYY-MM-DDTHH:mm:ss
  //
  // Treat the YYYY-MM-DD portion as a calendar date in local time.
  // This prevents JavaScript timezone conversion from shifting the
  // displayed Excel date or Sales Workday calculation by one day.
  const dateOnlyMatch =
    /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(
      text
    );

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);

    const date =
      new Date(
        year,
        month - 1,
        day
      );

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toExcelDate(value) {
  if (!value) {
    return "";
  }

  const text = String(value).trim();

  if (!text) {
    return "";
  }

  // ExcelJS serializes JavaScript Date values using the Date timestamp.
  // For Kingdee date-only values, create a UTC-midnight Date so the
  // calendar date is preserved in Excel regardless of the server timezone.
  const dateOnlyMatch =
    /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text);

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);

    const date =
      new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date;
    }

    return text;
  }

  const date = parseDateSafely(value);

  // Preserve the original value when it is not a valid date.
  if (!date) {
    return text;
  }

  return date;
}

function getCalendarDate(value) {
  const date = parseDateSafely(value);

  if (!date) {
    return null;
  }

  // Use UTC midnight for calendar-day arithmetic. This avoids DST and
  // timezone offsets changing an exact day difference by one day.
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    )
  );
}

function styleReportWorksheet(worksheet, {
  dateColumns = [],
  integerColumns = [],
  amountColumns = [],
} = {}) {
  worksheet.views = [
    {
      state: "frozen",
      ySplit: 1,
    },
  ];

  worksheet.autoFilter = {
    from: {
      row: 1,
      column: 1,
    },
    to: {
      row: 1,
      column: worksheet.columnCount,
    },
  };

  const headerRow = worksheet.getRow(1);

  headerRow.height = 24;
  headerRow.font = {
    bold: true,
    color: {
      argb: "FFFFFFFF",
    },
  };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: "FF1F4E78",
    },
  };
  headerRow.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };

  worksheet.eachRow(
    {
      includeEmpty: false,
    },
    (row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = {
          vertical: "top",
        };
      }
    }
  );

  for (const key of dateColumns) {
    worksheet.getColumn(key).numFmt =
      "yyyy-mm-dd";
  }

  for (const key of integerColumns) {
    worksheet.getColumn(key).numFmt =
      "#,##0";
  }

  for (const key of amountColumns) {
    worksheet.getColumn(key).numFmt =
      "#,##0.00";
  }
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

function getSelectedSalesDays(
  fromDate,
  toDate
) {
  const fromText =
    String(
      fromDate ?? ""
    )
      .trim()
      .slice(0, 10);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      fromText
    )
  ) {
    return 1;
  }

  const effectiveToDate =
    toDate
      ? toExclusiveEndDate(
          String(toDate)
            .trim()
            .slice(0, 10)
        )
      : toExclusiveEndDate(
          new Date()
            .toISOString()
            .slice(0, 10)
        );

  const from =
    new Date(
      `${fromText}T00:00:00Z`
    );

  const to =
    new Date(
      `${effectiveToDate}T00:00:00Z`
    );

  if (
    Number.isNaN(
      from.getTime()
    ) ||
    Number.isNaN(
      to.getTime()
    )
  ) {
    return 1;
  }

  const diffMs =
    to.getTime() -
    from.getTime();

  return Math.max(
    Math.ceil(
      diffMs /
        (
          1000 *
          60 *
          60 *
          24
        )
    ),
    1
  );
}

function calculateInventoryMetrics(
  row,
  selectedSalesDays
) {
  const inventoryQty =
    Number(
      row.inventoryQty
    ) || 0;

  const sellOutQty =
    Number(
      row.sellOutQty
    ) || 0;

  const salesAmount =
    Number(
      row.salesAmount
    ) || 0;

  const averageDailySellOut =
    sellOutQty > 0
      ? sellOutQty /
        selectedSalesDays
      : 0;

  const daysOfSupply =
    averageDailySellOut > 0
      ? inventoryQty /
        averageDailySellOut
      : "N/A";

  return {
    ...row,

    inventoryQty,
    sellOutQty,
    salesAmount,

    averageDailySellOut:
      Number(
        averageDailySellOut
          .toFixed(4)
      ),

    daysOfSupply:
      typeof daysOfSupply ===
      "number"
        ? Number(
            daysOfSupply
              .toFixed(2)
          )
        : daysOfSupply,
  };
}

function mergeInventoryWithSellOutRows(
  currentInventoryRows,
  sellOutRows,
  {
    selectedSalesDays = 1,
    region = "",
    district = "",
    subRegion = "",
    materialCode = "",
    category = "",
    brand = "",
  } = {}
) {
  const merged = new Map();

  // Current inventory is the primary source for on-hand quantity.
  // Aggregate by Warehouse Code + Material Code in case STK_Inventory
  // returns more than one row for the same retail item.
  for (
    const row of
    currentInventoryRows || []
  ) {
    const key =
      `${normalizeKey(
        row.warehouseCode
      )}::${normalizeKey(
        row.materialCode
      )}`;

    if (!key || key === "::") {
      continue;
    }

    const existing =
      merged.get(key);

    if (existing) {
      existing.inventoryQty =
        (
          Number(
            existing.inventoryQty
          ) || 0
        ) +
        (
          Number(
            row.inventoryQty
          ) || 0
        );

      // Keep the most complete dimension values.
      for (
        const field of [
          "warehouse",
          "mallName",
          "storeType",
          "district",
          "region",
          "subRegion",
          "customerCode",
          "customer",
          "customerDistrict",
          "customerRegion",
          "materialName",
          "materialGroup",
          "model",
          "color",
          "category",
          "brand",
        ]
      ) {
        if (
          !existing[field] &&
          row[field]
        ) {
          existing[field] =
            row[field];
        }
      }
    } else {
      merged.set(
        key,
        {
          ...row,
          inventoryQty:
            Number(
              row.inventoryQty
            ) || 0,
          sellOutQty: 0,
          salesAmount: 0,
        }
      );
    }
  }

  // Overlay Sell-out totals. If the item is no longer in current
  // inventory, create a zero-stock row so Inventory and Sell-out
  // reconcile for the selected period.
  for (
    const sellOutRow of
    sellOutRows || []
  ) {
    const key =
      `${normalizeKey(
        sellOutRow.warehouseCode
      )}::${normalizeKey(
        sellOutRow.materialCode
      )}`;

    if (!key || key === "::") {
      continue;
    }

    const existing =
      merged.get(key);

    if (existing) {
      existing.sellOutQty =
        Number(
          sellOutRow.sellOutQty
        ) || 0;

      existing.salesAmount =
        Number(
          sellOutRow.salesAmount
        ) || 0;

      for (
        const field of [
          "warehouse",
          "mallName",
          "storeType",
          "district",
          "region",
          "subRegion",
          "customerCode",
          "customer",
          "customerDistrict",
          "customerRegion",
          "materialName",
          "materialGroup",
          "model",
          "color",
          "category",
          "brand",
        ]
      ) {
        if (
          !existing[field] &&
          sellOutRow[field]
        ) {
          existing[field] =
            sellOutRow[field];
        }
      }
    } else {
      merged.set(
        key,
        {
          ...sellOutRow,
          inventoryQty: 0,
          sellOutQty:
            Number(
              sellOutRow.sellOutQty
            ) || 0,
          salesAmount:
            Number(
              sellOutRow.salesAmount
            ) || 0,
        }
      );
    }
  }

  const normalizedFilters = {
    region:
      normalizeKey(region),
    district:
      normalizeKey(district),
    subRegion:
      normalizeKey(subRegion),
    materialCode:
      normalizeKey(materialCode),
    category:
      normalizeKey(category),
    brand:
      normalizeKey(brand),
  };

  return [
    ...merged.values(),
  ]
    .filter((row) => {
      if (
        normalizedFilters.region &&
        normalizeKey(
          row.region
        ) !==
          normalizedFilters.region
      ) {
        return false;
      }

      if (
        normalizedFilters.district &&
        normalizeKey(
          row.district
        ) !==
          normalizedFilters.district
      ) {
        return false;
      }

      if (
        normalizedFilters.subRegion &&
        normalizeKey(
          row.subRegion
        ) !==
          normalizedFilters.subRegion
      ) {
        return false;
      }

      if (
        normalizedFilters.materialCode &&
        normalizeKey(
          row.materialCode
        ) !==
          normalizedFilters.materialCode
      ) {
        return false;
      }

      if (
        normalizedFilters.category &&
        normalizeKey(
          row.category
        ) !==
          normalizedFilters.category
      ) {
        return false;
      }

      if (
        normalizedFilters.brand &&
        normalizeKey(
          row.brand
        ) !==
          normalizedFilters.brand
      ) {
        return false;
      }

      return true;
    })
    .map((row) =>
      calculateInventoryMetrics(
        row,
        selectedSalesDays
      )
    )
    .sort((a, b) => {
      const warehouseCompare =
        String(
          a.warehouseCode ?? ""
        ).localeCompare(
          String(
            b.warehouseCode ?? ""
          )
        );

      if (
        warehouseCompare !== 0
      ) {
        return warehouseCompare;
      }

      return String(
        a.materialCode ?? ""
      ).localeCompare(
        String(
          b.materialCode ?? ""
        )
      );
    });
}


const kingdeeClient =
  new KingdeeClient(config.kingdee);

// ==============================
// IN-MEMORY CACHE
// ==============================

const CACHE_TTL_MS = 30 * 60 * 1000;
const memoryCache = new Map();

function getCachedValue(key) {
  const cached = memoryCache.get(key);

  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedValue(
  key,
  value,
  ttl = CACHE_TTL_MS
) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });

  return value;
}

function clearCache() {
  memoryCache.clear();
}

async function timedQuery(
  label,
  fn
) {
  const start = performance.now();

  try {
    return await fn();
  } finally {
    const duration =
      performance.now() - start;

    console.log(
      `[PERFORMANCE] ${label}: ${duration.toFixed(0)} ms`
    );
  }
}

function escapeKingdeeValue(value) {
  return String(value ?? "")
    .replace(/'/g, "''");
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeCustomerName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeColorText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function buildOrFilter(
  fieldKey,
  values
) {
  const uniqueValues = [
    ...new Set(
      (values || [])
        .map((value) =>
          String(value ?? "").trim()
        )
        .filter(Boolean)
    ),
  ];

  if (!uniqueValues.length) {
    return "";
  }

  return `(${uniqueValues
    .map(
      (value) =>
        `${fieldKey} = '${escapeKingdeeValue(
          value
        )}'`
    )
    .join(" OR ")})`;
}
function chunkArray(
  values,
  chunkSize = 50
) {
  const chunks = [];

  for (
    let i = 0;
    i < values.length;
    i += chunkSize
  ) {
    chunks.push(
      values.slice(
        i,
        i + chunkSize
      )
    );
  }

  return chunks;
}
async function queryAllPages({
  formId,
  fieldKeys,
  filterString = "",
  orderString = "",
  pageSize = 500,
}) {
  const allRows = [];

  let startRow = 0;

  while (true) {
    const rows =
      await kingdeeClient.executeBillQuery({
        formId,
        fieldKeys,
        filterString,
        orderString,
        startRow,
        limit: pageSize,
      });

    if (!rows.length) {
      break;
    }

    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    startRow += rows.length;
  }

  return allRows;
}
function mapSerialRow(row) {
  const getValue = (fieldKey) => {
    const index = serialFieldIndex[fieldKey];

    return index !== undefined
      ? row[index] ?? ""
      : "";
  };

  const stockStatusCode = String(
    getValue("FStockStatus")
  );

  return {
    serialNumber:
      getValue("FNumber"),

    materialCode:
      getValue("FMaterialID.FNumber"),

    materialName:
      getValue("FMaterialID.FName"),

    materialGroup:
      getValue("FMaterialGroup"),

    organizationCode:
      getValue("FOrgId.FNumber"),

    organizationName:
      getValue("FOrgName"),

    stockStatusCode,

    stockStatus:
      stockStatusMap[stockStatusCode] ??
      stockStatusCode,

    warehouseCode:
      getValue("FStockId.FNumber"),

    warehouse:
      getValue("FStockId.FName"),

    mallName:
      getValue(
       "FStockId.F_RTA_MallName"
    ),

    storeType:
      getValue(
    "FStockId.F_PARV_StoreType"
    ),

    supplier:
      getValue("FSUPPLYID.FName"),

    productionDept:
      getValue("FProduceDeptID.FName"),

    customer:
      getValue("FCustId.FName"),

    salesNo:
      getValue("F_RTA_SalesNo"),

    sales:
      getValue("F_RTA_SALES.FName"),

    salesTime:
      getValue("F_RTA_SaleDateTime"),

    resignTime:
      getValue("F_RTA_ResignTime"),

    region:
      getValue("F_RTA_Region"),

    subRegion:
      getValue("F_RTA_SubRegion"),

    typeOfSeller:
      getValue("FREMARK1"),

    monthOfIncentive:
      getValue("FREMARK2"),

    incentiveStatus:
      getValue("FREMARK3"),
  };
}

function mapMaterialRow(row) {
  const getValue = (fieldKey) =>
    row[materialFieldIndex[fieldKey]] ?? "";

  return {
    materialCode:
      getValue("FNumber"),

    materialName:
      getValue("FName"),

    modelId:
      getValue("F_RTA_Model"),

    modelCode:
      getValue("F_RTA_Model.FNumber"),

    modelNumber:
      getValue("F_RTA_Modelcode"),

    categoryId:
      getValue("F_PARV_Category"),

    category:
      getValue("F_PARV_Category.FNumber"),

    brandId:
      getValue("F_PARV_Brand"),

    brand:
      getValue("F_PARV_Brand.FNumber"),
  };
}

function mapCustomerRow(row) {
  const getValue = (fieldKey) =>
    row[customerFieldIndex[fieldKey]] ?? "";

  return {
    customerName:
  getValue("FName"),

    customerCode:
      getValue("FNumber"),

    customerShortName:
      getValue("FShortName"),

    customerGroup:
      getValue("FGroup.FName"),

    customerRegion:
      getValue("F_RTA_Region.FName"),
  };
}

function mapEmployeeRow(row) {
  const getValue = (fieldKey) =>
    row[employeeFieldIndex[fieldKey]] ?? "";

  // Kingdee BD_Empinfo returns FForbidStatus as a status code:
  // A = Active, B = Disabled.
  // Keep boolean true/false compatibility in case another Kingdee
  // configuration returns a boolean value instead.
  const rawForbidStatus = getValue("FForbidStatus");
  const normalizedForbidStatus =
    String(rawForbidStatus ?? "").trim().toUpperCase();

  const forbidStatus =
    normalizedForbidStatus === "B" ||
    rawForbidStatus === true;

  return {
    salesNo:
      getValue("FStaffNumber"),

    employeeName:
      getValue("FName"),

    departmentId:
      getValue("F_RTA_Department"),

    department:
      getValue("F_RTA_Department.FName"),

    roleId:
      getValue("F_RTA_Role"),
    roleCode:
      getValue("F_RTA_Role.FNumber"),
    role:
      getValue("F_RTA_Role.FName"),

    hiredDate:
      getValue("F_RTA_HireDate"),

    salesLwd:
      getValue("F_RTA_ResignDate"),

    // Kingdee employee status:
    // FForbidStatus = "A" -> active
    // FForbidStatus = "B" -> disabled
    disable:
      forbidStatus,

    isActive:
      !forbidStatus,
  };
}

function mapSalesPriceRow(row) {
  const getValue = (fieldKey) =>
    row[salesPriceFieldIndex[fieldKey]] ?? "";

  return {
    priceListNumber:
      getValue("FNumber"),

    materialCode:
      getValue("FMaterialId.FNumber"),

    effectiveDate:
      getValue("FEntryEffectiveDate"),

    price:
      getValue("FPrice"),
  };
}
async function getMaterialLookup(
  materialCodes
) {
  const normalizedMaterialCodes = [
    ...new Set(
      (materialCodes || [])
        .map((value) =>
          normalizeKey(value)
        )
        .filter(Boolean)
    ),
  ];

  if (!normalizedMaterialCodes.length) {
    return {};
  }

  const cacheKey =
    `MATERIAL_LOOKUP:${normalizedMaterialCodes
      .slice()
      .sort()
      .join("|")}`;

  const cached =
    getCachedValue(cacheKey);

  if (cached) {
    return cached;
  }

  const lookup = {};

  // Avoid Kingdee "Filter conditions are too long"
  const chunks =
    chunkArray(
      normalizedMaterialCodes,
      30
    );

  for (const chunk of chunks) {
    const filterString =
      buildOrFilter(
        "FNumber",
        chunk
      );

    if (!filterString) {
      continue;
    }

    const rows =
      await queryAllPages({
        formId: "BD_MATERIAL",

        fieldKeys:
          materialFields,

        filterString,

        orderString:
          "FNumber ASC",

        pageSize: 500,
      });

    for (const row of rows) {
      const material =
        mapMaterialRow(row);

      const key =
        normalizeKey(
          material.materialCode
        );

      if (
        key &&
        !lookup[key]
      ) {
        lookup[key] =
          material;
      }
    }
  }

  return setCachedValue(
    cacheKey,
    lookup
  );
}

async function getModelLookup(
  modelCodes
) {
  const normalizedModelCodes = [
  ...new Set(
    (modelCodes || [])
      .map((value) =>
        normalizeKey(value)
      )
      .filter(Boolean)
  ),
];

const cacheKey =
  `MODEL_LOOKUP:${normalizedModelCodes
    .sort()
    .join("|")}`;

const cached =
  getCachedValue(cacheKey);

if (cached) {
  return cached;
}
  const filterString =
    buildOrFilter(
      "FNumber",
      modelCodes
    );

  if (!filterString) {
    return {};
  }

  const rows =
    await queryAllPages({
      formId: "RTA_OLO_Model",
      fieldKeys: modelFields,
      filterString,
      orderString: "FNumber ASC",
    });

  const lookup = {};

  for (const row of rows) {
    const modelCode =
      row[
        modelFieldIndex["FNumber"]
      ] ?? "";

    const modelName =
      row[
        modelFieldIndex["FModelName"]
      ] ?? "";

    const key =
      normalizeKey(modelCode);

    if (key) {
      lookup[key] =
        modelName || modelCode;
    }
  }

  return setCachedValue(
  cacheKey,
  lookup
);
}

async function getColorMasterRecords() {
  const cacheKey = "COLOR_MASTER";

  const cached =
    getCachedValue(cacheKey);

  if (cached) {
    return cached;
  }

  console.time("Color Master");

  const rows =
    await kingdeeClient.executeBillQuery({
      formId: "RTA_OLO_Color",
      fieldKeys: colorFields,
      filterString: "",
      orderString: "FColorName ASC",
      startRow: 0,
      limit: 500,
    });

  const records = rows
    .map((row) => ({
      colorCode:
        row[
          colorFieldIndex["FNumber"]
        ] ?? "",

      colorName:
        row[
          colorFieldIndex["FColorName"]
        ] ?? "",
    }))
    .filter(
      (record) => record.colorName
    )
    .sort((a, b) => {
      const aLength = Math.max(
        normalizeColorText(
          a.colorName
        ).length,
        normalizeColorText(
          a.colorCode
        ).length
      );

      const bLength = Math.max(
        normalizeColorText(
          b.colorName
        ).length,
        normalizeColorText(
          b.colorCode
        ).length
      );

      return bLength - aLength;
    });

  console.timeEnd("Color Master");

  return setCachedValue(
    cacheKey,
    records
  );
}

function materialNameEndsWithColor(
  materialName,
  colorValue
) {
  if (!colorValue) {
    return false;
  }

  return (
    materialName === colorValue ||
    materialName.endsWith(
      `-${colorValue}`
    ) ||
    materialName.endsWith(
      ` ${colorValue}`
    )
  );
}

function findColorFromMaterialName(
  materialName,
  colorRecords
) {
  const normalizedMaterialName =
    normalizeColorText(
      materialName
    );

  if (!normalizedMaterialName) {
    return "";
  }

  for (
    const record of
    colorRecords || []
  ) {
    const colorName =
      String(
        record.colorName ?? ""
      ).trim();

    const normalizedColorName =
      normalizeColorText(
        record.colorName
      );

    const normalizedColorCode =
      normalizeColorText(
        record.colorCode
      );

    if (
      normalizedColorName &&
      materialNameEndsWithColor(
        normalizedMaterialName,
        normalizedColorName
      )
    ) {
      return colorName;
    }

    if (
      normalizedColorCode &&
      materialNameEndsWithColor(
        normalizedMaterialName,
        normalizedColorCode
      )
    ) {
      return colorName;
    }
  }

  return "";
}
async function enrichCommonRecords(
  records,
  {
    labelPrefix = "Common",
  } = {}
) {
  if (!records.length) {
    return [];
  }

  const materialCodes = [
    ...new Set(
      records
        .map(
          (record) =>
            record.materialCode
        )
        .filter(Boolean)
    ),
  ];

  // Customer enrichment is always keyed from the
  // customer name carried by the source record.
  // This preserves the Serial Main File customer
  // while enriching code / region / district from
  // BD_Customer and BD_Department.
  const customerNames = [
    ...new Set(
      records
        .map(
          (record) =>
            String(
              record.customer ?? ""
            ).trim()
        )
        .filter(Boolean)
    ),
  ];

  const regions = [
    ...new Set(
      records
        .map(
          (record) =>
            record.region
        )
        .filter(Boolean)
    ),
  ];

  const [
    materialLookup,
    colorRecords,
    customerLookup,
  ] = await Promise.all([
    timedQuery(
      `${labelPrefix} Material Lookup`,
      () =>
        getMaterialLookup(
          materialCodes
        )
    ),

    timedQuery(
      `${labelPrefix} Color Lookup`,
      () =>
        getColorMasterRecords()
    ),

    timedQuery(
      `${labelPrefix} Customer Lookup`,
      () =>
        getCustomerLookup(
          customerNames
        )
    ),
  ]);

  const modelCodes = [
    ...new Set(
      Object.values(
        materialLookup
      )
        .map(
          (material) =>
            material.modelCode
        )
        .filter(Boolean)
    ),
  ];

  const customerRegions = [
    ...new Set([
      ...records
        .map(
          (record) =>
            record.customerRegion
        )
        .filter(Boolean),

      ...Object.values(
        customerLookup
      )
        .map(
          (customer) =>
            customer.customerRegion
        )
        .filter(Boolean),
    ]),
  ];

  const departmentCodes = [
    ...new Set([
      ...regions,
      ...customerRegions,
    ]),
  ];

  const [
    modelLookup,
    departmentLookup,
  ] = await Promise.all([
    timedQuery(
      `${labelPrefix} Model Lookup`,
      () =>
        getModelLookup(
          modelCodes
        )
    ),

    timedQuery(
      `${labelPrefix} Department Lookup`,
      () =>
        getDepartmentLookup(
          departmentCodes
        )
    ),
  ]);

  return records.map(
    (record) => {
      const material =
        materialLookup[
          normalizeKey(
            record.materialCode
          )
        ] || null;

      const sourceCustomerName =
        String(
          record.customer ?? ""
        ).trim();

      const customer =
        customerLookup[
          normalizeCustomerName(
            sourceCustomerName
          )
        ] || null;

      const materialName =
        material?.materialName ||
        record.materialName ||
        "";

      const model =
        modelLookup[
          normalizeKey(
            material?.modelCode
          )
        ] ||
        record.model ||
        "";

      const color =
        findColorFromMaterialName(
          materialName,
          colorRecords
        ) ||
        record.color ||
        "";

      // Dashboard display fallbacks.
      // Keep the original Kingdee model/color unchanged
      // for extraction and Excel, while providing clean
      // values for the future Model -> Color drill-down.
      const displayModel =
        String(
          model ||
          materialName ||
          ""
        ).trim();

      const displayColor =
        String(
          color ||
          "No Color"
        ).trim();

      const district =
        record.district ||
        departmentLookup[
          normalizeKey(
            record.region
          )
        ] ||
        "";

      // Prefer customer-master enrichment when the
      // customer name matches. Existing source values
      // remain as fallbacks for Inventory / legacy data.
      const customerRegion =
        customer?.customerRegion ||
        record.customerRegion ||
        "";

      const customerDistrict =
        departmentLookup[
          normalizeKey(
            customerRegion
          )
        ] ||
        record.customerDistrict ||
        "";

      return {
        ...record,

        materialName,

        // Serial Main File already supplies this field.
        // Other sources keep their current value until a
        // confirmed material-group source is wired in.
        materialGroup:
          record.materialGroup ?? "",

        model,
        color,

        displayModel,
        displayColor,

        category:
          material?.category ||
          record.category ||
          "",

        brand:
          material?.brand ||
          record.brand ||
          "",

        district,

        customerCode:
          customer?.customerCode ||
          record.customerCode ||
          "",

        // Preserve the exact customer name from the
        // source record. Do not replace it with warehouse
        // or customer-master display text.
        customer:
          sourceCustomerName,

        customerShortName:
          customer?.customerShortName ||
          record.customerShortName ||
          "",

        customerRegion,
        customerDistrict,

        customerGroup:
          customer?.customerGroup ||
          record.customerGroup ||
          "",
      };
    }
  );
}

async function enrichInventorySummaryRows(
  inventoryRows
) {
  if (!inventoryRows.length) {
    return [];
  }

  const warehouseCustomerLookup =
  getWarehouseCustomerLookup();

  const materialGroupLookup =
  getMaterialGroupLookup();

  const rowsWithCustomer =
    inventoryRows.map(
      (inventoryRow) => {
        const warehouseCustomer =
          warehouseCustomerLookup[
            normalizeKey(
              inventoryRow.warehouseCode
            )
          ] || null;
    const materialGroup =
  materialGroupLookup[
    normalizeKey(
      inventoryRow.materialCode
    )
  ] || "";

        return {
          ...inventoryRow,

           materialGroup,

          customerCode:
            warehouseCustomer?.customerCode ?? "",

          customer:
            warehouseCustomer?.customer ?? "",

          customerRegion:
            warehouseCustomer?.customerRegion ?? "",

          customerDistrict:
            warehouseCustomer?.customerDistrict ?? "",
        };
      }
    );

  return enrichCommonRecords(
    rowsWithCustomer,
    {
      labelPrefix:
        "Inventory Summary",
    }
  );
}
function buildCustomerNameCandidates(
  value
) {
  const original = String(
    value ?? ""
  ).trim();

  if (!original) {
    return [];
  }

  const normalizedSpaces =
    original
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const normalizedDashes =
    normalizedSpaces
      .replace(/[\u2010-\u2015\u2212]/g, "-");

  const accentFree =
    normalizedDashes
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      );

  return [
    ...new Set([
      original,
      normalizedSpaces,
      normalizedDashes,
      accentFree,
    ].filter(Boolean)),
  ];
}

async function getCustomerLookup(
  customerNames
) {
  const requestedNames = [
    ...new Set(
      (customerNames || [])
        .map((name) =>
          String(name ?? "").trim()
        )
        .filter(Boolean)
    ),
  ];

  if (!requestedNames.length) {
    return {};
  }

  const masterCacheKey =
    "ACTIVE_CUSTOMER_MASTER";

  let customerMaster =
    getCachedValue(
      masterCacheKey
    );

  if (!customerMaster) {
    const rows =
      await queryAllPages({
        formId: "BD_Customer",

        fieldKeys:
          customerFields,

        filterString:
          "FDocumentStatus = 'C' " +
          "AND FForbidStatus = 'A'",

        orderString:
          "FNumber ASC",

        pageSize: 500,
      });

    customerMaster = {};

    for (const row of rows) {
      const customer =
        mapCustomerRow(row);

      const key =
        normalizeCustomerName(
          customer.customerName
        );

      if (
        key &&
        !customerMaster[key]
      ) {
        customerMaster[key] =
          customer;
      }
    }

    setCachedValue(
      masterCacheKey,
      customerMaster
    );
  }

  const lookup = {};

  for (
    const requestedName of
    requestedNames
  ) {
    const key =
      normalizeCustomerName(
        requestedName
      );

    const customer =
      customerMaster[key];

    if (customer) {
      lookup[key] =
        customer;
    } else {
      console.warn(
        `[CUSTOMER LOOKUP] No active BD_Customer match for: ${requestedName}`
      );
    }
  }

  return lookup;
}

async function getDepartmentLookup(
  regions
) {
  const normalizedRegions = [
  ...new Set(
    (regions || [])
      .map((value) =>
        normalizeKey(value)
      )
      .filter(Boolean)
  ),
];

const cacheKey =
  `DEPARTMENT_LOOKUP:${normalizedRegions
    .sort()
    .join("|")}`;

const cached =
  getCachedValue(cacheKey);

if (cached) {
  return cached;
}
  const filterString =
    buildOrFilter(
      "FNumber",
      regions
    );

  if (!filterString) {
    return {};
  }

  const rows =
    await queryAllPages({
      formId: "BD_Department",
      fieldKeys: departmentFields,
      filterString,
      orderString: "FNumber ASC",
    });

  const lookup = {};

  for (const row of rows) {
    const region =
      row[
        departmentFieldIndex[
          "FNumber"
        ]
      ] ?? "";

    const district =
      row[
        departmentFieldIndex[
          "F_RTA_Territory.FNumber"
        ]
      ] ?? "";

    const key =
      normalizeKey(region);

    if (key) {
      lookup[key] = district;
    }
  }

  return setCachedValue(
  cacheKey,
  lookup
);
}

/**
 * Fetch the current Kingdee Employee Master record for exactly one employee.
 *
 * This intentionally bypasses the existing 30-minute employee lookup cache.
 * It is used by authentication so a Department/Role change in Kingdee is
 * reflected on the employee's next login without extracting the full
 * Employee List.
 */
async function getEmployeeByEmployeeNo(
  employeeNo
) {
  const normalizedEmployeeNo =
    String(employeeNo ?? "").trim();

  if (!normalizedEmployeeNo) {
    return null;
  }

  const filterString =
    buildOrFilter(
      "FStaffNumber",
      [normalizedEmployeeNo]
    );

  if (!filterString) {
    return null;
  }

  const rows =
    await queryAllPages({
      formId: "BD_Empinfo",

      fieldKeys:
        employeeFields,

      filterString,

      orderString:
        "FStaffNumber ASC",
    });

  for (const row of rows) {
    const employee =
      mapEmployeeRow(row);

    if (
      normalizeKey(
        employee.salesNo
      ) ===
      normalizeKey(
        normalizedEmployeeNo
      )
    ) {
      return employee;
    }
  }

  return null;
}

async function getEmployeeLookup(
  salesNumbers
) {
  const normalizedSalesNumbers = [
  ...new Set(
    (salesNumbers || [])
      .map((value) =>
        normalizeKey(value)
      )
      .filter(Boolean)
  ),
];

const cacheKey =
  `EMPLOYEE_LOOKUP:${normalizedSalesNumbers
    .sort()
    .join("|")}`;

const cached =
  getCachedValue(cacheKey);

if (cached) {
  return cached;
}
  const uniqueSalesNumbers = [
    ...new Set(
      (salesNumbers || [])
        .map((value) =>
          String(value ?? "").trim()
        )
        .filter(Boolean)
    ),
  ];

  if (!uniqueSalesNumbers.length) {
    return {};
  }

  const lookup = {};

  const chunks =
    chunkArray(
      uniqueSalesNumbers,
      50
    );

  for (const chunk of chunks) {
    const filterString =
      buildOrFilter(
        "FStaffNumber",
        chunk
      );

    if (!filterString) {
      continue;
    }

    const rows =
      await queryAllPages({
        formId: "BD_Empinfo",

        fieldKeys:
          employeeFields,

        filterString,

        orderString:
          "FStaffNumber ASC",
      });

    for (const row of rows) {
      const employee =
        mapEmployeeRow(row);

      const key =
        normalizeKey(
          employee.salesNo
        );

      if (
        key &&
        !lookup[key]
      ) {
        lookup[key] =
          employee;
      }
    }
  }

  return setCachedValue(
  cacheKey,
  lookup
);
}
async function getSalesPriceLookup(
  materialCodes
) {
  const normalizedMaterialCodes = [
  ...new Set(
    (materialCodes || [])
      .map((value) =>
        normalizeKey(value)
      )
      .filter(Boolean)
  ),
];

const cacheKey =
  `SALES_PRICE_LOOKUP:${normalizedMaterialCodes
    .sort()
    .join("|")}`;

const cached =
  getCachedValue(cacheKey);

if (cached) {
  return cached;
}
  const materialFilter =
    buildOrFilter(
      "FMaterialId.FNumber",
      materialCodes
    );

  if (!materialFilter) {
    return {};
  }

  const filterString =
    `(` +
    `FNumber = '${primarySalesPriceList}' ` +
    `OR FNumber = '${fallbackSalesPriceList}'` +
    `) AND ${materialFilter}`;

  const rows =
    await queryAllPages({
      formId: "BD_SAL_PriceList",
      fieldKeys: salesPriceFields,
      filterString,

      orderString:
        "FNumber ASC," +
        "FMaterialId.FNumber ASC," +
        "FEntryEffectiveDate ASC",
    });

  const lookup = {};

  for (const row of rows) {
    const record =
      mapSalesPriceRow(row);

    const materialKey =
      normalizeKey(
        record.materialCode
      );

    const priceListKey =
      normalizeKey(
        record.priceListNumber
      );

    if (
      !materialKey ||
      !priceListKey
    ) {
      continue;
    }

    lookup[materialKey] ??= {};

    lookup[materialKey][
      priceListKey
    ] ??= [];

    lookup[materialKey][
      priceListKey
    ].push(record);
  }

  return setCachedValue(
  cacheKey,
  lookup
);
}

function findApplicableSalesPrice(
  salesPriceLookup,
  materialCode,
  salesTime
) {
  if (
    !materialCode ||
    !salesTime
  ) {
    return "";
  }

  const materialKey =
    normalizeKey(materialCode);

  const salesDate =
    new Date(salesTime);

  if (
    !materialKey ||
    Number.isNaN(
      salesDate.getTime()
    )
  ) {
    return "";
  }

  const materialPrices =
    salesPriceLookup[
      materialKey
    ];

  if (!materialPrices) {
    return "";
  }

  const findFromList =
    (priceListNumber) => {
      const rows =
        materialPrices[
          normalizeKey(
            priceListNumber
          )
        ] || [];

      let applicablePrice = "";
      let latestTime = -Infinity;

      for (const row of rows) {
        const effectiveTime =
          new Date(
            row.effectiveDate
          ).getTime();

        if (
          Number.isNaN(
            effectiveTime
          ) ||
          effectiveTime >
            salesDate.getTime()
        ) {
          continue;
        }

        if (
          effectiveTime >=
          latestTime
        ) {
          latestTime =
            effectiveTime;

          applicablePrice =
            row.price;
        }
      }

      return applicablePrice;
    };

  const primaryPrice =
    findFromList(
      primarySalesPriceList
    );

  if (primaryPrice !== "") {
    return primaryPrice;
  }

  return findFromList(
    fallbackSalesPriceList
  );
}
async function enrichSerialRecords(
  serialRecords
) {
  if (!serialRecords.length) {
    return [];
  }

  // Keep Serial Main File as the complete reusable
  // source. Shared business dimensions are enriched
  // through one common engine; sales-only fields are
  // added below.
  const commonRecords =
    await enrichCommonRecords(
      serialRecords,
      {
        labelPrefix:
          "Serial Main File",
      }
    );

  const salesNumbers = [
    ...new Set(
      commonRecords
        .map(
          (record) =>
            record.salesNo
        )
        .filter(Boolean)
    ),
  ];

  const materialCodes = [
    ...new Set(
      commonRecords
        .map(
          (record) =>
            record.materialCode
        )
        .filter(Boolean)
    ),
  ];

  const [
    employeeLookup,
    salesPriceLookup,
  ] = await Promise.all([
    timedQuery(
      "Serial Main File Employee Lookup",
      () =>
        getEmployeeLookup(
          salesNumbers
        )
    ),

    timedQuery(
      "Serial Main File Sales Price Lookup",
      () =>
        getSalesPriceLookup(
          materialCodes
        )
    ),
  ]);

  // Capture today's calendar date once for the entire enrichment run.
  // This keeps Sales Workday consistent across all rows.
  const reportTodayCalendar = getCalendarDate(new Date());

  return commonRecords.map(
    (serialRecord) => {
      const employee =
        employeeLookup[
          normalizeKey(
            serialRecord.salesNo
          )
        ] || null;

      const salesAmount =
        serialRecord
          .stockStatusCode === "3"
          ? findApplicableSalesPrice(
              salesPriceLookup,
              serialRecord.materialCode,
              serialRecord.salesTime
            )
          : "";

      const salesWorkday = (() => {
        // Employee Hire Date / Sales LWD are calendar dates.
        // Parse them without UTC conversion so a value such as
        // 2020-07-02T00:00:00 remains July 2.
        const hiredDate =
          getCalendarDate(
            employee?.hiredDate
          );

        if (!hiredDate) {
          return "";
        }

        // Use the current calendar date consistently for every
        // record in the same enrichment run. This prevents records
        // processed around midnight from receiving different
        // Sales Workday values.
        const endDate =
          employee?.salesLwd
            ? getCalendarDate(
                employee.salesLwd
              )
            : reportTodayCalendar;

        if (!endDate) {
          return "";
        }

        const diffMs =
          endDate.getTime() -
          hiredDate.getTime();

        return Math.max(
          Math.floor(
            diffMs /
              (
                1000 *
                60 *
                60 *
                24
              )
          ),
          0
        );
      })();

      return {
        serialNumber:
          serialRecord.serialNumber ?? "",

        materialCode:
          serialRecord.materialCode ?? "",

        materialName:
          serialRecord.materialName ?? "",

        materialGroup:
          serialRecord.materialGroup ?? "",

        model:
          serialRecord.model ?? "",

        color:
          serialRecord.color ?? "",

        category:
          serialRecord.category ?? "",

        brand:
          serialRecord.brand ?? "",

        salesAmount,

        organizationCode:
          serialRecord.organizationCode ?? "",

        organizationName:
          serialRecord.organizationName ?? "",

        stockStatusCode:
          serialRecord.stockStatusCode ?? "",

        stockStatus:
          serialRecord.stockStatus ?? "",

        supplier:
          serialRecord.supplier ?? "",

        productionDept:
          serialRecord.productionDept ?? "",

        warehouseCode:
          serialRecord.warehouseCode ?? "",

        warehouse:
          serialRecord.warehouse ?? "",

        mallName:
          serialRecord.mallName ?? "",

        storeType:
          serialRecord.storeType ?? "",

        district:
          serialRecord.district ?? "",

        region:
          serialRecord.region ?? "",

        subRegion:
          serialRecord.subRegion ?? "",

        customerCode:
          serialRecord.customerCode ?? "",

        customer:
          serialRecord.customer ?? "",

        customerShortName:
          serialRecord.customerShortName ?? "",

        customerRegion:
          serialRecord.customerRegion ?? "",

        customerDistrict:
          serialRecord.customerDistrict ?? "",

        customerGroup:
          serialRecord.customerGroup ?? "",

        salesTime:
          serialRecord.salesTime ?? "",

        resignTime:
          serialRecord.resignTime ?? "",

        salesNo:
          serialRecord.salesNo ?? "",

        sales:
          serialRecord.sales ?? "",

        role:
          employee?.role ?? "",

        hiredDate:
          employee?.hiredDate ?? "",

        salesLwd:
          employee?.salesLwd ?? "",

        salesWorkday,

        typeOfSeller:
          serialRecord.typeOfSeller ?? "",

        monthOfIncentive:
          serialRecord.monthOfIncentive ?? "",

        incentiveStatus:
          serialRecord.incentiveStatus ?? "",
      };
    }
  );
}
async function enrichInventoryRecords(
  serialRecords
) {
  // Legacy On-hand Serial Main File path retained for
  // future use. It now shares the same core enrichment
  // rules as Sell-out and STK_Inventory.
  return enrichCommonRecords(
    serialRecords,
    {
      labelPrefix:
        "Legacy On-hand Serial",
    }
  );
}

function normalizeDashboardFilterText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getDashboardDisplayModel(row) {
  return String(
    row?.displayModel ||
    row?.model ||
    row?.materialName ||
    row?.materialCode ||
    ""
  ).trim();
}

function getDashboardDisplayColor(row) {
  return String(
    row?.displayColor ||
    row?.color ||
    "No Color"
  ).trim();
}

function matchesDashboardExportFilter(
  row,
  filterType,
  filterValue
) {
  const type =
    String(filterType || "").trim();

  const value =
    normalizeDashboardFilterText(
      filterValue
    );

  if (!type || !value) {
    return true;
  }

  const equals = (candidate) =>
    normalizeDashboardFilterText(
      candidate
    ) === value;

  const includes = (candidate) =>
    normalizeDashboardFilterText(
      candidate
    ).includes(value);

  switch (type) {
    case "district":
      return equals(row?.district);
    case "region":
      return equals(row?.region);
    case "subRegion":
      return equals(row?.subRegion);
    case "store":
      return (
        equals(row?.warehouseCode) ||
        equals(row?.warehouse) ||
        includes(row?.warehouse)
      );
    case "promoter":
      return (
        equals(row?.salesNo) ||
        equals(row?.sales) ||
        includes(row?.sales)
      );
    case "model":
      return equals(
        getDashboardDisplayModel(row)
      );
    case "color":
      return equals(
        getDashboardDisplayColor(row)
      );
    case "material":
      return (
        equals(row?.materialCode) ||
        equals(row?.materialName) ||
        includes(row?.materialName)
      );
    case "category":
      return equals(row?.category);
    case "brand":
      return equals(row?.brand);
    default:
      return true;
  }
}

function filterDashboardExportRows(
  rows,
  filterType,
  filterValue
) {
  return (rows || []).filter(
    (row) =>
      matchesDashboardExportFilter(
        row,
        filterType,
        filterValue
      )
  );
}

export const kingdeeService = {
  getConfigStatus() {
    return {
      baseUrl:
        kingdeeClient.baseUrl,

      erpAccountConfigured:
        Boolean(
          kingdeeClient.erpAccount
        ),

      usernameConfigured:
        Boolean(
          kingdeeClient.username
        ),
    };
  },

  async login() {
    return kingdeeClient.login();
  },

  async getEmployeeByEmployeeNo(
    employeeNo
  ) {
    return getEmployeeByEmployeeNo(
      employeeNo
    );
  },

  async getMaterialData(
    materialCode = ""
  ) {
    const filterString =
      materialCode
        ? `FNumber = '${escapeKingdeeValue(
            materialCode
          )}'`
        : "";

    const rows =
      await kingdeeClient
        .executeBillQuery({
          formId: "BD_MATERIAL",
          fieldKeys: materialFields,
          filterString,
          orderString:
            "FNumber ASC",
          startRow: 0,
          limit:
            materialCode
              ? 1
              : 500,
        });

    return rows.map(
      mapMaterialRow
    );
  },
  getSerialSyncLogs({
  limit = 20,
} = {}) {
  return getSyncLogs({
    limit,
  });
},
getLatestSerialSyncLog() {
  return getLatestSyncLog();
},
getSerialSyncState() {
  return {
    running: serialSyncRunning,
    startedAt: serialSyncStartedAt,
  };
},
async getSerialData({
  fromDate = "",
  toDate = "",
  page = 1,
  limit = 100,
  saveToLocal = true,
} = {}) {
  const totalStart =
    performance.now();

  const startRow =
    (page - 1) * limit;

  const fetchLimit =
    limit + 1;

  const filters = [
    "FOrgId.FNumber = '110'",
  ];

  if (fromDate) {
    filters.push(
      `F_RTA_SaleDateTime >= '${escapeKingdeeValue(
        fromDate
      )}'`
    );
  }

  if (toDate) {
    const exclusiveToDate =
      toExclusiveEndDate(
        toDate
      );

    filters.push(
      `F_RTA_SaleDateTime < '${escapeKingdeeValue(
        exclusiveToDate
      )}'`
    );
  }

  const filterString =
    filters.join(" AND ");

  const rows =
    await timedQuery(
      "Serial Main File",
      () =>
        kingdeeClient
          .executeBillQuery({
            formId:
              "BD_SerialMainFile",

            fieldKeys:
              serialFields,

            filterString,

            orderString:
             "F_RTA_SaleDateTime DESC, FNumber ASC, FOrgId.FNumber ASC",

            startRow,

            limit: fetchLimit,
          })
    );

  const mappedRows =
    rows.map(mapSerialRow);

  const fromDateTime =
    fromDate
      ? new Date(fromDate).getTime()
      : -Infinity;

  const filteredRows =
    mappedRows.filter((record) => {
      // Sell-out eligibility is based on the Stock Status value,
      // not the underlying Kingdee Stock Status code.
      if (
        String(record.stockStatus || "").trim() !==
        "Warehouse Delivery"
      ) {
        return false;
      }

      if (!fromDate) {
        return true;
      }

      const salesTime =
        new Date(
          record.salesTime
        ).getTime();

      return (
        !Number.isNaN(salesTime) &&
        salesTime >= fromDateTime
      );
    });

  // Pagination is based on the Kingdee source rows because the
  // Stock Status filter is intentionally applied by the returned
  // Stock Status value rather than the Stock Status code.
  const hasMore =
    rows.length > limit;

  const pageRows =
    filteredRows.slice(
      0,
      limit
    );

  const result =
    await enrichSerialRecords(
      pageRows
    );

  let savedCount = 0;

  if (saveToLocal) {
    savedCount =
      upsertSerialRecords(
        result
      );

    console.log(
      `[DATABASE] Saved ${savedCount} enriched serial records`
    );
  }

  console.log(
    `[PERFORMANCE] TOTAL serial-data: ${(
      performance.now() -
      totalStart
    ).toFixed(0)} ms`
  );

  return {
    rows: result,
    hasMore,
    savedCount,
  };
},
async getOnHandSerialData({
  page = 1,
  limit = 500,
  saveToLocal = true,
} = {}) {
  const totalStart =
    performance.now();

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

  const startRow =
    (parsedPage - 1) *
    parsedLimit;

  const fetchLimit =
    parsedLimit + 1;

  const filterString = [
    "FOrgId.FNumber = '110'",
    "FStockStatus = '1'",
  ].join(" AND ");

  const rows =
    await timedQuery(
      "On-hand Serial Main File",
      () =>
        kingdeeClient
          .executeBillQuery({
            formId:
              "BD_SerialMainFile",

            fieldKeys:
              serialFields,

            filterString,

            orderString:
              "FNumber ASC, FOrgId.FNumber ASC",

            startRow,

            limit:
              fetchLimit,
          })
    );

  const mappedRows =
    rows.map(
      mapSerialRow
    );

  const hasMore =
    mappedRows.length >
    parsedLimit;

  const pageRows =
    mappedRows.slice(
      0,
      parsedLimit
    );

  const result =
  await enrichInventoryRecords(
    pageRows
     );

  // IMPORTANT:
  // On-hand serial records must not be written into serial_main_file.
  // serial_main_file is the historical Serial Main File / Sell-out source.
  // Saving an On-hand record here can overwrite an existing
  // FStockStatus = '3' Warehouse Delivery record that shares the same
  // serial_number + organization_code primary key.
  //
  // Current inventory is handled separately by the Inventory flow.
  let savedCount = 0;

  if (saveToLocal) {
    console.log(
      "[DATABASE] Skipped saving On-hand serial records to serial_main_file"
    );
  }

  console.log(
    `[PERFORMANCE] TOTAL on-hand serial-data: ${(
      performance.now() -
      totalStart
    ).toFixed(0)} ms`
  );

  return {
    rows: result,
    hasMore,
    savedCount,
  };
},
async syncAllOnHandSerialData({
  limit = 500,
} = {}) {
  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(limit, 10) || 100,
      1
    ),
    500
  );

  let page = 1;
  let totalFetched = 0;
  let totalSaved = 0;
  let hasMore = true;

  const seenKeys = new Set();
  const duplicateKeys = [];

  while (hasMore) {
    const result =
      await this.getOnHandSerialData({
        page,
        limit: parsedLimit,
        saveToLocal: false,
      });

    totalFetched +=
      result.rows.length;

    const uniquePageRows = [];

    for (const record of result.rows) {
      const key =
        `${record.serialNumber}::${record.organizationCode}`;

      if (seenKeys.has(key)) {
        duplicateKeys.push({
          serialNumber:
            record.serialNumber,
          organizationCode:
            record.organizationCode,
          page,
        });

        continue;
      }

      seenKeys.add(key);
      uniquePageRows.push(record);
    }

    // Read-only inventory sync:
    // do not upsert On-hand status records into serial_main_file.
    const savedThisPage = 0;

    totalSaved +=
      savedThisPage;

    console.log(
      `[INVENTORY SYNC] Page ${page} | Fetched ${result.rows.length} | Unique ${uniquePageRows.length} | Saved 0 (read-only)`
    );

    hasMore =
      result.hasMore === true;

    if (hasMore) {
      page += 1;
    }
  }

  console.log(
    `[INVENTORY SYNC] Complete | Pages ${page} | Fetched ${totalFetched} | Saved ${totalSaved}`
  );

  return {
    totalFetched,
    totalSaved,
    uniqueRecords:
      seenKeys.size,
    duplicateCount:
      duplicateKeys.length,
    duplicateKeys,
    pagesProcessed:
      page,
    limit:
      parsedLimit,
  };
},
 async syncCurrentInventorySnapshot({ limit = 500 } = {}) {
  const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 500, 1), 500);
  const syncType = "inventory-sync";
  const syncLogId = createSyncLog({ syncType });
  const startedAt = new Date().toISOString();
  let page = 1;
  let hasMore = true;
  let totalFetched = 0;
  const allRows = [];
  const seenKeys = new Set();
  const duplicateKeys = [];

  try {
    while (hasMore) {
      const result = await timedQuery(
        "Inventory Snapshot STK_Inventory",
        () => kingdeeClient.executeBillQuery({
          formId: "STK_Inventory",
          fieldKeys: inventoryFields,
          filterString: "FStockOrgId.FNumber = '110' AND FBaseQty > 0",
          orderString: "FStockId.FNumber ASC, FMaterialId.FNumber ASC",
          startRow: (page - 1) * parsedLimit,
          limit: parsedLimit + 1,
        })
      );

      const pageHasMore = result.length > parsedLimit;
      const pageRows = result.slice(0, parsedLimit).map(mapInventoryRow);
      const enrichedRows = await enrichInventorySummaryRows(pageRows);
      totalFetched += enrichedRows.length;

      for (const row of enrichedRows) {
        const key = `${normalizeKey(row?.warehouseCode)}::${normalizeKey(row?.materialCode)}`;
        if (seenKeys.has(key)) {
          duplicateKeys.push(key);
          continue;
        }
        seenKeys.add(key);
        allRows.push(row);
      }

      console.log(
        `[INVENTORY SYNC] Page ${page} | Fetched ${enrichedRows.length} | Unique ${seenKeys.size}`
      );

      hasMore = pageHasMore;
      if (hasMore) page += 1;
    }

    // Replace only after every Kingdee page completed successfully.
    // A failed/partial extraction therefore leaves the previous valid snapshot intact.
    const snapshotResult = replaceInventorySnapshot(allRows);
    const syncResult = {
      totalFetched,
      totalSaved: allRows.length,
      uniqueRecords: allRows.length,
      duplicateCount: duplicateKeys.length,
      pagesProcessed: page,
      limit: parsedLimit,
      snapshotUpdatedAt: snapshotResult.updatedAt,
    };

    completeSyncLog(syncLogId, syncResult);
    console.log(
      `[INVENTORY SYNC] Complete | Pages ${page} | Fetched ${totalFetched} | Snapshot ${allRows.length} | Updated ${snapshotResult.updatedAt}`
    );
    return syncResult;
  } catch (error) {
    failSyncLog(syncLogId, error);
    console.error(
      `[INVENTORY SYNC] Failed | Started ${startedAt} | Previous snapshot retained | ${error.message}`
    );
    throw error;
  }
},
 async syncAllSerialData({
  fromDate = "",
  toDate = "",
  limit = 100,
  syncType = "serial-sync-all",
} = {}) {
  if (serialSyncRunning) {
    return {
      skipped: true,
      reason: "Serial sync is already running.",
      startedAt: serialSyncStartedAt,
    };
  }

  serialSyncRunning = true;
  serialSyncStartedAt = new Date().toISOString();

  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(limit, 10) || 100,
      1
    ),
    500
  );

  const syncLogId = createSyncLog({
  syncType,
  fromDate,
  toDate,
});

  let page = 1;
  let totalFetched = 0;
  let totalSaved = 0;
  let hasMore = true;

  const seenKeys = new Set();
  const duplicateKeys = [];

  try {
    while (hasMore) {
      const result =
        await this.getSerialData({
          fromDate,
          toDate,
          page,
          limit: parsedLimit,
          saveToLocal: false,
        });

      totalFetched +=
        result.rows.length;

      const uniquePageRows = [];

      for (const record of result.rows) {
        const key =
          `${record.serialNumber}::${record.organizationCode}`;

        if (seenKeys.has(key)) {
          duplicateKeys.push({
            serialNumber:
              record.serialNumber,
            organizationCode:
              record.organizationCode,
            page,
          });

          continue;
        }

        seenKeys.add(key);
        uniquePageRows.push(record);
      }

      const savedThisPage =
        upsertSerialRecords(
          uniquePageRows
        );

      totalSaved +=
        savedThisPage;

      console.log(
        `[SYNC] Page ${page} | Fetched ${result.rows.length} | Unique ${uniquePageRows.length} | Saved ${savedThisPage}`
      );

      hasMore =
        result.hasMore === true;

      if (hasMore) {
        page += 1;
      }
    }

    // A completed full Warehouse Delivery sync becomes the local source of truth
    // for the Sell-out report. Reports do not call Kingdee directly.
    if (!fromDate && !toDate && syncType === "serial-sync-warehouse-delivery") {
      const snapshotRecords = [...seenKeys].map((key) => {
        const separator = key.lastIndexOf("::");
        return {
          serialNumber: key.slice(0, separator),
          organizationCode: key.slice(separator + 2),
        };
      });
      const snapshotResult = replaceLiveSellOutSerialSnapshot(snapshotRecords);
      console.log(
        `[SYNC] Live Sell-out snapshot replaced | Previous: ${snapshotResult.previousCount} | Current Warehouse Delivery: ${snapshotResult.currentCount} | Removed: ${snapshotResult.removedCount} | Added: ${snapshotResult.addedCount}`
      );
    }

    const syncResult = {
      totalFetched,
      totalSaved,
      totalUnchanged:
        Math.max(
          seenKeys.size - totalSaved,
          0
        ),
      uniqueRecords:
        seenKeys.size,
      duplicateCount:
        duplicateKeys.length,
      duplicateKeys,
      pagesProcessed:
        page,
      limit:
        parsedLimit,
    };

    completeSyncLog(
      syncLogId,
      syncResult
    );

    console.log(
      `[SYNC] Complete | Pages ${page} | Fetched ${totalFetched} | Unique ${seenKeys.size} | Saved ${totalSaved} | Duplicates ${duplicateKeys.length}`
    );

    return syncResult;
  } catch (error) {
    failSyncLog(
      syncLogId,
      error
    );

    throw error;
  } finally {
    serialSyncRunning = false;
    serialSyncStartedAt = null;
  }
},
async getCurrentLiveSellOutSerialNumbers({ fromDate = "", toDate = "", limit = 500 } = {}) {
  const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 500, 1), 500);
  const filters = ["FOrgId.FNumber = '110'", "FStockStatus = '3'"];
  if (fromDate) filters.push(`F_RTA_SaleDateTime >= '${escapeKingdeeValue(fromDate)}'`);
  if (toDate) filters.push(`F_RTA_SaleDateTime < '${escapeKingdeeValue(toExclusiveEndDate(toDate))}'`);
  const serialNumbers = new Set(); let page = 1; let hasMore = true;
  while (hasMore) {
    const rows = await kingdeeClient.executeBillQuery({ formId: "BD_SerialMainFile", fieldKeys: ["FNumber"], filterString: filters.join(" AND "), orderString: "F_RTA_SaleDateTime DESC, FNumber ASC, FOrgId.FNumber ASC", startRow: (page - 1) * parsedLimit, limit: parsedLimit + 1 });
    for (const row of rows.slice(0, parsedLimit)) { const serial = String(row?.[0] ?? "").trim(); if (serial) serialNumbers.add(serial); }
    hasMore = rows.length > parsedLimit; if (hasMore) page += 1;
  }
  console.log(`[LIVE SELLOUT] Current Warehouse Delivery serials: ${serialNumbers.size} | Pages ${page}`);
  return [...serialNumbers];
},
async reconcileSellOutWithCurrentOnHand({
  limit = 500,
} = {}) {
  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(limit, 10) || 500,
      1
    ),
    500
  );

  const onHandKeys = [];
  const seenKeys = new Set();
  let page = 1;
  let hasMore = true;
  let totalFetched = 0;

  // Complete read of current On-hand data is required before any local
  // deletion. If Kingdee fails part-way through, nothing is deleted.
  while (hasMore) {
    const result = await this.getOnHandSerialData({
      page,
      limit: parsedLimit,
    });

    totalFetched +=
      (result.rows || []).length;

    for (const record of result.rows || []) {
      const serialNumber =
        String(record.serialNumber || "").trim();
      const organizationCode =
        String(record.organizationCode || "").trim();

      if (!serialNumber || !organizationCode) {
        continue;
      }

      const key =
        `${serialNumber}::${organizationCode}`;

      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      onHandKeys.push({
        serialNumber,
        organizationCode,
      });
    }

    hasMore =
      result.hasMore === true;

    if (hasMore) {
      page += 1;
    }
  }

  console.log(
    `[RECONCILE] Current On-hand serials fetched ${totalFetched} | Unique ${onHandKeys.length} | Sell-out exclusion list prepared (historical SQLite records preserved)`
  );

  return {
    totalFetched,
    uniqueOnHand: onHandKeys.length,
    onHandSerialNumbers: onHandKeys.map(
      (item) => item.serialNumber
    ),
    pagesProcessed: page,
    limit: parsedLimit,
  };
},
async syncWarehouseDeliverySerialData({
  limit = 500,
} = {}) {
  const syncResult =
    await this.syncAllSerialData({
      fromDate: "",
      toDate: "",
      limit,
      syncType: "serial-sync-warehouse-delivery",
    });

  if (syncResult?.skipped) {
    return syncResult;
  }

  return syncResult;
},
async syncRecentSerialData({
  days = 1,
  limit = 100,
} = {}) {
    const parsedDays = Math.max(
      Number.parseInt(days, 10) || 1,
      1
    );

    const formatLocalDate = (date) => {
      const year =
        date.getFullYear();

      const month =
        String(
          date.getMonth() + 1
        ).padStart(2, "0");

      const day =
        String(
          date.getDate()
        ).padStart(2, "0");

      return `${year}-${month}-${day}`;
    };

    const from = new Date();

    from.setDate(
      from.getDate() -
        (parsedDays - 1)
    );

    const fromDate =
      formatLocalDate(from);

          return await this.syncAllSerialData({
        fromDate,
        toDate,
        limit,
        syncType:
          "serial-sync-recent",
      });
  },

  async getSerialDataFromLocal({
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

  const result = getSerialRecords({
    fromDate,
    toDate,
    organizationCode,
    region,
    district,
    warehouseCode,
    customerCode,
    materialCode,
    category,
    brand,
    salesNo,

    warehouse,
    customer,
    materialName,
    sales,
    search,

    page: parsedPage,
    limit: parsedLimit,
  });

  const rows = result.rows;
  const totalCount = result.totalCount;

  const totalPages =
    totalCount > 0
      ? Math.ceil(
          totalCount / parsedLimit
        )
      : 0;

  const hasMore =
    parsedPage < totalPages;

  return {
    page: parsedPage,
    limit: parsedLimit,
    totalCount,
    totalPages,
    rows,
    rowCount: rows.length,
    hasMore,
    nextPage:
      hasMore
        ? parsedPage + 1
        : null,
    previousPage:
      parsedPage > 1
        ? parsedPage - 1
        : null,
  };
},
  clearCache() {
    clearCache();

    return {
      status: "ok",
      message:
        "Kingdee service memory cache cleared.",
    };
  },
  async getInventoryData({
    page = 1,
    limit = 500,
    warehouseCode = "",
    fromDate = "",
    toDate = "",
  } = {}) {
    const totalStart = performance.now();
    const parsedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 500, 1), 500);

    // Inventory is served from the latest successful STK_Inventory snapshot.
    // User authorization/scope filtering remains in dashboardService and is
    // therefore applied per logged-in user after this shared snapshot is read.
    const snapshot = getInventorySnapshot();
    let rows = snapshot.rows || [];

    if (warehouseCode) {
      const normalizedWarehouse = normalizeKey(warehouseCode);
      rows = rows.filter(
        (row) => normalizeKey(row?.warehouseCode) === normalizedWarehouse
      );
    }

    const startRow = (parsedPage - 1) * parsedLimit;
    const pageRows = rows.slice(startRow, startRow + parsedLimit);
    const sellOutLookup = getSellOutSummaryLookup({ fromDate, toDate });

    const finalRows = pageRows.map((row) => {
      const key = `${normalizeKey(row.warehouseCode)}::${normalizeKey(row.materialCode)}`;
      const sellOut = sellOutLookup[key] || { sellOutQty: 0, salesAmount: 0 };
      return { ...row, sellOutQty: sellOut.sellOutQty, salesAmount: sellOut.salesAmount };
    });

    const hasMore = startRow + parsedLimit < rows.length;

    console.log(
      `[PERFORMANCE] TOTAL inventory-data (snapshot ${snapshot.updatedAt || "none"}): ${(performance.now() - totalStart).toFixed(0)} ms`
    );

    return {
      page: parsedPage,
      limit: parsedLimit,
      rowCount: finalRows.length,
      totalCount: rows.length,
      snapshotUpdatedAt: snapshot.updatedAt,
      hasMore,
      nextPage: hasMore ? parsedPage + 1 : null,
      rows: finalRows,
    };
  },

  async getAllInventoryDataForExport({
    warehouseCode = "",
    fromDate = "",
    toDate = "",
    activationFromDate = "",
    activationToDate = "",
    region = "",
    district = "",
    subRegion = "",
    salesNo = "",
    department = "",
    materialCode = "",
    category = "",
    brand = "",
  } = {}) {
    const currentInventoryRows = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result =
        await this.getInventoryData({
          page,
          limit: 500,
          warehouseCode,
          // Do not use the Sell-out values returned per inventory page
          // as the final comparison totals. We overlay one shared
          // Sell-out source below after collecting all current stock.
          fromDate: "",
          toDate: "",
        });

      currentInventoryRows.push(
        ...(result.rows || [])
      );

      hasMore =
        result.hasMore === true;

      if (hasMore) {
        page += 1;
      }
    }

    let sellOutRows =
      getSellOutInventoryRows({
        fromDate,
        toDate,
        activationFromDate,
        activationToDate,
        warehouseCode,
        region,
        district,
        subRegion,
        salesNo,
        materialCode,
        category,
        brand,
      });

    if (subRegion) {
      sellOutRows =
        sellOutRows.filter(
          (row) =>
            normalizeKey(
              row.subRegion
            ) ===
            normalizeKey(
              subRegion
            )
        );
    }

    if (salesNo) {
      sellOutRows =
        sellOutRows.filter(
          (row) =>
            normalizeKey(
              row.salesNo
            ) ===
            normalizeKey(
              salesNo
            )
        );
    }

    const selectedSalesDays =
      getSelectedSalesDays(
        fromDate,
        toDate
      );

    if (salesNo) {
      return [];
    }

    return mergeInventoryWithSellOutRows(
      currentInventoryRows,
      sellOutRows,
      {
        selectedSalesDays,
        region,
        district,
        subRegion,
        materialCode,
        category,
        brand,
      }
    );
  },

  async getAllSellOutDataForExport({
    fromDate = "",
    toDate = "",
    activationFromDate = "",
    activationToDate = "",
    warehouseCode = "",
    region = "",
    district = "",
    subRegion = "",
    salesNo = "",
    materialCode = "",
    category = "",
    brand = "",
  } = {}) {
    const allRows = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result =
        this.getSellOutDataFromLocal({
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
          page,
          limit: 500,
        });

      allRows.push(
        ...(result.rows || [])
      );

      hasMore =
        result.hasMore === true;

      if (hasMore) {
        page += 1;
      }
    }

    const filteredRows =
      allRows.filter(
        (row) => {
          if (
            subRegion &&
            normalizeKey(
              row.subRegion
            ) !==
              normalizeKey(
                subRegion
              )
          ) {
            return false;
          }

          if (
            salesNo &&
            normalizeKey(
              row.salesNo
            ) !==
              normalizeKey(
                salesNo
              )
          ) {
            return false;
          }

          return true;
        }
      );

    // Recalculate employee information for export instead of trusting
    // the persisted salesWorkday value in SQLite. The stored value can
    // be stale because it was calculated when the serial record was
    // previously enriched. Hire Date / Sales LWD come from the current
    // Kingdee Employee Master, and Sales Workday is recalculated from
    // the current calendar date for every exported row.
    const salesNumbers = [
      ...new Set(
        filteredRows
          .map((row) => row.salesNo)
          .filter(Boolean)
      ),
    ];

    if (!salesNumbers.length) {
      return filteredRows;
    }

    const employeeLookup =
      await getEmployeeLookup(
        salesNumbers
      );

    const reportTodayCalendar =
      getCalendarDate(new Date());

    return filteredRows.map(
      (row) => {
        const employee =
          employeeLookup[
            normalizeKey(
              row.salesNo
            )
          ] || null;

        const hiredDate =
          employee?.hiredDate ??
          row.hiredDate ??
          "";

        const salesLwd =
          employee?.salesLwd ??
          row.salesLwd ??
          "";

        const hiredCalendar =
          getCalendarDate(
            hiredDate
          );

        const endCalendar =
          salesLwd
            ? getCalendarDate(
                salesLwd
              )
            : reportTodayCalendar;

        let salesWorkday = "";

        if (
          hiredCalendar &&
          endCalendar
        ) {
          salesWorkday =
            Math.max(
              Math.floor(
                (endCalendar.getTime() -
                  hiredCalendar.getTime()) /
                  (1000 * 60 * 60 * 24)
              ),
              0
            );
        }

        return {
          ...row,
          role:
            employee?.role ??
            row.role ??
            "",
          hiredDate,
          salesLwd,
          salesWorkday,
        };
      }
    );
  },

  async buildInventorySellOutWorkbook({
    fromDate = "",
    toDate = "",
    activationFromDate = "",
    activationToDate = "",
    warehouseCode = "",
    region = "",
    district = "",
    subRegion = "",
    salesNo = "",
    filterType = "",
    filterValue = "",
    materialCode = "",
    category = "",
    brand = "",
    includeInventorySheet = true,
    department = "",
  } = {}) {
    let [
      inventoryRows,
      sellOutRows,
    ] = await Promise.all([
      this.getAllInventoryDataForExport({
        warehouseCode,
        fromDate,
        toDate,
        activationFromDate,
        activationToDate,
        region,
        district,
        subRegion,
        materialCode,
        category,
        brand,
      }),

      Promise.resolve(
        this.getAllSellOutDataForExport({
          fromDate,
          toDate,
          activationFromDate,
          activationToDate,
          warehouseCode,
          region,
          district,
          subRegion,
          salesNo,
          materialCode,
          category,
          brand,
        })
      ),
    ]);

    inventoryRows =
      filterDashboardExportRows(
        inventoryRows,
        filterType,
        filterValue
      );

    // Inventory visibility rule:
    // District = HQ must never be exposed in dashboard exports.
    // HQ.ECOMM remains visible.
    inventoryRows =
      inventoryRows.filter(
        (row) =>
          normalizeKey(row?.district) !== "HQ"
      );

    sellOutRows =
      filterDashboardExportRows(
        sellOutRows,
        filterType,
        filterValue
      );
const workbook =
      new ExcelJS.Workbook();

    workbook.creator =
      "Kingdee Data Platform";

    workbook.created =
      new Date();

    if (includeInventorySheet) {
          // ========================================
          // Inventory Sheet
          // ========================================

          const inventorySheet =
            workbook.addWorksheet(
              "Inventory"
            );

          inventorySheet.columns =
            inventoryExportColumns;

          for (
            const row of
            inventoryRows
          ) {
            inventorySheet.addRow({
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
              inventoryQty:
                Number(
                  row.inventoryQty
                ) || 0,
              sellOutQty:
                Number(
                  row.sellOutQty
                ) || 0,
              salesAmount:
                Number(
                  row.salesAmount
                ) || 0,

              averageDailySellOut:
                Number(
                  row.averageDailySellOut
                ) || 0,

              daysOfSupply:
                row.daysOfSupply ?? "N/A",
            });
          }

          styleReportWorksheet(
            inventorySheet,
            {
              integerColumns: [
                "inventoryQty",
                "sellOutQty",
              ],
              amountColumns: [
                "salesAmount",
                "averageDailySellOut",
              ],
            }
          );

          }



    // ========================================
    // Sell-out Sheet
    // ========================================

    const sellOutSheet =
      workbook.addWorksheet(
        "Sell-out"
      );

    sellOutSheet.columns =
      sellOutExportColumns;

    for (
      const row of
      sellOutRows
    ) {
      sellOutSheet.addRow({
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
        salesDate:
          toExcelDate(
            row.salesDate
          ),
        activationDate:
          toExcelDate(
            row.activationDate
          ),
        sellOutQty:
          Number(
            row.sellOutQty
          ) || 0,
        salesAmount:
          Number(
            row.salesAmount
          ) || 0,
        salesNo:
          row.salesNo ?? "",
        sales:
          row.sales ?? "",
        role:
          row.role ?? "",
        hiredDate:
          toExcelDate(
            row.hiredDate
          ),
        salesLwd:
          toExcelDate(
            row.salesLwd
          ),
        salesWorkday:
          Number(
            row.salesWorkday
          ) || 0,
      });
    }

    styleReportWorksheet(
      sellOutSheet,
      {
        dateColumns: [
          "salesDate",
          "activationDate",
          "hiredDate",
          "salesLwd",
        ],
        integerColumns: [
          "sellOutQty",
          "salesWorkday",
        ],
        amountColumns: [
          "salesAmount",
        ],
      }
    );

    const buffer =
      await workbook.xlsx
        .writeBuffer();

    return {
      buffer,
      inventoryRowCount:
        inventoryRows.length,
      sellOutRowCount:
        sellOutRows.length,
    };
  },

  async testInventoryData() {
  const rows =
    await kingdeeClient.executeBillQuery({
      formId: "STK_Inventory",

      fieldKeys:
        inventoryFields,

      filterString:
  "FStockOrgId.FNumber = '110' " +
  "AND FBaseQty > 0 " +
  "AND FStockId.FNumber = 'STR.008215'",

      orderString:
        "FStockId.FNumber ASC",

      startRow: 0,

      limit: 10,
    });

  const mappedRows =
    rows.map(
      mapInventoryRow
    );

  return enrichInventorySummaryRows(
    mappedRows
  );
},
getSellOutDataFromLocal({
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
} = {}) {
  const parsedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 500);
  const result = getSellOutReport({
    fromDate, toDate, activationFromDate, activationToDate, warehouseCode, region, district, materialCode, category, brand,
    page: parsedPage, limit: parsedLimit,
  });
  const totalPages = result.totalCount > 0 ? Math.ceil(result.totalCount / parsedLimit) : 0;
  const hasMore = parsedPage < totalPages;
  return {
    page: parsedPage, limit: parsedLimit, totalCount: result.totalCount, totalPages,
    rowCount: result.rows.length, hasMore,
    nextPage: hasMore ? parsedPage + 1 : null,
    previousPage: parsedPage > 1 ? parsedPage - 1 : null,
    rows: result.rows,
  };
},
getInventoryReportFromLocal({
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

  const result = getInventoryReport({
    fromDate,
    toDate,
    warehouseCode,
    region,
    district,
    materialCode,
    category,
    brand,
    page: parsedPage,
    limit: parsedLimit,
  });

  const totalPages =
    result.totalCount > 0
      ? Math.ceil(
          result.totalCount /
            parsedLimit
        )
      : 0;

  const hasMore =
    parsedPage < totalPages;

  return {
    page: parsedPage,
    limit: parsedLimit,
    totalCount:
      result.totalCount,
    totalPages,
    rowCount:
      result.rows.length,
    hasMore,
    nextPage:
      hasMore
        ? parsedPage + 1
        : null,
    previousPage:
      parsedPage > 1
        ? parsedPage - 1
        : null,
    rows:
      result.rows,
  };
},
async testOnHandSerialData() {
  return kingdeeClient.executeBillQuery({
    formId: "BD_SerialMainFile",

    fieldKeys: [
      "FNumber",
      "FMaterialID.FNumber",
      "FMaterialID.FName",
      "FStockId.FNumber",
      "FStockId.FName",
      "FStockId.F_RTA_MallName",
      "FStockId.F_PARV_StoreType",
      "FStockStatus",
    ],

    filterString:
    "FOrgId.FNumber = '110' AND FStockStatus = '1'",

    orderString:
      "FNumber ASC",

    startRow: 0,

    limit: 10,
  });
},
};
