import { kingdeeService } from "../services/kingdeeService.js";

export const kingdeeController = {
  configCheck(req, res) {
    const status =
      kingdeeService.getConfigStatus();

    res.json({
      status: "ok",
      message:
        "Kingdee configuration loaded successfully.",
      ...status,
    });
  },

  async login(req, res) {
    const session =
      await kingdeeService.login();

    res.json({
      status: "ok",
      message:
        "Kingdee login successful.",
      loginResultType:
        session.response.LoginResultType,
    });
  },

  async getMaterialData(req, res) {
    const materialCode =
      req.query.materialCode || "";

    const rows =
      await kingdeeService.getMaterialData(
        materialCode
      );

    res.json({
      status: "ok",
      rowCount: rows.length,
      rows,
    });
  },

  async getSerialData(req, res) {
    const {
      from,
      to,
      page,
      limit,
    } = req.query;

    if (!from) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "Query parameter 'from' is required.",
        });
    }

    const parsedPage =
      Math.max(
        Number.parseInt(
          page || "1",
          10
        ) || 1,
        1
      );

    const parsedLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit || "100",
            10
          ) || 100,
          1
        ),
        500
      );

    const result =
      await kingdeeService.getSerialData({
        fromDate: from,
        toDate: to || "",
        page: parsedPage,
        limit: parsedLimit,
      });

    const rows =
      result.rows || [];

    const hasMore =
      result.hasMore === true;

    res.json({
      status: "ok",
      source: "kingdee",
      page: parsedPage,
      limit: parsedLimit,
      rowCount: rows.length,
      savedCount:
        result.savedCount || 0,
      hasMore,
      nextPage:
        hasMore
          ? parsedPage + 1
          : null,
      previousPage:
        parsedPage > 1
          ? parsedPage - 1
          : null,
      rows,
    });
  },

  async getSerialDataLocal(req, res) {
  const {
    from,
    to,
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

    page,
    limit,
  } = req.query;

  if (!from) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "Query parameter 'from' is required.",
      });
  }

  const parsedPage =
    Math.max(
      Number.parseInt(
        page || "1",
        10
      ) || 1,
      1
    );

  const parsedLimit =
    Math.min(
      Math.max(
        Number.parseInt(
          limit || "100",
          10
        ) || 100,
        1
      ),
      500
    );

  const result =
    await kingdeeService
      .getSerialDataFromLocal({
        fromDate:
          from || "",

        toDate:
          to || "",

        organizationCode:
          organizationCode || "",

        region:
          region || "",

        district:
          district || "",

        warehouseCode:
          warehouseCode || "",

        customerCode:
          customerCode || "",

        materialCode:
          materialCode || "",

        category:
          category || "",

        brand:
          brand || "",

        salesNo:
          salesNo || "",

        warehouse:
          warehouse || "",

        customer:
          customer || "",

        materialName:
          materialName || "",

        sales:
          sales || "",
        search:
          search || "",

        page:
          parsedPage,

        limit:
          parsedLimit,
      });

  res.json({
    status: "ok",
    source: "sqlite",
    page: result.page,
    limit: result.limit,
    totalCount: result.totalCount,
    totalPages: result.totalPages,
    rowCount: result.rowCount,
    hasMore: result.hasMore,
    nextPage: result.nextPage,
    previousPage: result.previousPage,
    rows: result.rows,
  });
},

  async syncSerialData(req, res) {
    const {
      from,
      to,
      page,
      limit,
    } = req.query;

    if (!from) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "Query parameter 'from' is required.",
        });
    }

    const parsedPage =
      Math.max(
        Number.parseInt(
          page || "1",
          10
        ) || 1,
        1
      );

    const parsedLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit || "100",
            10
          ) || 100,
          1
        ),
        500
      );

    const result =
      await kingdeeService.getSerialData({
        fromDate: from,
        toDate: to || "",
        page: parsedPage,
        limit: parsedLimit,
      });

    const rows =
      result.rows || [];

    const hasMore =
      result.hasMore === true;

    res.json({
      status: "ok",
      source: "kingdee",
      action: "sync",
      page: parsedPage,
      limit: parsedLimit,
      fetchedCount:
        rows.length,
      savedCount:
        result.savedCount || 0,
      hasMore,
      nextPage:
        hasMore
          ? parsedPage + 1
          : null,
      previousPage:
        parsedPage > 1
          ? parsedPage - 1
          : null,
    });
  },

  async syncAllSerialData(
    req,
    res
  ) {
    // Accept both the original API parameters (from/to)
    // and the current dashboard refresh parameters (fromDate/toDate).
    // This keeps backward compatibility while allowing Refresh
    // to synchronize the exact selected date range.
    const {
      from: fromQuery,
      fromDate,
      to: toQuery,
      toDate,
      limit,
    } = req.query;

    const from =
      String(fromQuery || fromDate || "").trim();

    const to =
      String(toQuery || toDate || "").trim();

    if (!from) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "Query parameter 'from' or 'fromDate' is required.",
        });
    }

    const parsedLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit || "100",
            10
          ) || 100,
          1
        ),
        500
      );

    const result =
      await kingdeeService
        .syncAllSerialData({
          fromDate: from,
          toDate: to || "",
          limit: parsedLimit,
        });

    res.json({
      status: "ok",
      source: "kingdee",
      action: "sync-all",
      limit:
        result.limit,
      pagesProcessed:
        result.pagesProcessed,
      totalFetched:
        result.totalFetched,
      totalSaved:
        result.totalSaved,
      uniqueRecords:
        result.uniqueRecords,
      duplicateCount:
        result.duplicateCount,
      duplicateKeys:
        result.duplicateKeys,
    });
  },

  async testSalesPriceData(
    req,
    res
  ) {
    const rows =
      await kingdeeService
        .testSalesPriceData();

    res.json({
      status: "ok",
      rowCount:
        rows.length,
      rows,
    });
  },

  async testCustomerData(
    req,
    res
  ) {
    const rows =
      await kingdeeService
        .testCustomerData();

    res.json({
      status: "ok",
      rowCount:
        rows.length,
      rows,
    });
  },
  async syncRecentSerialData(req, res) {
  const {
    days,
    limit,
  } = req.query;

  const parsedDays = Math.max(
    Number.parseInt(
      days || "1",
      10
    ) || 1,
    1
  );

  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(
        limit || "100",
        10
      ) || 100,
      1
    ),
    500
  );

  const result =
    await kingdeeService
      .syncRecentSerialData({
        days: parsedDays,
        limit: parsedLimit,
      });

  res.json({
    status: "ok",
    source: "kingdee",
    action: "sync-recent",
    days: parsedDays,
    limit: result.limit,
    pagesProcessed:
      result.pagesProcessed,
    totalFetched:
      result.totalFetched,
    totalSaved:
      result.totalSaved,
    uniqueRecords:
      result.uniqueRecords,
    duplicateCount:
      result.duplicateCount,
    duplicateKeys:
      result.duplicateKeys,
  });
},
getLatestSerialSyncLog(req, res) {
  const log =
    kingdeeService.getLatestSerialSyncLog();

  res.json({
    status: "ok",
    source: "sqlite",
    syncLog: log || null,
  });
},
getSerialSyncHistory(req, res) {
  const {
    limit,
  } = req.query;

  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(
        limit || "20",
        10
      ) || 20,
      1
    ),
    100
  );

  const logs =
    kingdeeService.getSerialSyncLogs({
      limit: parsedLimit,
    });

  res.json({
    status: "ok",
    source: "sqlite",
    limit: parsedLimit,
    rowCount: logs.length,
    logs,
  });
},
getSerialSyncSummary(req, res) {
  const summary =
    kingdeeService.getSerialSyncSummary();

  res.json({
    status: "ok",
    source: "sqlite",
    localRecordCount:
      summary.localRecordCount,
    latestSync:
      summary.latestSync,
  });
},
getSerialSyncState(req, res) {
  const state =
    kingdeeService.getSerialSyncState();

  res.json({
    status: "ok",
    source: "memory",
    running: state.running,
    startedAt: state.startedAt,
  });
},
async testInventoryData(req, res) {
  const rows =
    await kingdeeService.testInventoryData();

  res.json({
    status: "ok",
    rowCount: rows.length,
    rows,
  });
},
getInventoryReportLocal(req, res) {
  const {
    from,
    to,
    warehouseCode,
    region,
    district,
    materialCode,
    category,
    brand,
    page,
    limit,
  } = req.query;

  const parsedPage = Math.max(
    Number.parseInt(
      page || "1",
      10
    ) || 1,
    1
  );

  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(
        limit || "100",
        10
      ) || 100,
      1
    ),
    500
  );

  const result =
    kingdeeService
      .getInventoryReportFromLocal({
        fromDate:
          from || "",

        toDate:
          to || "",

        warehouseCode:
          warehouseCode || "",

        region:
          region || "",

        district:
          district || "",

        materialCode:
          materialCode || "",

        category:
          category || "",

        brand:
          brand || "",

        page:
          parsedPage,

        limit:
          parsedLimit,
      });

  res.json({
    status: "ok",
    source: "sqlite",
    report: "inventory",
    page: result.page,
    limit: result.limit,
    totalCount:
      result.totalCount,
    totalPages:
      result.totalPages,
    rowCount:
      result.rowCount,
    hasMore:
      result.hasMore,
    nextPage:
      result.nextPage,
    previousPage:
      result.previousPage,
    rows:
      result.rows,
  });
},
async testOnHandSerialData(req, res) {
  const rows =
    await kingdeeService.testOnHandSerialData();

  res.json({
    status: "ok",
    rowCount: rows.length,
    rows,
  });
},
async getOnHandSerialData(req, res) {
  const {
    page,
    limit,
  } = req.query;

  const parsedPage = Math.max(
    Number.parseInt(
      page || "1",
      10
    ) || 1,
    1
  );

  const parsedLimit = Math.min(
    Math.max(
      Number.parseInt(
        limit || "100",
        10
      ) || 100,
      1
    ),
    500
  );

  const result =
    await kingdeeService.getOnHandSerialData({
      page: parsedPage,
      limit: parsedLimit,
      saveToLocal: true,
    });

  res.json({
    status: "ok",
    source: "kingdee",
    report: "inventory-source",
    page: parsedPage,
    limit: parsedLimit,
    rowCount:
      result.rows.length,
    savedCount:
      result.savedCount,
    hasMore:
      result.hasMore,
    nextPage:
      result.hasMore
        ? parsedPage + 1
        : null,
    rows:
      result.rows,
  });
},
async syncAllOnHandSerialData(req, res) {
  // Legacy serial On-hand sync is intentionally disabled.
  // Inventory remains sourced from STK_INVENTORY; Sell-out uses the
  // Warehouse Delivery SQLite snapshot refreshed by the serial sync job.
  res.json({
    status: "ok",
    source: "sqlite",
    action: "inventory-sync-all",
    disabled: true,
    message: "Legacy On-hand serial sync is disabled. Inventory uses STK_INVENTORY."
  });
},
async getSellOutData(req, res) {
  const { from, to, warehouseCode, region, district, materialCode, category, brand, page, limit } = req.query;
  if (!from) {
    return res.status(400).json({ status: "error", message: "Query parameter 'from' is required." });
  }
  // Sell-out reports are SQLite-only. The 15-minute Warehouse Delivery sync
  // refreshes sellout_live_serial; never fetch On-hand data while loading a report.
  const result = kingdeeService.getSellOutDataFromLocal({
    fromDate: from || "", toDate: to || "", warehouseCode: warehouseCode || "",
    region: region || "", district: district || "", materialCode: materialCode || "",
    category: category || "", brand: brand || "", page, limit,
  });
  res.json({ status: "ok", source: "sqlite", report: "sell-out", ...result });
},

