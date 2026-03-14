import React, { useState, useEffect } from "react";
import { Box, Text, useApp } from "ink";
import {
  getRate,
  buildPairId,
  isSupportedAsset,
  getAssetDisplayName,
  type BridgeChain,
  type BestRateResult,
} from "../../services/xoswap.js";
import { getErrorMessage } from "../../lib/errors.js";

interface BridgeQuoteProps {
  from: string;
  to: string;
  amount: string;
  json: boolean;
}

type QuoteState = "loading" | "success" | "error";

export function BridgeQuote({ from, to, amount, json }: BridgeQuoteProps) {
  const { exit } = useApp();
  const [state, setState] = useState<QuoteState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [rateResult, setRateResult] = useState<BestRateResult | null>(null);

  const fromAsset = from.toUpperCase();
  const toAsset = to.toUpperCase();
  const amountNum = parseFloat(amount);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        // Validate assets
        if (!isSupportedAsset(fromAsset)) {
          throw new Error(`Unsupported source asset: ${fromAsset}. Supported: BTC, SOL, ADA, ETH, MATIC, AVAX, BNB, ARB, OP`);
        }
        if (!isSupportedAsset(toAsset)) {
          throw new Error(`Unsupported destination asset: ${toAsset}. Supported: BTC, SOL, ADA, ETH, MATIC, AVAX, BNB, ARB, OP`);
        }
        if (fromAsset === toAsset) {
          throw new Error("Source and destination assets must be different");
        }
        if (isNaN(amountNum) || amountNum <= 0) {
          throw new Error("Amount must be a positive number");
        }

        const pairId = buildPairId(fromAsset as BridgeChain, toAsset as BridgeChain);
        const result = await getRate(pairId, amountNum);

        if (!result) {
          throw new Error(`No rates available for ${fromAsset} -> ${toAsset}`);
        }

        // Check if amount is within limits
        if (amountNum < result.min) {
          throw new Error(`Amount ${amountNum} ${fromAsset} is below minimum ${result.min} ${fromAsset}`);
        }
        if (amountNum > result.max) {
          throw new Error(`Amount ${amountNum} ${fromAsset} is above maximum ${result.max} ${fromAsset}`);
        }

        setRateResult(result);
        setState("success");
      } catch (err) {
        setError(getErrorMessage(err, "Failed to get bridge quote"));
        setState("error");
      }
    };

    fetchQuote();
  }, [fromAsset, toAsset, amountNum]);

  // JSON output
  if (json) {
    if (state === "loading") {
      return <Text>{JSON.stringify({ status: "loading" })}</Text>;
    }

    if (state === "error") {
      console.log(JSON.stringify({ error, from: fromAsset, to: toAsset, amount: amountNum }, null, 2));
      exit();
      return null;
    }

    if (state === "success" && rateResult) {
      console.log(
        JSON.stringify(
          {
            status: "success",
            from: {
              asset: fromAsset,
              amount: amountNum,
              chain: getAssetDisplayName(fromAsset as BridgeChain),
            },
            to: {
              asset: toAsset,
              amount: rateResult.outputAmount,
              chain: getAssetDisplayName(toAsset as BridgeChain),
            },
            rate: rateResult.bestRate.amount.value,
            minerFee: rateResult.bestRate.minerFee.value,
            provider: rateResult.bestRate.provider,
            limits: {
              min: rateResult.min,
              max: rateResult.max,
            },
          },
          null,
          2
        )
      );
      exit();
      return null;
    }

    return null;
  }

  // Human-readable output
  if (state === "loading") {
    return (
      <Box padding={1}>
        <Text color="cyan">Fetching bridge quote...</Text>
      </Box>
    );
  }

  if (state === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!rateResult) {
    return null;
  }

  const fromChain = getAssetDisplayName(fromAsset as BridgeChain);
  const toChain = getAssetDisplayName(toAsset as BridgeChain);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Cross-Chain Bridge Quote
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" padding={1}>
        {/* Route */}
        <Box>
          <Text color="gray">Route: </Text>
          <Text bold>
            {fromChain} ({fromAsset}) → {toChain} ({toAsset})
          </Text>
        </Box>

        {/* Amount info */}
        <Box marginTop={1}>
          <Text color="gray">You send: </Text>
          <Text bold color="white">
            {amountNum} {fromAsset}
          </Text>
        </Box>
        <Box>
          <Text color="gray">You receive: </Text>
          <Text bold color="green">
            ~{rateResult.outputAmount.toFixed(8)} {toAsset}
          </Text>
        </Box>

        {/* Rate */}
        <Box marginTop={1}>
          <Text color="gray">Rate: </Text>
          <Text>
            1 {fromAsset} = {rateResult.bestRate.amount.value.toFixed(8)} {toAsset}
          </Text>
        </Box>

        {/* Fee */}
        <Box>
          <Text color="gray">Network fee: </Text>
          <Text>
            {rateResult.bestRate.minerFee.value} {toAsset}
          </Text>
        </Box>

        {/* Provider */}
        <Box>
          <Text color="gray">Provider: </Text>
          <Text>{rateResult.bestRate.provider}</Text>
        </Box>

        {/* Limits */}
        <Box marginTop={1}>
          <Text color="gray">Limits: </Text>
          <Text>
            {rateResult.min} - {rateResult.max} {fromAsset}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          To execute: begin bridge --from {fromAsset} --to {toAsset} --amount {amount}
        </Text>
      </Box>
    </Box>
  );
}
