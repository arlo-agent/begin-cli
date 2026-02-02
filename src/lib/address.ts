/**
 * Address derivation utilities for Cardano using MeshJS
 * 
 * Derivation path: m/1852'/1815'/0'/0/0 (CIP-1852 standard)
 * - 1852' = purpose (Shelley era)
 * - 1815' = coin type (Cardano)
 * - 0' = account index
 * - 0 = role (0 = external/payment, 2 = staking)
 * - 0 = address index
 */

import {
  MeshWallet,
  deserializeAddress,
  serializeRewardAddress,
} from '@meshsdk/core';

export type NetworkType = 'mainnet' | 'preprod' | 'preview';

export interface DerivedAddresses {
  /** Base address (payment + stake key) - most common for receiving */
  baseAddress: string;
  /** Enterprise address (payment key only, no staking) */
  enterpriseAddress: string;
  /** Stake/reward address (for staking operations) */
  stakeAddress: string;
  /** Network the addresses are for */
  network: NetworkType;
}

export interface AddressInfo {
  address: string;
  type: 'base' | 'enterprise' | 'reward' | 'pointer' | 'bootstrap';
  network: 'mainnet' | 'testnet';
  paymentCredentialHash?: string;
  stakeCredentialHash?: string;
}

/**
 * Map network name to MeshJS network ID
 * Mainnet = 1, Testnet (preprod/preview) = 0
 */
function getNetworkId(network: NetworkType): 0 | 1 {
  return network === 'mainnet' ? 1 : 0;
}

/**
 * Derive all address types from a mnemonic phrase
 * 
 * @param mnemonic - 24-word mnemonic phrase
 * @param network - Target network (mainnet, preprod, preview)
 * @param accountIndex - Account index (default 0)
 * @param addressIndex - Address index (default 0)
 * @returns Object containing all derived addresses
 */
export async function deriveAddresses(
  mnemonic: string,
  network: NetworkType = 'mainnet',
  accountIndex: number = 0,
  addressIndex: number = 0
): Promise<DerivedAddresses> {
  const networkId = getNetworkId(network);

  // Create wallet from mnemonic with specified network
  const wallet = new MeshWallet({
    networkId,
    key: {
      type: 'mnemonic',
      words: mnemonic.split(' '),
    },
  });

  // Get the base address (payment + stake)
  const baseAddress = await wallet.getChangeAddress();

  // Get unused addresses (derives more if needed)
  const addresses = await wallet.getUnusedAddresses();
  const paymentAddress = addresses[addressIndex] || baseAddress;

  // Get reward/stake address
  const rewardAddresses = await wallet.getRewardAddresses();
  const stakeAddress = rewardAddresses[0] || '';

  // For enterprise address, we need to extract payment credential and build it
  const enterpriseAddress = deriveEnterpriseAddress(paymentAddress, networkId);

  return {
    baseAddress: paymentAddress,
    enterpriseAddress,
    stakeAddress,
    network,
  };
}

/**
 * Derive enterprise address from a base address
 * Enterprise addresses have only payment credential, no staking capability
 * 
 * @param baseAddress - A base address to extract payment credential from
 * @param networkId - Network ID (0 = testnet, 1 = mainnet)
 * @returns Enterprise address string
 */
function deriveEnterpriseAddress(baseAddress: string, networkId: 0 | 1): string {
  try {
    const addrInfo = deserializeAddress(baseAddress);
    const paymentKeyHash = addrInfo.pubKeyHash;
    
    if (!paymentKeyHash) {
      throw new Error('Could not extract payment key hash');
    }

    // Enterprise address header: 0110 (type 6) + network bit
    // Type 6 = enterprise address with key hash payment credential
    const headerByte = (0x60 | networkId).toString(16).padStart(2, '0');
    const addressBytes = Buffer.from(headerByte + paymentKeyHash, 'hex');
    
    // Encode as bech32 with appropriate prefix
    const prefix = networkId === 1 ? 'addr' : 'addr_test';
    return encodeBech32(prefix, addressBytes);
  } catch (error) {
    // Fallback: return empty if we can't derive
    console.error('Failed to derive enterprise address:', error);
    return '';
  }
}

