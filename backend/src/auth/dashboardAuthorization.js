/*
 * EKSBASE Dashboard Authorization Adapter
 *
 * IMPORTANT:
 * - Query-string scope values are never trusted for an authenticated user.
 * - Role = PROMOTER -> Employee No. / Sales No.
 * - Role != PROMOTER -> Department.
 * - PROMOTER is NOT scoped by Warehouse Code.
 * - Organization 110 is mandatory.
 */

const DEPARTMENTS = new Set([
  "ALL",
  "ADMIN",
  "DISTRICT",
  "REGION",
  "SUB_REGION",
]);

const NAVIGATION_LEVELS = [
  "district",
  "region",
  "subRegion",
  "store",
  "promoter",
];

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

const ROLE_ACCESS_LEVELS = {
  ADMIN: "HQ",
  CSH: "HQ",
  RSD: "DISTRICT",
  LA: "DISTRICT",
  DRH: "DISTRICT",
  RAM: "REGION",
  RRM: "REGION",
  RTM: "REGION",
  RSH: "REGION",
  KAM: "SUB_REGION",
  SLA: "SUB_REGION",
  SS: "SUB_REGION",
  ASM: "SUB_REGION",
};

const ALLOWED_ROLE_CODES = new Set([
  ...Object.keys(ROLE_ACCESS_LEVELS),
  "PROMOTER",
]);

function normalizeRequestedLevel(value, fallback = "district") {
  const level = clean(value);
  return NAVIGATION_LEVELS.includes(level) ? level : fallback;
}

function levelIndex(level) {
  return NAVIGATION_LEVELS.indexOf(level);
}

function enforceMinimumLevel(requestedLevel, minimumLevel) {
  const requested = normalizeRequestedLevel(
    requestedLevel,
    minimumLevel
  );

  return levelIndex(requested) < levelIndex(minimumLevel)
    ? minimumLevel
    : requested;
}

function buildScope({
  employeeNo,
  role,
  department,
  level,
  district = "",
  region = "",
  subRegion = "",
  warehouseCode = "",
  salesNo = "",
  minimumLevel,
  accessLevel = "",
  allAreas = false,
}) {
  return {
    authenticated: true,
    accessControlled: true,
    level,
    district: clean(district),
    region: clean(region),
    subRegion: clean(subRegion),
    warehouseCode: clean(warehouseCode),
    salesNo: clean(salesNo),
    employeeNo,
    role,
    department,
    accessLevel: clean(accessLevel || minimumLevel || department),
    organizationCode: "110",
    minimumLevel,
    maximumLevel: "promoter",
    allAreas: allAreas === true,
  };
}

