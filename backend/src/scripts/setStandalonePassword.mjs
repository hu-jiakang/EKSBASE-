// Password input uses raw stdin only; no readline interface may echo it.
import { getDashboardEmployee } from "../auth/dashboardEmployee.js";
import { setLocalCredentialPassword } from "../auth/localCredentials.js";

const employeeNo = String(process.argv[2] || "").trim();

if (!employeeNo) {
  console.error("Usage: node src/scripts/setStandalonePassword.mjs <employeeNo>");
  process.exit(1);
}

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error("Interactive password setup requires a TTY."));
      return;
    }

    // Do not attach a readline interface: its default echo reveals plaintext.

    const stdin = process.stdin;
    const originalRaw = stdin.isRaw;

    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();

    let value = "";

    const cleanup = () => {
      stdin.setRawMode(Boolean(originalRaw));
      stdin.removeListener("data", onData);
      stdin.pause();
      process.stdout.write("\n");
    };

    const onData = (chunk) => {
      const data = chunk.toString("utf8");

      for (const char of data) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Password setup cancelled."));
          return;
        }

        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }

        if (char === "\b" || char === "\u007f") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }

        if (char >= " " && char !== "\u007f") {
          value += char;
          process.stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
  });
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
    throw new Error(
      "Employee was not found in Kingdee Employee Master, is disabled, or has no dashboard access."
    );
  }

  const password = await promptHidden("New EKSBASE password: ");
  const confirm = await promptHidden("Confirm password: ");

  if (password !== confirm) {
    throw new Error("Passwords do not match.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  if (password === employeeNo || (process.env.EKSBASE_INITIAL_PASSWORD && password === process.env.EKSBASE_INITIAL_PASSWORD)) {
    throw new Error(
      "Password cannot remain the employee number or configured initial password."
    );
  }

  await setLocalCredentialPassword(employeeNo, password, {
    mustChangePassword: false,
  });

  console.log(`Standalone password provisioned for employee ${employeeNo}.`);
  console.log("The password is stored as a scrypt hash; plaintext is not stored.");
} catch (error) {
  console.error(`Password setup failed: ${error.message}`);
  process.exit(1);
}
