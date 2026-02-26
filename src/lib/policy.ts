import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const BEGIN_DIR = path.join(os.homedir(), ".begin");
const POLICIES_PATH = path.join(BEGIN_DIR, "policies.json");
const SPENDING_LOG_PATH = path.join(BEGIN_DIR, "spending-log.json");

export interface PolicyConfig {
  maxPerTransaction?: Record<string, number>; // asset -> max amount
  dailyLimit?: Record<string, number>; // asset -> daily max
  allowlist?: string[]; // allowed recipient addresses
  denylist?: string[]; // blocked recipient addresses
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

interface SpendingLog {
  [date: string]: {
    [asset: string]: number;
  };
}

function ensureDir(): void {
  if (!fs.existsSync(BEGIN_DIR)) {
    fs.mkdirSync(BEGIN_DIR, { recursive: true });
  }
}

export function loadPolicies(): PolicyConfig {
  try {
    if (fs.existsSync(POLICIES_PATH)) {
      return JSON.parse(fs.readFileSync(POLICIES_PATH, "utf-8"));
    }
  } catch {
    // Return defaults on parse error
  }
  return {};
}

export function savePolicies(policies: PolicyConfig): void {
  ensureDir();
  fs.writeFileSync(POLICIES_PATH, JSON.stringify(policies, null, 2) + "\n");
}

function loadSpendingLog(): SpendingLog {
  try {
    if (fs.existsSync(SPENDING_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(SPENDING_LOG_PATH, "utf-8"));
    }
  } catch {
    // Return empty on parse error
  }
  return {};
}

function saveSpendingLog(log: SpendingLog): void {
  ensureDir();
  fs.writeFileSync(SPENDING_LOG_PATH, JSON.stringify(log, null, 2) + "\n");
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailySpending(asset: string): number {
  const log = loadSpendingLog();
  const today = todayKey();
  return log[today]?.[asset] ?? 0;
}

export function recordSpending(asset: string, amount: number): void {
  const log = loadSpendingLog();
  const today = todayKey();
  if (!log[today]) log[today] = {};
  log[today][asset] = (log[today][asset] ?? 0) + amount;
  saveSpendingLog(log);
}

export function validateTransaction(
  to: string,
  amount: number,
  asset: string
): ValidationResult {
  const policies = loadPolicies();

  // Check denylist
  if (policies.denylist?.length && policies.denylist.includes(to)) {
    return { allowed: false, reason: `Address ${to} is on the deny list` };
  }

  // Check allowlist (if set, address must be on it)
  if (policies.allowlist?.length && !policies.allowlist.includes(to)) {
    return { allowed: false, reason: `Address ${to} is not on the allow list` };
  }

  // Check max per transaction
  const maxTx = policies.maxPerTransaction?.[asset];
  if (maxTx !== undefined && amount > maxTx) {
    return {
      allowed: false,
      reason: `Amount ${amount} ${asset} exceeds max per transaction limit of ${maxTx} ${asset}`,
    };
  }

  // Check daily limit
  const dailyMax = policies.dailyLimit?.[asset];
  if (dailyMax !== undefined) {
    const spent = getDailySpending(asset);
    if (spent + amount > dailyMax) {
      return {
        allowed: false,
        reason: `Amount ${amount} ${asset} would exceed daily limit of ${dailyMax} ${asset} (already spent: ${spent} ${asset})`,
      };
    }
  }

  return { allowed: true };
}
