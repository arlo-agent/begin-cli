import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { loadPolicies, savePolicies } from "../../lib/policy.js";
import { logAction } from "../../lib/audit.js";

interface PolicySetProps {
  maxTx?: string;
  dailyLimit?: string;
  asset: string;
  json: boolean;
}

export function PolicySet({ maxTx, dailyLimit, asset, json }: PolicySetProps) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<string[]>([]);

  useEffect(() => {
    try {
      const policies = loadPolicies();
      const applied: string[] = [];

      if (maxTx !== undefined) {
        const value = Number(maxTx);
        if (!Number.isFinite(value) || value <= 0) {
          setError("Max per transaction must be a positive number");
          return;
        }
        if (!policies.maxPerTransaction) policies.maxPerTransaction = {};
        policies.maxPerTransaction[asset] = value;
        applied.push(`maxPerTransaction[${asset}] = ${value}`);
      }

      if (dailyLimit !== undefined) {
        const value = Number(dailyLimit);
        if (!Number.isFinite(value) || value <= 0) {
          setError("Daily limit must be a positive number");
          return;
        }
        if (!policies.dailyLimit) policies.dailyLimit = {};
        policies.dailyLimit[asset] = value;
        applied.push(`dailyLimit[${asset}] = ${value}`);
      }

      if (applied.length === 0) {
        setError("No policy changes specified. Use --max-tx or --daily-limit");
        return;
      }

      savePolicies(policies);
      logAction("policy.set", { changes: applied, asset }, "success");
      setChanges(applied);
      setDone(true);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  if (error) {
    if (json) {
      console.log(JSON.stringify({ error }));
      return null;
    }
    return <Text color="red">Error: {error}</Text>;
  }

  if (!done) return null;

  if (json) {
    console.log(JSON.stringify({ success: true, changes }));
    return null;
  }

  return (
    <Box flexDirection="column">
      <Text color="green">✅ Policy updated:</Text>
      {changes.map((c, i) => (
        <Text key={i}>{"  "}{c}</Text>
      ))}
    </Box>
  );
}
