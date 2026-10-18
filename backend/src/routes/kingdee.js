import { Router } from "express";
import { kingdeeController } from "../controllers/kingdeeController.js";

const router = Router();

router.get("/config-check", kingdeeController.configCheck);
router.post("/login", kingdeeController.login);
router.get(
  "/material-data",
  kingdeeController.getMaterialData
);
router.get(
  "/serial-data",
  kingdeeController.getSerialData
);
router.get(
  "/serial-data-sync",
  kingdeeController.syncSerialData
);
router.get(
  "/serial-data-sync-all",
  kingdeeController.syncAllSerialData
);
router.get(
  "/serial-data-sync-recent",
  kingdeeController.syncRecentSerialData
);
router.get(
  "/serial-data-sync-status",
  kingdeeController.getLatestSerialSyncLog
);
router.get(
  "/serial-data-sync-history",
  kingdeeController.getSerialSyncHistory
);
router.get(
  "/serial-data-sync-summary",
  kingdeeController.getSerialSyncSummary
);
router.get(
  "/serial-data-sync-state",
  kingdeeController.getSerialSyncState
);
router.get(
  "/inventory-report-local",
  kingdeeController.getInventoryReportLocal
);
router.get(
  "/onhand-serial-data",
  kingdeeController.getOnHandSerialData
);
router.get(
  "/inventory-sync-all",
  kingdeeController.syncAllOnHandSerialData
);
router.get(
  "/serial-data-local",
  kingdeeController.getSerialDataLocal
);
router.get(
  "/test-sales-price",
  kingdeeController.testSalesPriceData
);
router.get(
  "/test-customer",
  kingdeeController.testCustomerData
);
router.get(
  "/test-inventory",
  kingdeeController.testInventoryData
);
router.get(
  "/test-onhand-serial",
  kingdeeController.testOnHandSerialData
);
router.get(
  "/inventory-data",
  kingdeeController.getInventoryData
);
router.get(
  "/sell-out-data",
  kingdeeController.getSellOutData
);
router.get(
  "/inventory-sellout-export",
  kingdeeController.exportInventorySellOutReport
);

export default router;