async exportInventorySellOutReport(
  req,
  res
) {
  const {
    from,
    to,
    warehouseCode,
    region,
    district,
    materialCode,
    category,
    brand,
  } = req.query;

  if (!from) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "Query parameter 'from' is required.",
      });
  }

  const result =
    await kingdeeService
      .buildInventorySellOutWorkbook({
        fromDate:
          from || "",
        toDate:
          to || "",
        warehouseCode:
          warehouseCode || "",
        region:
          region || "",
        district:
          district || "",
        materialCode:
          materialCode || "",
        category:
          category || "",
        brand:
          brand || "",
      });

  const safeFrom =
    String(from)
      .replace(
        /[^0-9A-Za-z_-]/g,
        "-"
      );

  const safeTo =
    to
      ? String(to)
          .replace(
            /[^0-9A-Za-z_-]/g,
            "-"
          )
      : "latest";

  const filename =
    `Kingdee_Inventory_SellOut_${safeFrom}_to_${safeTo}.xlsx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );

  res.setHeader(
    "X-Inventory-Row-Count",
    String(
      result.inventoryRowCount
    )
  );

  res.setHeader(
    "X-SellOut-Row-Count",
    String(
      result.sellOutRowCount
    )
  );

  return res.send(
    Buffer.from(
      result.buffer
    )
  );
},

async getInventoryData(req, res) {
  const {
    page,
    limit,
    warehouseCode,
    from,
    to,
  } = req.query;

  const result =
    await kingdeeService.getInventoryData({
      page,
      limit,

      warehouseCode:
        warehouseCode || "",

      fromDate:
        from || "",

      toDate:
        to || "",
    });

  res.json({
    status: "ok",
    source: "kingdee",
    report: "inventory-source",
    ...result,
  });
},
};