export function getAuthorizedDashboardScope(
  authenticatedUser,
  requested = {}
) {
  if (!authenticatedUser) {
    return {
      authenticated: false,
      accessControlled: false,
      level: normalizeRequestedLevel(requested.level, "district"),
      district: clean(requested.district),
      region: clean(requested.region),
      subRegion: clean(requested.subRegion),
      warehouseCode: clean(requested.warehouseCode),
      salesNo: clean(requested.salesNo),
      employeeNo: "",
      role: "",
      department: "",
      accessLevel: "",
      organizationCode: "110",
      minimumLevel: "district",
      maximumLevel: "promoter",
      allAreas: false,
    };
  }

  const employeeNo = clean(authenticatedUser.employeeNo);
  const role = upper(authenticatedUser.role || "STAFF");
  const department = upper(
    authenticatedUser.department ||
    "NONE"
  );

  // accessLevel is resolved dynamically at login from the actual
  // dashboard hierarchy values. It must not be inferred from the
  // human-readable Kingdee Department name.
  const accessLevel = upper(
    authenticatedUser.accessLevel ||
    "NONE"
  );

  if (!employeeNo) {
    throw new Error(
      "Authenticated dashboard user is missing employeeNo."
    );
  }

  if (!ALLOWED_ROLE_CODES.has(role)) {
    throw new Error(
      `Role '${role || "UNASSIGNED"}' is not authorized to access the EKSBASE dashboard.`
    );
  }

  // PROMOTER: Employee No. is the only authorization identity.
  if (role === "PROMOTER") {
    return buildScope({
      employeeNo,
      role,
      department,
      level: "promoter",
      salesNo: employeeNo,
      minimumLevel: "promoter",
      accessLevel: "PROMOTER",
    });
  }

  /*
   * HQ.* / ALL / ADMIN have full hierarchy access.
   * Requested values may control navigation/filtering because the user
   * is already authorized for the complete Organization 110 hierarchy.
   */
  const roleAccessLevel = ROLE_ACCESS_LEVELS[role] || "";

  // ADMIN and CSH are both HQ roles. Their Kingdee Department must never
  // reduce their dashboard scope. This matches the Customer & Store Dashboard.
  const isFullAccessDepartment =
    roleAccessLevel === "HQ" ||
    accessLevel === "ALL" ||
    accessLevel === "ADMIN" ||
    department === "ALL" ||
    department === "ADMIN";

  if (isFullAccessDepartment) {
    return buildScope({
      employeeNo,
      role,
      department,
      level: normalizeRequestedLevel(requested.level, "district"),
      district: requested.district,
      region: requested.region,
      subRegion: requested.subRegion,
      warehouseCode: requested.warehouseCode,
      salesNo: requested.salesNo,
      minimumLevel: "district",
      accessLevel:
        accessLevel === "ALL" || accessLevel === "ADMIN"
          ? accessLevel
          : "ALL",
      allAreas: true,
    });
  }

  if (!DEPARTMENTS.has(accessLevel)) {
    throw new Error(
      `No dashboard access configured for employee ${employeeNo}: department ${department}, resolved access level ${accessLevel}`
    );
  }

  switch (accessLevel) {
    case "DISTRICT": {
      const district = clean(authenticatedUser.district);
      if (!district) {
        throw new Error(
          `Employee ${employeeNo} has DISTRICT department but no district is configured.`
        );
      }

      return buildScope({
        employeeNo,
        role,
        department,
        level: enforceMinimumLevel(requested.level, "district"),
        district,
        region: requested.region,
        subRegion: requested.subRegion,
        warehouseCode: requested.warehouseCode,
        salesNo: requested.salesNo,
        minimumLevel: "district",
        accessLevel: "DISTRICT",
      });
    }

    case "REGION": {
      const region = clean(authenticatedUser.region);
      if (!region) {
        throw new Error(
          `Employee ${employeeNo} has REGION department but no region is configured.`
        );
      }

      return buildScope({
        employeeNo,
        role,
        department,
        level: enforceMinimumLevel(requested.level, "region"),
        region,
        subRegion: requested.subRegion,
        warehouseCode: requested.warehouseCode,
        salesNo: requested.salesNo,
        minimumLevel: "region",
        accessLevel: "REGION",
      });
    }

    case "SUB_REGION": {
      const subRegion = clean(authenticatedUser.subRegion);
      if (!subRegion) {
        throw new Error(
          `Employee ${employeeNo} has SUB_REGION department but no subRegion is configured.`
        );
      }

      return buildScope({
        employeeNo,
        role,
        department,
        level: enforceMinimumLevel(requested.level, "subRegion"),
        subRegion,
        warehouseCode: requested.warehouseCode,
        salesNo: requested.salesNo,
        minimumLevel: "subRegion",
        accessLevel: "SUB_REGION",
      });
    }

    default:
      throw new Error(
        `No dashboard access configured for employee ${employeeNo}: department ${department}`
      );
  }
}

export function getDashboardAuthMetadata(scope) {
  return {
    authenticated: scope?.authenticated === true,
    accessControlled: scope?.accessControlled === true,
    employeeNo: scope?.employeeNo || "",
    role: scope?.role || "",
    department: scope?.department || scope?.accessLevel || "",
    accessLevel: scope?.accessLevel || "",
    organizationCode: scope?.organizationCode || "110",
    minimumLevel: scope?.minimumLevel || "district",
    maximumLevel: scope?.maximumLevel || "promoter",
    allAreas: scope?.allAreas === true,
  };
}
