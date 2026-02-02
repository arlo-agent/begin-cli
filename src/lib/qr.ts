import qrcode from 'qrcode-terminal';

/**
 * Generate a QR code string for terminal display
 */
export function generateQRCode(data: string, small: boolean = true): Promise<string> {
  return new Promise((resolve, reject) => {
    qrcode.generate(data, { small }, (qrString: string) => {
      if (qrString) {
        resolve(qrString);
      } else {
        reject(new Error('Failed to generate QR code'));
      }
    });
  });
}

/**
 * Check if a string looks like a valid Cardano address
 */
export function isValidCardanoAddress(address: string): boolean {
  // Cardano addresses start with addr (mainnet) or addr_test (testnet)
  // and are typically 59-120 characters
  const mainnetPattern = /^addr1[a-zA-Z0-9]{50,110}$/;
  const testnetPattern = /^addr_test1[a-zA-Z0-9]{50,110}$/;
  
  return mainnetPattern.test(address) || testnetPattern.test(address);
}

/**
 * Truncate an address for display
 */
export function truncateAddress(address: string, prefixLen: number = 20, suffixLen: number = 10): string {
  if (address.length <= prefixLen + suffixLen + 3) {
    return address;
  }
  return `${address.slice(0, prefixLen)}...${address.slice(-suffixLen)}`;
}
