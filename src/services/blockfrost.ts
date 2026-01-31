/**
 * Blockfrost API service for Cardano blockchain queries
 * 
 * For production use, set BLOCKFROST_API_KEY environment variable.
 * Get your free API key at: https://blockfrost.io
 */

export interface Token {
  unit: string;
  name: string | null;
  quantity: string;
}

export interface BalanceResult {
  lovelace: string;
  tokens: Token[];
}

interface BlockfrostAmount {
  unit: string;
  quantity: string;
}

interface BlockfrostAddressResponse {
  address: string;
  amount: BlockfrostAmount[];
  stake_address: string | null;
  type: string;
  script: boolean;
}

const BLOCKFROST_URLS: Record<string, string> = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
  preview: 'https://cardano-preview.blockfrost.io/api/v0',
};

/**
 * Fetch balance for a Cardano address
 */
export async function fetchBalance(address: string, network: string): Promise<BalanceResult> {
  const apiKey = process.env.BLOCKFROST_API_KEY;
  const baseUrl = BLOCKFROST_URLS[network];

  if (!baseUrl) {
    throw new Error(`Unknown network: ${network}. Use mainnet, preprod, or preview.`);
  }

  // If no API key, return mock data for development
  if (!apiKey) {
    console.error('\n⚠ No BLOCKFROST_API_KEY set - returning mock data\n');
    return getMockBalance();
  }

  const response = await fetch(`${baseUrl}/addresses/${address}`, {
    headers: {
      project_id: apiKey,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      // Address not found - might be unused
      return { lovelace: '0', tokens: [] };
    }
    if (response.status === 403) {
      throw new Error('Invalid API key or rate limit exceeded');
    }
    throw new Error(`Blockfrost API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as BlockfrostAddressResponse;

  // Parse the amounts
  const lovelace = data.amount.find((a) => a.unit === 'lovelace')?.quantity || '0';
  const tokens: Token[] = data.amount
    .filter((a) => a.unit !== 'lovelace')
    .map((a) => ({
      unit: a.unit,
      name: decodeTokenName(a.unit),
      quantity: a.quantity,
    }));

  return { lovelace, tokens };
}

/**
 * Decode token name from policy+asset hex
 */
function decodeTokenName(unit: string): string | null {
  if (unit.length <= 56) return null; // Just policy ID, no asset name
  const assetNameHex = unit.slice(56);
  try {
    return Buffer.from(assetNameHex, 'hex').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Mock balance for development without API key
 */
function getMockBalance(): BalanceResult {
  return {
    lovelace: '125430000', // 125.43 ADA
    tokens: [
      {
        unit: 'a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59',
        name: 'HOSKY',
        quantity: '1000000',
      },
      {
        unit: 'b0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235534e454b',
        name: 'SNEK',
        quantity: '500',
      },
    ],
  };
}
