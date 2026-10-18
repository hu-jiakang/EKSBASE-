import { kingdeeService } from "../services/kingdeeService.js";

let intervalHandle = null;

export function startSerialSyncJob({
  intervalMinutes = 15,
  limit = 500,
} = {}) {
  const parsedIntervalMinutes = Math.max(
    Number.parseInt(intervalMinutes, 10) || 30,
    1
  );

  const intervalMs =
    parsedIntervalMinutes *
    60 *
    1000;

  const runSync = async () => {
    try {
      const state =
        kingdeeService.getSerialSyncState();

      if (state.running) {
        console.log(
          "[SYNC JOB] Skipped because a serial sync is already running."
        );

        return;
      }

      console.log(
        "[SYNC JOB] Starting automatic Inventory + Warehouse Delivery serial sync..."
      );

      // Run sequentially to avoid sending two large Kingdee bill queries
      // at the same moment. Both datasets refresh on the same 15-minute cadence.
      try {
        const inventoryResult =
          await kingdeeService.syncCurrentInventorySnapshot({ limit });

        console.log(
          `[SYNC JOB] Inventory complete | Fetched ${inventoryResult.totalFetched} | Snapshot ${inventoryResult.totalSaved}`
        );
      } catch (error) {
        // Inventory failure must not prevent the Sell-out snapshot from refreshing.
        console.error(
          "[SYNC JOB] Inventory sync failed; continuing with Sell-out sync:",
          error
        );
      }

      try {
        const result =
          await kingdeeService.syncWarehouseDeliverySerialData({ limit });

        if (result?.skipped) {
          console.log(`[SYNC JOB] Sell-out skipped: ${result.reason}`);
          return;
        }

        console.log(
          `[SYNC JOB] Sell-out complete | Fetched ${result.totalFetched} | Saved ${result.totalSaved}`
        );
      } catch (error) {
        console.error(
          "[SYNC JOB] Sell-out sync failed:",
          error
        );
      }
    } catch (error) {
      console.error(
        "[SYNC JOB] Automatic serial sync failed:",
        error
      );
    }
  };

  if (intervalHandle) {
    clearInterval(intervalHandle);
  }

  intervalHandle =
    setInterval(
      runSync,
      intervalMs
    );

  console.log(
    `[SYNC JOB] Inventory + Sell-out sync scheduled every ${parsedIntervalMinutes} minute(s) | Inventory: STK_Inventory | Sell-out: Warehouse Delivery | Org 110`
  );

  // Run once at startup so a fresh instance does not wait 15 minutes
  // before the local Inventory and Sell-out snapshots are populated/refreshed.
  void runSync();

  return {
    intervalMinutes:
      parsedIntervalMinutes,
  };
}

export function stopSerialSyncJob() {
  if (!intervalHandle) {
    return false;
  }

  clearInterval(intervalHandle);
  intervalHandle = null;

  console.log(
    "[SYNC JOB] Serial sync scheduler stopped."
  );

  return true;
}