/**
 * Simple bech32 encoding for Cardano addresses
 */
function encodeBech32(prefix: string, data: Buffer): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  
  // Convert to 5-bit groups
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  
  for (const byte of data) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((acc >> bits) & 31);
    }
  }
  
  if (bits > 0) {
    words.push((acc << (5 - bits)) & 31);
  }
  
  // Calculate checksum
  const polymod = (values: number[]): number => {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((b >> i) & 1) {
          chk ^= GEN[i];
        }
      }
    }
    return chk;
  };
  
  const hrpExpand = (hrp: string): number[] => {
    const ret: number[] = [];
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) >> 5);
    }
    ret.push(0);
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) & 31);
    }
    return ret;
  };
  
  const checksumWords = [...hrpExpand(prefix), ...words, 0, 0, 0, 0, 0, 0];
  const polymodValue = polymod(checksumWords) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((polymodValue >> (5 * (5 - i))) & 31);
  }
  
  // Build final string
  const allWords = [...words, ...checksum];
  return prefix + '1' + allWords.map(w => CHARSET[w]).join('');
}

/**
 * Parse and validate a Cardano address
 * 
 * @param address - Bech32-encoded Cardano address
 * @returns Address information including type and network
 */
export function parseAddress(address: string): AddressInfo {
  try {
    const addrInfo = deserializeAddress(address);
    
    // Determine address type from prefix
    let type: AddressInfo['type'] = 'base';
    if (address.startsWith('addr')) {
      // Check for enterprise (starts with specific header)
      if (addrInfo.stakeCredentialHash === undefined || addrInfo.stakeCredentialHash === '') {
        type = 'enterprise';
      } else {
        type = 'base';
      }
    } else if (address.startsWith('stake')) {
      type = 'reward';
    }
    
    // Determine network from prefix
    const network = address.includes('_test') ? 'testnet' : 'mainnet';
    
    return {
      address,
      type,
      network,
      paymentCredentialHash: addrInfo.pubKeyHash,
      stakeCredentialHash: addrInfo.stakeCredentialHash,
    };
  } catch (error) {
    throw new Error(`Invalid Cardano address: ${error}`);
  }
}

/**
 * Validate a mnemonic phrase
 * 
 * @param mnemonic - Space-separated mnemonic words
 * @returns True if valid, throws if invalid
 */
export function validateMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/);
  
  // Cardano uses 24-word mnemonics (256-bit entropy)
  if (words.length !== 24 && words.length !== 15 && words.length !== 12) {
    throw new Error(`Invalid mnemonic length: expected 12, 15, or 24 words, got ${words.length}`);
  }
  
  // Basic validation - actual word list validation happens in MeshWallet
  for (const word of words) {
    if (!/^[a-z]+$/.test(word)) {
      throw new Error(`Invalid mnemonic word: "${word}"`);
    }
  }
  
  return true;
}

/**
 * Create a MeshWallet instance from a mnemonic
 * Useful for signing transactions
 * 
 * @param mnemonic - 24-word mnemonic phrase
 * @param network - Target network
 * @returns MeshWallet instance
 */
export function createWalletFromMnemonic(
  mnemonic: string,
  network: NetworkType = 'mainnet'
): MeshWallet {
  const networkId = getNetworkId(network);
  
  return new MeshWallet({
    networkId,
    key: {
      type: 'mnemonic',
      words: mnemonic.split(' '),
    },
  });
}

/**
 * Get a short display version of an address
 * 
 * @param address - Full address
 * @param prefixLen - Characters to show at start (default 12)
 * @param suffixLen - Characters to show at end (default 8)
 * @returns Shortened address with ellipsis
 */
export function shortenAddress(
  address: string,
  prefixLen: number = 12,
  suffixLen: number = 8
): string {
  if (address.length <= prefixLen + suffixLen + 3) {
    return address;
  }
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}
