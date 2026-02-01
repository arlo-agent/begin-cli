/**
 * Error codes for begin-cli
 */
export const ErrorCode = {
  // General errors (1xx)
  UNKNOWN: 'UNKNOWN_ERROR',
  CONFIG_READ: 'CONFIG_READ_ERROR',
  CONFIG_WRITE: 'CONFIG_WRITE_ERROR',
  
  // User errors (2xx) - exit code 2
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  MISSING_ARGUMENT: 'MISSING_ARGUMENT',
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  INVALID_NETWORK: 'INVALID_NETWORK',
  
  // Wallet errors (3xx)
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_LOCKED: 'WALLET_LOCKED',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  
  // Network errors (4xx)
  NETWORK_ERROR: 'NETWORK_ERROR',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Base error class for begin-cli
 */
export class BeginError extends Error {
  readonly code: ErrorCodeType;
  readonly exitCode: number;

  constructor(message: string, code: ErrorCodeType = ErrorCode.UNKNOWN, exitCode: number = 1) {
    super(message);
    this.name = 'BeginError';
    this.code = code;
    this.exitCode = exitCode;
  }

  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code,
    };
  }
}

/**
 * User input error - exit code 2
 */
export class UserError extends BeginError {
  constructor(message: string, code: ErrorCodeType = ErrorCode.MISSING_ARGUMENT) {
    super(message, code, 2);
    this.name = 'UserError';
  }
}

/**
 * Network/provider error - exit code 1
 */
export class NetworkError extends BeginError {
  constructor(message: string, code: ErrorCodeType = ErrorCode.NETWORK_ERROR) {
    super(message, code, 1);
    this.name = 'NetworkError';
  }
}

/**
 * Wallet operation error - exit code 1
 */
export class WalletError extends BeginError {
  constructor(message: string, code: ErrorCodeType = ErrorCode.WALLET_NOT_FOUND) {
    super(message, code, 1);
    this.name = 'WalletError';
  }
}
