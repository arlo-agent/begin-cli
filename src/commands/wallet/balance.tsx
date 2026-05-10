/**
 * Wallet Balance command - total balance and assets across all chains (Cardano, Bitcoin, Solana, EVM)
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { Network } from "../../lib/config.js";
import { getBalance, type BalanceResult } from "../../core/balance.js";
import { truncateAddress } from "../../lib/output.js";
import {
  getMnemonicAsync,
  hasEnvMnemonic,
  getPreferredSource,
  getPasswordFromEnv,
  MNEMONIC_ENV_VAR,
} from "../../lib/keystore.js";
import { getMultiChainAddressesFromMnemonic } from "../../lib/wallet.js";
import {
  createSolanaAdapter,
  createBitcoinAdapter,
  createEVMAdapter,
  getEVMNetworkConfig,
  type SolanaNetwork,
  type BitcoinNetwork,
  type EVMNetwork,
} from "../../lib/chains/index.js";
import type { MultiChainAddresses } from "../../lib/chains/types.js";
import { getErrorMessage } from "../../lib/errors.js";

interface WalletBalanceProps {
  network: string;
  walletName?: string;
  password?: string;
  evmNetwork?: string;
  json?: boolean;
}

interface ChainResult<T> {
  ok: true;
  data: T;
}

interface ChainError {
  ok: false;
  error: string;
}

type LoadingState = "loading" | "need_password" | "success" | "error";

export function WalletBalance({
  network,
  walletName,
  password,
  evmNetwork = "ethereum",
  json = false,
}: WalletBalanceProps) {
  const [state, setState] = useState<LoadingState>("loading");
  const [source, setSource] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [chains, setChains] = useState<MultiChainAddresses | null>(null);
  const [cardano, setCardano] = useState<ChainResult<BalanceResult> | ChainError | null>(null);
  const [bitcoin, setBitcoin] = useState<ChainResult<{ btc: string; satoshis: string }> | ChainError | null>(null);
  const [solana, setSolana] = useState<
    ChainResult<{
      sol: string;
      lamports: string;
      tokens: Array<{ mint: string; symbol?: string; uiAmount: number; decimals: number }>;
    }> | ChainError | null
  >(null);
  const [evm, setEvm] = useState<
    ChainResult<{
      symbol: string;
      amount: string;
      tokens: Array<{ contract: string; symbol?: string; uiAmount: number; decimals: number }>;
    }> | ChainError | null
  >(null);

  const networkId = network === "mainnet" ? 1 : 0;
  const solanaNetwork: SolanaNetwork = network === "mainnet" ? "mainnet-beta" : "devnet";
  const bitcoinNetwork: BitcoinNetwork = networkId === 1 ? "mainnet" : "testnet";
  const evmNet = (evmNetwork || "ethereum") as EVMNetwork;

  useEffect(() => {
    const load = async () => {
      try {
        const preferredSource = getPreferredSource();
        if (!preferredSource && !walletName) {
          setError(
            `No wallet available. Set ${MNEMONIC_ENV_VAR}, or use --wallet <name>.`
          );
          setState("error");
          return;
        }
        const effectivePassword = password || getPasswordFromEnv() || undefined;
        let mnemonic: string;
        try {
          mnemonic = await getMnemonicAsync(effectivePassword, walletName ?? undefined);
        } catch (loadErr) {
          const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
          if (!effectivePassword && msg.toLowerCase().includes("password")) {
            setState("need_password");
            return;
          }
          throw loadErr;
        }
        if (hasEnvMnemonic()) {
          setSource(`environment (${MNEMONIC_ENV_VAR})`);
        } else {
          setSource(`wallet: ${walletName ?? preferredSource?.walletName ?? "default"}`);
        }
        const allChains = await getMultiChainAddressesFromMnemonic(
          mnemonic.split(/\s+/).filter(Boolean),
          networkId
        );
        setChains(allChains);

        const cardanoAddress = allChains.cardano?.addresses?.payment;
        const bitcoinAddress = allChains.bitcoin?.address;
        const solanaAddress = allChains.solana?.address;
        const evmAddress = allChains.evm?.address;

        const [cardanoResult, bitcoinResult, solanaResult, evmResult] = await Promise.allSettled([
          cardanoAddress
            ? getBalance(cardanoAddress, network as Network)
            : Promise.resolve(null),
          bitcoinAddress
            ? createBitcoinAdapter(bitcoinNetwork).getBalance(bitcoinAddress)
            : Promise.resolve(null),
          solanaAddress
            ? createSolanaAdapter(solanaNetwork).getBalance(solanaAddress)
            : Promise.resolve(null),
          evmAddress
            ? createEVMAdapter(evmNet).getBalance(evmAddress)
            : Promise.resolve(null),
        ]);

        if (cardanoResult.status === "fulfilled" && cardanoResult.value) {
          setCardano({ ok: true, data: cardanoResult.value });
        } else if (cardanoResult.status === "rejected") {
          setCardano({ ok: false, error: getErrorMessage(cardanoResult.reason, "Cardano") });
        }
        if (bitcoinResult.status === "fulfilled" && bitcoinResult.value) {
          const b = bitcoinResult.value;
          setBitcoin({
            ok: true,
            data: { btc: b.native.uiAmount.toFixed(8), satoshis: b.native.amount },
          });
        } else if (bitcoinResult.status === "rejected") {
          setBitcoin({ ok: false, error: getErrorMessage(bitcoinResult.reason, "Bitcoin") });
        }
        if (solanaResult.status === "fulfilled" && solanaResult.value) {
          const b = solanaResult.value;
          setSolana({
            ok: true,
            data: {
              sol: b.native.uiAmount.toFixed(9),
              lamports: b.native.amount,
              tokens: b.tokens.map((t) => ({
                mint: t.mint,
                symbol: t.symbol,
                uiAmount: t.uiAmount,
                decimals: t.decimals,
              })),
            },
          });
        } else if (solanaResult.status === "rejected") {
          setSolana({ ok: false, error: getErrorMessage(solanaResult.reason, "Solana") });
        }
        if (evmResult.status === "fulfilled" && evmResult.value) {
          const b = evmResult.value;
          const cfg = getEVMNetworkConfig(evmNet);
          setEvm({
            ok: true,
            data: {
              symbol: cfg.symbol,
              amount: b.native.uiAmount.toFixed(6),
              tokens: b.tokens.map((t) => ({
                contract: t.mint,
                symbol: t.symbol,
                uiAmount: t.uiAmount,
                decimals: t.decimals,
              })),
            },
          });
        } else if (evmResult.status === "rejected") {
          setEvm({ ok: false, error: getErrorMessage(evmResult.reason, "EVM") });
        }
        setState("success");
      } catch (err) {
        setError(getErrorMessage(err, "Unknown error"));
        setState("error");
      }
    };
    load();
  }, [network, walletName, password, networkId, solanaNetwork, bitcoinNetwork, evmNetwork]);

  if (state === "loading") {
    return (
      <Box>
        <Text>Fetching balances across all chains...</Text>
      </Box>
    );
  }
  if (state === "need_password") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">Password required. Use --password or set BEGIN_CLI_WALLET_PASSWORD.</Text>
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

  if (json) {
    const out: Record<string, unknown> = {
      network,
      source: source || undefined,
      cardano: cardano?.ok
        ? {
            address: cardano.data.address,
            ada: cardano.data.ada,
            lovelace: cardano.data.lovelace,
            tokenCount: cardano.data.tokenCount,
            tokens: cardano.data.tokens,
            mock: cardano.data.mock,
          }
        : cardano && !cardano.ok
          ? { error: cardano.error }
          : null,
      bitcoin: bitcoin?.ok
        ? { btc: bitcoin.data.btc, satoshis: bitcoin.data.satoshis }
        : bitcoin && !bitcoin.ok
          ? { error: bitcoin.error }
          : null,
      solana: solana?.ok
        ? { sol: solana.data.sol, lamports: solana.data.lamports, tokenCount: solana.data.tokens.length, tokens: solana.data.tokens }
        : solana && !solana.ok
          ? { error: solana.error }
          : null,
      evm: evm?.ok
        ? { [evm.data.symbol.toLowerCase()]: evm.data.amount, symbol: evm.data.symbol, tokenCount: evm.data.tokens.length, tokens: evm.data.tokens }
        : evm && !evm.ok
          ? { error: evm.error }
          : null,
    };
    return <Text>{JSON.stringify(out, null, 2)}</Text>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Wallet Balance</Text>
        <Text color="gray"> ({network})</Text>
      </Box>
      {source && (
        <Box marginBottom={1}>
          <Text color="gray">Source: </Text>
          <Text color="blue">{source}</Text>
        </Box>
      )}

      {chains?.cardano && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="green">Cardano</Text>
          <Box paddingLeft={2} marginTop={1} flexDirection="column">
            {cardano?.ok ? (
              <>
                <Box>
                  <Text color="gray">ADA: </Text>
                  <Text>{cardano.data.ada}</Text>
                </Box>
                {cardano.data.tokens.slice(0, 5).map((t) => (
                  <Box key={t.unit} marginTop={1}>
                    <Text color="gray">{t.displayLabel}: </Text>
                    <Text>{t.quantityFormatted}</Text>
                  </Box>
                ))}
                {cardano.data.tokens.length > 5 && (
                  <Box marginTop={1}>
                    <Text color="gray">...and {cardano.data.tokens.length - 5} more</Text>
                  </Box>
                )}
              </>
            ) : cardano && !cardano.ok ? (
              <Text color="red">{cardano.error}</Text>
            ) : (
              <Text color="gray">Loading...</Text>
            )}
          </Box>
        </Box>
      )}

      {chains?.bitcoin && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="orange">Bitcoin</Text>
          <Box paddingLeft={2} marginTop={1} flexDirection="column">
            {bitcoin?.ok ? (
              <Box>
                <Text color="gray">BTC: </Text>
                <Text>{bitcoin.data.btc}</Text>
              </Box>
            ) : bitcoin && !bitcoin.ok ? (
              <Text color="red">{bitcoin.error}</Text>
            ) : (
              <Text color="gray">Loading...</Text>
            )}
          </Box>
        </Box>
      )}

      {chains?.solana && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="blue">Solana</Text>
          <Box paddingLeft={2} marginTop={1} flexDirection="column">
            {solana?.ok ? (
              <>
                <Box>
                  <Text color="gray">SOL: </Text>
                  <Text>{solana.data.sol}</Text>
                </Box>
                {solana.data.tokens.slice(0, 5).map((t) => {
                  const label = t.symbol?.trim() || truncateAddress(t.mint, 12, 8);
                  return (
                    <Box key={t.mint} marginTop={1}>
                      <Text color="gray">{label}: </Text>
                      <Text>{t.uiAmount.toFixed(t.decimals)}</Text>
                    </Box>
                  );
                })}
                {solana.data.tokens.length > 5 && (
                  <Box marginTop={1}>
                    <Text color="gray">...and {solana.data.tokens.length - 5} more</Text>
                  </Box>
                )}
              </>
            ) : solana && !solana.ok ? (
              <Text color="red">{solana.error}</Text>
            ) : (
              <Text color="gray">Loading...</Text>
            )}
          </Box>
        </Box>
      )}

      {chains?.evm && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="gray">EVM</Text>
            <Text color="gray"> ({evmNet})</Text>
          </Box>
          <Box paddingLeft={2} marginTop={1} flexDirection="column">
            {evm?.ok ? (
              <>
                <Box>
                  <Text color="gray">{evm.data.symbol}: </Text>
                  <Text>{evm.data.amount}</Text>
                </Box>
                {evm.data.tokens.slice(0, 5).map((t) => {
                  const label = t.symbol?.trim() || truncateAddress(t.contract, 12, 8);
                  const dp = t.decimals > 8 ? 8 : t.decimals;
                  return (
                    <Box key={t.contract} marginTop={1}>
                      <Text color="gray">{label}: </Text>
                      <Text>{t.uiAmount.toFixed(dp)}</Text>
                    </Box>
                  );
                })}
                {evm.data.tokens.length > 5 && (
                  <Box marginTop={1}>
                    <Text color="gray">...and {evm.data.tokens.length - 5} more</Text>
                  </Box>
                )}
              </>
            ) : evm && !evm.ok ? (
              <Text color="red">{evm.error}</Text>
            ) : (
              <Text color="gray">Loading...</Text>
            )}
          </Box>
        </Box>
      )}

      {!chains?.cardano && !chains?.bitcoin && !chains?.solana && !chains?.evm && (
        <Text color="gray">No chain addresses derived for this wallet.</Text>
      )}
    </Box>
  );
}
