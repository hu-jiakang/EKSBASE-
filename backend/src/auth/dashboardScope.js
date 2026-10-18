/*
 * EKSBASE server-side dashboard authorization scope.
 *
 * Provider-neutral.
 *
 * Authentication identifies the employee.
 * This module decides what that employee can access.
 *
 * Authorization rule:
 * - Role = PROMOTER -> Employee No. is the authorization key.
 * - Role != PROMOTER -> Department is the authorization key.
 * - Warehouse Code is never used for Promoter authorization.
 * - Organization 110 is mandatory.
 */

export function getDashboardScope(user) {
  if (!user) {
    throw new Error(
      "Authenticated dashboard user is required."
    );
  }

  const role =
    String(user.role || "STAFF")
      .trim()
      .toUpperCase();

  const department =
    String(
      user.department ||
      user.accessLevel ||
      ""
    )
      .trim()
      .toUpperCase();

  const employeeNo =
    String(user.employeeNo || "").trim();

  if (!employeeNo) {
    throw new Error(
      "Authenticated user is missing employeeNo."
    );
  }

  const conditions = [
    "organization_code = '110'",
  ];

  const params = [];

  /*
   * PROMOTER:
   * Employee No. is the authorization key.
   * Warehouse Code / Department are NOT used.
   */
  if (role === "PROMOTER") {
    conditions.push("sales_no = ?");
    params.push(employeeNo);

    return {
      scopeType: "PROMOTER_EMPLOYEE",
      employeeNo,
      department,
      conditions,
      params,
    };
  }

  /*
   * NON-PROMOTER:
   * Department is the authorization key.
   *
   * The current dashboard department values map directly
   * to the existing dashboard scope fields.
   */
  switch (department) {
    case "ALL":
    case "ADMIN":
    case "HQ":
      break;

    case "DISTRICT":
      if (!user.district) {
        throw new Error(
          "DISTRICT department requires district."
        );
      }

      conditions.push("district = ?");
      params.push(user.district);
      break;

    case "REGION":
      if (!user.region) {
        throw new Error(
          "REGION department requires region."
        );
      }

      conditions.push("region = ?");
      params.push(user.region);
      break;

    case "SUB_REGION":
      if (!user.subRegion) {
        throw new Error(
          "SUB_REGION department requires subRegion."
        );
      }

      conditions.push("sub_region = ?");
      params.push(user.subRegion);
      break;

    case "STORE":
      if (!user.warehouseCode) {
        throw new Error(
          "STORE department requires warehouseCode."
        );
      }

      conditions.push("warehouse_code = ?");
      params.push(user.warehouseCode);
      break;

    default:
      throw new Error(
        `No dashboard access configured for department: ${department}`
      );
  }

  return {
    scopeType: department,
    employeeNo,
    department,
    conditions,
    params,
  };
}
