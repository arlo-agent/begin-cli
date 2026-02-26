/**
 * MCP (Model Context Protocol) Server for begin-cli
 *
 * Exposes begin-cli functionality as MCP tools for AI agent integration.
 * Runs over stdio for use with Claude Desktop, Claude Code, etc.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getBalance, getUtxos, type BalanceResult, type UtxosResult } from "../core/balance.js";
import {
  createWallet,
  restoreWallet,
  getWalletAddresses,
  getReceiveAddress,
} from "../core/wallet.js";
import { sendAda, type SendResult } from "../core/send.js";
import { getHistory, type HistoryResult } from "../core/history.js";
import { getStakeStatus, getStakePools, delegateStake, withdrawRewards } from "../core/staking.js";
import { getSwapQuote, executeSwap } from "../core/swap.js";
import { mintNft } from "../core/mint.js";
import type { Network } from "../lib/config.js";

/**
 * Create and configure the MCP server
 */
function createMcpServer(): Server {
  const server = new Server(
    {
      name: "begin-cli",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Wallet tools
        {
          name: "wallet_create",
          description: "Create a new HD wallet with a 24-word mnemonic",
          inputSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Name for the new wallet",
              },
              password: {
                type: "string",
                description: "Password to encrypt the wallet",
              },
            },
            required: ["name", "password"],
          },
        },
        {
          name: "wallet_restore",
          description: "Restore a wallet from a 24-word mnemonic phrase",
          inputSchema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Name for the restored wallet",
              },
              mnemonic: {
                type: "string",
                description: "24-word mnemonic phrase (space-separated)",
              },
              password: {
                type: "string",
                description: "Password to encrypt the wallet",
              },
            },
            required: ["name", "mnemonic", "password"],
          },
        },
        {
          name: "wallet_address",
          description: "Get wallet addresses (payment and stake)",
          inputSchema: {
            type: "object",
            properties: {
              wallet: {
                type: "string",
                description: "Wallet name (uses default if not specified)",
              },
              full: {
                type: "boolean",
                description: "Show full addresses without truncation",
              },
            },
          },
        },
        {
          name: "wallet_balance",
          description: "Check ADA and native token balances for an address",
          inputSchema: {
            type: "object",
            properties: {
              address: {
                type: "string",
                description: "Cardano address to check",
              },
              network: {
                type: "string",
                enum: ["mainnet", "preprod", "preview"],
                description: "Network (default: mainnet)",
              },
            },
            required: ["address"],
          },
        },
        {
          name: "wallet_utxos",
          description: "List UTXOs for an address",
          inputSchema: {
            type: "object",
            properties: {
              address: {
                type: "string",
                description: "Cardano address",
              },
              network: {
                type: "string",
                enum: ["mainnet", "preprod", "preview"],
                description: "Network (default: mainnet)",
              },
            },
            required: ["address"],
          },
        },
        {
          name: "wallet_history",
          description: "Get transaction history for an address",
          inputSchema: {
            type: "object",
            properties: {
              address: {
                type: "string",
                description: "Cardano address",
              },
              limit: {
                type: "number",
                description: "Number of transactions to return (default: 10)",
              },
              page: {
                type: "number",
                description: "Page number for pagination (default: 1)",
              },
              network: {
                type: "string",
                enum: ["mainnet", "preprod", "preview"],
                description: "Network (default: mainnet)",
              },
            },
            required: ["address"],
          },
        },
        {
          name: "wallet_send",
          description: "Send ADA and optionally native tokens",
          inputSchema: {
            type: "object",
            properties: {
              to: {
                type: "string",
                description: "Recipient Cardano address",
              },
              amount: {
                type: "string",
                description: "Amount of ADA to send",
              },
              wallet: {
                type: "string",
                description: "Wallet name to send from",
              },
              network: {
                type: "string",
                enum: ["mainnet", "preprod", "preview"],
                description: "Network (default: mainnet)",
              },
              asset: {
                type: "array",
                items: { type: "string" },
                description: "Native assets to send (format: policyId.assetName:amount)",
              },
            },
            required: ["to", "amount"],
          },
        },
        {
          name: "wallet_receive",
          description: "Get the receive address for a wallet",
          inputSchema: {
            type: "object",
            properties: {
              wallet: {
                type: "string",
                description: "Wallet name (uses default if not specified)",
              },
            },
          },
        },

        // Staking tools
        {
          name: "stake_status",
          description: "Get delegation status and rewards for a wallet",
          inputSchema: {
            type: "object",
            properties: {
              wallet: {
                type: "string",
                description: "Wallet name (uses default if not specified)",
              },
              network: {
                type: "string",
                enum: ["mainnet", "preprod", "preview"],
                description: "Network (default: mainnet)",
              },
            },
          },
        },
        {
          name: "stake_delegate",
          description: "Delegate stake to a pool",
          inputSchema: {
            type: "object",
            properties: {
              poolId: {
                type: "string",
                description: "Pool ID (bech32 or ticker)",
              },
              wallet: {
                type: "string",
                description: "Wallet name (uses default if not specified)",
              },
              network: {
                type: "string",
                enum: ["mainnet", "preprod", "preview"],
                description: "Network (default: mainnet)",
              },
            },
            required: ["poolId"],
          },
        },
        {
          name: "stake_pools",
          description: "Search or list stake pools",
          inputSchema: {
            type: "object",
            properties: {
              search: {
                type: "string",
                description: "Search query (ticker or name)",
              },
              network: {
                type: "string",
                enum: ["mainnet", "preprod", "preview"],
                description: "Network (default: mainnet)",
              },
            },
          },
        },
        {
          name: "stake_withdraw",
          description: "Withdraw staking rewards",
          inputSchema: {
            type: "object",
            properties: {
              wallet: {
                type: "string",
                description: "Wallet name (uses default if not specified)",
              },
              network: {
                type: "string",
                enum: ["mainnet", "preprod", "preview"],
                description: "Network (default: mainnet)",
              },
            },
          },
        },

        // Swap tools
        {
          name: "swap_quote",
          description: "Get a swap quote from Minswap aggregator",
          inputSchema: {
            type: "object",
            properties: {
              from: {
                type: "string",
                description: "Token to swap from (ADA, ticker, or token ID)",
              },
              to: {
                type: "string",
                description: "Token to swap to (ADA, ticker, or token ID)",
              },
              amount: {
                type: "string",
                description: "Amount of input token",
              },
              network: {
                type: "string",
                enum: ["mainnet"],
                description: "Network (swaps only on mainnet)",
              },
            },
            required: ["from", "to", "amount"],
          },
        },
        {
          name: "swap_execute",
          description: "Execute a token swap via Minswap",
          inputSchema: {
            type: "object",
            properties: {
              from: {
                type: "string",
                description: "Token to swap from (ADA, ticker, or token ID)",
              },
              to: {
                type: "string",
                description: "Token to swap to (ADA, ticker, or token ID)",
              },
              amount: {
                type: "string",
                description: "Amount of input token",
              },
              slippage: {
                type: "number",
                description: "Slippage tolerance in % (default: 0.5)",
              },
              wallet: {
                type: "string",
                description: "Wallet name (uses default if not specified)",
              },
              network: {
                type: "string",
                enum: ["mainnet"],
                description: "Network (swaps only on mainnet)",
              },
            },
            required: ["from", "to", "amount"],
          },
        },

        // Mint tool
        {
          name: "mint_nft",
          description: "Mint an NFT via NMKR and send to an address",
          inputSchema: {
            type: "object",
            properties: {
              image: {
                type: "string",
                description: "Path to image file",
              },
              name: {
                type: "string",
                description: "NFT token name (no spaces)",
              },
              to: {
                type: "string",
                description: "Recipient Cardano address",
              },
              description: {
                type: "string",
                description: "Optional NFT description",
              },
            },
            required: ["image", "name", "to"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case "wallet_create": {
          const { name: walletName, password } = args as {
            name: string;
            password: string;
          };
          result = await createWallet(walletName, password);
          break;
        }

        case "wallet_restore": {
          const {
            name: walletName,
            mnemonic,
            password,
          } = args as {
            name: string;
            mnemonic: string;
            password: string;
          };
          result = await restoreWallet(walletName, mnemonic, password);
          break;
        }

        case "wallet_address": {
          const { wallet } = args as { wallet?: string };
          // Password from env for MCP
          const password = process.env.BEGIN_CLI_WALLET_PASSWORD;
          result = await getWalletAddresses(wallet, password);
          break;
        }

        case "wallet_balance": {
          const { address, network = "mainnet" } = args as {
            address: string;
            network?: string;
          };
          result = await getBalance(address, network as Network);
          break;
        }

        case "wallet_utxos": {
          const { address, network = "mainnet" } = args as {
            address: string;
            network?: string;
          };
          result = await getUtxos(address, network as Network);
          break;
        }

        case "wallet_history": {
          const {
            address,
            limit = 10,
            page = 1,
            network = "mainnet",
          } = args as {
            address: string;
            limit?: number;
            page?: number;
            network?: string;
          };
          result = await getHistory(address, network as Network, limit, page);
          break;
        }

        case "wallet_send": {
          const {
            to,
            amount,
            wallet,
            network = "mainnet",
            asset,
          } = args as {
            to: string;
            amount: string;
            wallet?: string;
            network?: string;
            asset?: string[];
          };
          // Password from env for MCP
          const password = process.env.BEGIN_CLI_WALLET_PASSWORD;
          result = await sendAda({
            to,
            amount: parseFloat(amount),
            wallet,
            password,
            network,
            assets: asset,
            skipConfirmation: true, // No interactive confirmation in MCP
          });
          break;
        }

        case "wallet_receive": {
          const { wallet } = args as { wallet?: string };
          const password = process.env.BEGIN_CLI_WALLET_PASSWORD;
          const address = await getReceiveAddress(wallet, password);
          result = { address };
          break;
        }

        case "stake_status": {
          const { wallet, network = "mainnet" } = args as {
            wallet?: string;
            network?: string;
          };
          const password = process.env.BEGIN_CLI_WALLET_PASSWORD;
          result = await getStakeStatus(wallet, password, network);
          break;
        }

        case "stake_delegate": {
          const {
            poolId,
            wallet,
            network = "mainnet",
          } = args as {
            poolId: string;
            wallet?: string;
            network?: string;
          };
          const password = process.env.BEGIN_CLI_WALLET_PASSWORD;
          result = await delegateStake(poolId, wallet, password, network);
          break;
        }

        case "stake_pools": {
          const { search, network = "mainnet" } = args as {
            search?: string;
            network?: string;
          };
          result = await getStakePools(search, network);
          break;
        }

        case "stake_withdraw": {
          const { wallet, network = "mainnet" } = args as {
            wallet?: string;
            network?: string;
          };
          const password = process.env.BEGIN_CLI_WALLET_PASSWORD;
          result = await withdrawRewards(wallet, password, network);
          break;
        }

        case "swap_quote": {
          const {
            from,
            to,
            amount,
            network = "mainnet",
          } = args as {
            from: string;
            to: string;
            amount: string;
            network?: string;
          };
          result = await getSwapQuote({ from, to, amount, network });
          break;
        }

        case "swap_execute": {
          const {
            from,
            to,
            amount,
            slippage,
            wallet,
            network = "mainnet",
          } = args as {
            from: string;
            to: string;
            amount: string;
            slippage?: number;
            wallet?: string;
            network?: string;
          };
          const password = process.env.BEGIN_CLI_WALLET_PASSWORD;
          result = await executeSwap({
            from,
            to,
            amount,
            slippage,
            wallet,
            password,
            network,
          });
          break;
        }

        case "mint_nft": {
          const {
            image,
            name: nftName,
            to,
            description,
          } = args as {
            image: string;
            name: string;
            to: string;
            description?: string;
          };
          result = await mintNft({
            image,
            name: nftName,
            to,
            description,
          });
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  // Register resource handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "begin://wallet/address",
          name: "Current Wallet Address",
          description: "Get the receive address of the current/default wallet",
          mimeType: "application/json",
        },
        {
          uri: "begin://wallet/balance",
          name: "Current Wallet Balance",
          description: "Get the balance of the current/default wallet",
          mimeType: "application/json",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      let content: unknown;

      switch (uri) {
        case "begin://wallet/address": {
          const password = process.env.BEGIN_CLI_WALLET_PASSWORD;
          const address = await getReceiveAddress(undefined, password);
          content = { address };
          break;
        }

        case "begin://wallet/balance": {
          const password = process.env.BEGIN_CLI_WALLET_PASSWORD;
          const addressResult = await getWalletAddresses(undefined, password);
          const balance = await getBalance(addressResult.address, "mainnet");
          content = balance;
          break;
        }

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(content, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({ error: message }, null, 2),
          },
        ],
      };
    }
  });

  return server;
}

/**
 * Start the MCP server over stdio
 */
export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Keep the process alive
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
}

// Allow direct execution for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  startMcpServer().catch(console.error);
}
