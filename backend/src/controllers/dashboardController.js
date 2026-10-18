import { dashboardService } from "../services/dashboardService.js";
import { kingdeeService } from "../services/kingdeeService.js";
import {
  getAuthorizedDashboardScope,
} from "../auth/dashboardAuthorization.js";
import { createExportTicket } from "../auth/exportTicket.js";

function queryBoolean(
  value,
  defaultValue = false
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  return [
    "1",
    "true",
    "yes",
    "on",
  ].includes(
    String(value)
      .trim()
      .toLowerCase()
  );
}


export const dashboardController = {
  async getSummary(req, res, next) {
    try {
      const result =
        await dashboardService.getSummary({
          fromDate:
            req.query.from || "",
          toDate:
            req.query.to || "",
          salesDateEnabled:
            queryBoolean(
              req.query.salesEnabled,
              true
            ),
          salesFromDate:
            req.query.salesFrom ||
            req.query.from ||
            "",
          salesToDate:
            req.query.salesTo ||
            req.query.to ||
            "",
          activationDateEnabled:
            queryBoolean(
              req.query.activationEnabled,
              false
            ),
          activationFromDate:
            req.query.activationFrom ||
            "",
          activationToDate:
            req.query.activationTo ||
            "",
          level:
            req.query.level ||
            "district",
          district:
            req.query.district ||
            "",
          region:
            req.query.region ||
            "",
          subRegion:
            req.query.subRegion ||
            "",
          warehouseCode:
            req.query.warehouseCode ||
            "",
          salesNo:
            req.query.salesNo ||
            "",
          filterType:
            req.query.filterType ||
            "",
          filterValue:
            req.query.filterValue ||
            "",
          authorizedScope:
            req.dashboardUser || null,
        });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async search(req, res, next) {
    try {
      const result =
        await dashboardService.search({
          query:
            req.query.q || "",
          fromDate:
            req.query.from || "",
          toDate:
            req.query.to || "",
          salesDateEnabled:
            queryBoolean(
              req.query.salesEnabled,
              true
            ),
          salesFromDate:
            req.query.salesFrom ||
            req.query.from ||
            "",
          salesToDate:
            req.query.salesTo ||
            req.query.to ||
            "",
          activationDateEnabled:
            queryBoolean(
              req.query.activationEnabled,
              false
            ),
          activationFromDate:
            req.query.activationFrom ||
            "",
          activationToDate:
            req.query.activationTo ||
            "",
          district:
            req.query.district || "",
          region:
            req.query.region || "",
          subRegion:
            req.query.subRegion || "",
          warehouseCode:
            req.query.warehouseCode || "",
          salesNo:
            req.query.salesNo || "",
          limit:
            req.query.limit || 25,
          authorizedScope:
            req.dashboardUser || null,
        });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Issues a one-time, short-lived export ticket so mobile WebViews
   * (DingTalk) can download the report via direct navigation.
   */
  async createExportTicket(req, res, next) {
    try {
      const ticket = createExportTicket(
        req.authenticatedIdentity,
        req.dashboardUser
      );

      return res.json({
        status: "ok",
        ticket,
        expiresIn: 120,
      });
    } catch (error) {
      return next(error);
    }
  },

  async exportReport(req, res, next) {
    try {
      const {
        from = "",
        to = "",
        salesEnabled = "",
        salesFrom = "",
        salesTo = "",
        activationEnabled = "",
        activationFrom = "",
        activationTo = "",
        district = "",
        region = "",
        subRegion = "",
        warehouseCode = "",
        salesNo = "",
        filterType = "",
        filterValue = "",
      } = req.query;

      const authorizedScope =
        getAuthorizedDashboardScope(
          req.dashboardUser || null,
          {
            level: "district",
            district,
            region,
            subRegion,
            warehouseCode,
            salesNo,
          }
        );

      const result =
        await kingdeeService
          .buildInventorySellOutWorkbook({
            fromDate:
              queryBoolean(
                salesEnabled,
                true
              )
                ? (
                    salesFrom ||
                    from ||
                    ""
                  )
                : "",
            toDate:
              queryBoolean(
                salesEnabled,
                true
              )
                ? (
                    salesTo ||
                    to ||
                    salesFrom ||
                    from ||
                    ""
                  )
                : "",
            activationFromDate:
              queryBoolean(
                activationEnabled,
                false
              )
                ? activationFrom
                : "",
            activationToDate:
              queryBoolean(
                activationEnabled,
                false
              )
                ? (
                    activationTo ||
                    activationFrom
                  )
                : "",
            district:
              authorizedScope.district || "",
            region:
              authorizedScope.region || "",
            subRegion:
              authorizedScope.subRegion || "",
            warehouseCode:
              authorizedScope.warehouseCode || "",
            salesNo:
              authorizedScope.salesNo || "",
            department:
              req.dashboardUser?.department || "",

            // Promoters export Sell-out only.
            // All non-Promoter departments export Inventory + Sell-out.
            includeInventorySheet:
              authorizedScope.role !== "PROMOTER",

            filterType,
            filterValue,
          });

      const scopeName =
        filterValue ||
        authorizedScope.salesNo ||
        authorizedScope.warehouseCode ||
        authorizedScope.subRegion ||
        authorizedScope.region ||
        authorizedScope.district ||
        "All_Areas";

      const safeScope =
        String(scopeName).replace(
          /[^0-9A-Za-z._-]/g,
          "-"
        );

      const filenameFrom =
        salesFrom ||
        from ||
        activationFrom ||
        "All-Dates";

      const filenameTo =
        salesTo ||
        to ||
        activationTo ||
        activationFrom ||
        filenameFrom;

      const safeFrom =
        String(filenameFrom).replace(
          /[^0-9A-Za-z_-]/g,
          "-"
        );

      const safeTo =
        String(filenameTo).replace(
          /[^0-9A-Za-z_-]/g,
          "-"
        );

      const filename =
        `EKSBASE_Report_${safeScope}_${safeFrom}_to_${safeTo}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      res.end(result.buffer);
    } catch (error) {
      next(error);
    }
  },
};
