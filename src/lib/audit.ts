import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const BEGIN_DIR = path.join(os.homedir(), ".begin");
const AUDIT_LOG_PATH = path.join(BEGIN_DIR, "audit.log");

export function logAction(
  action: string,
  details: Record<string, unknown>,
  result: "allowed" | "denied" | "error" | "success"
): void {
  if (!fs.existsSync(BEGIN_DIR)) {
    fs.mkdirSync(BEGIN_DIR, { recursive: true });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    action,
    details,
    result,
  };

  fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(entry) + "\n");
}
