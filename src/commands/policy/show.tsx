import React from "react";
import { Box, Text } from "ink";
import { loadPolicies, getDailySpending } from "../../lib/policy.js";

interface PolicyShowProps {
  json: boolean;
}

export function PolicyShow({ json }: PolicyShowProps) {
  const policies = loadPolicies();
  const isEmpty =
    !policies.maxPerTransaction &&
    !policies.dailyLimit &&
    !policies.allowlist?.length &&
    !policies.denylist?.length;

  if (json) {
    const output: Record<string, unknown> = {
      ...policies,
      dailySpending: {} as Record<string, number>,
    };
    if (policies.dailyLimit) {
      const spending: Record<string, number> = {};
      for (const asset of Object.keys(policies.dailyLimit)) {
        spending[asset] = getDailySpending(asset);
      }
      output.dailySpending = spending;
    }
    console.log(JSON.stringify(output, null, 2));
    return null;
  }

  if (isEmpty) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">⚠ No agent safety policies configured.</Text>
        <Text color="gray">
          Set limits with: begin policy set --max-tx 100 ADA
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        🛡️ Agent Safety Policies
      </Text>
      <Text> </Text>

      {policies.maxPerTransaction && (
        <Box flexDirection="column">
          <Text bold>Max Per Transaction:</Text>
          {Object.entries(policies.maxPerTransaction).map(([asset, limit]) => (
            <Text key={asset}>
              {"  "}{asset}: {limit}
            </Text>
          ))}
        </Box>
      )}

      {policies.dailyLimit && (
        <Box flexDirection="column">
          <Text bold>Daily Limits:</Text>
          {Object.entries(policies.dailyLimit).map(([asset, limit]) => {
            const spent = getDailySpending(asset);
            return (
              <Text key={asset}>
                {"  "}{asset}: {spent}/{limit} ({limit - spent} remaining)
              </Text>
            );
          })}
        </Box>
      )}

      {policies.allowlist && policies.allowlist.length > 0 && (
        <Box flexDirection="column">
          <Text bold>Allowlist:</Text>
          {policies.allowlist.map((addr, i) => (
            <Text key={i}>{"  "}{addr}</Text>
          ))}
        </Box>
      )}

      {policies.denylist && policies.denylist.length > 0 && (
        <Box flexDirection="column">
          <Text bold>Denylist:</Text>
          {policies.denylist.map((addr, i) => (
            <Text key={i}>{"  "}{addr}</Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
