import { getDashboardEmployee } from "../auth/dashboardEmployee.js";
import { setLocalCredentialPassword } from "../auth/localCredentials.js";

const employeeNo = String(process.argv[2] || "").trim();
import "dotenv/config";

const DEFAULT_PASSWORD = String(process.env.EKSBASE_INITIAL_PASSWORD || "");
if (DEFAULT_PASSWORD.length < 8) {
  console.error("Set EKSBASE_INITIAL_PASSWORD to a secure temporary password of at least 8 characters.");
  process.exit(1);
}

if (!employeeNo) {
  console.error("Usage: node src/scripts/resetStandaloneToDefault.mjs <employeeNo>");
  process.exit(1);
}

try {
  const employee = await getDashboardEmployee(employeeNo);

  if (
    !employee ||
    employee.disabled ||
    employee.isActive !== 1 ||
    (
      employee.role !== "PROMOTER" &&
      !["ALL", "ADMIN", "DISTRICT", "REGION", "SUB_REGION"].includes(
        employee.accessLevel
      ) &&
      !String(employee.department || "").startsWith("HQ.")
    )
  ) {
    console.error(
      `Employee ${employeeNo} was not found in Kingdee Employee Master, is disabled, or has no dashboard access.`
    );
    process.exit(1);
  }

  await setLocalCredentialPassword(employeeNo, DEFAULT_PASSWORD, {
    mustChangePassword: true,
  });

  console.log(
    `Employee ${employeeNo} was reset to the temporary first-login password.`
  );
  console.log("The password is stored as a scrypt hash and must be changed at next login.");
} catch (error) {
  console.error(`Standalone password reset failed: ${error.message}`);
  process.exit(1);
}
