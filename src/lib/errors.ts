/**
 * Error classes and codes for begin-cli
 * Exit codes:
 *   0 - Success
 *   1 - General error (system/network issues)
 *   2 - User error (invalid input, missing args)
 */

export enum ExitCode {
  SUCCESS = 0,
  ERROR = 1,
  USER_ERROR = 2,
}

export enum ErrorCode {
  // General errors (exit code 1)
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  WALLET_ERROR = 'WALLET_ERROR',
  
  // User errors (exit code 2)
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  MISSING_ARGUMENT = 'MISSING_ARGUMENT',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  UNKNOWN_COMMAND = 'UNKNOWN_COMMAND',
}

// Map error codes to exit codes
const userErrorCodes = new Set<ErrorCode>([
  ErrorCode.INVALID_ARGUMENT,
  ErrorCode.MISSING_ARGUMENT,
  ErrorCode.INVALID_ADDRESS,
  ErrorCode.INVALID_AMOUNT,
  ErrorCode.WALLET_NOT_FOUND,
  ErrorCode.INSUFFICIENT_FUNDS,
  ErrorCode.UNKNOWN_COMMAND,
]);

export class BeginError extends Error {
  public readonly code: ErrorCode;
  public readonly exitCode: ExitCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BeginError';
    this.code = code;
    this.exitCode = userErrorCodes.has(code) ? ExitCode.USER_ERROR : ExitCode.ERROR;
    this.details = details;
  }

  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code,
      ...(this.details && { details: this.details }),
    };
  }
}

// Convenience error factories
export const errors = {
  missingArgument: (arg: string) =>
    new BeginError(`Missing required argument: ${arg}`, ErrorCode.MISSING_ARGUMENT, { argument: arg }),

  invalidArgument: (arg: string, reason?: string) =>
    new BeginError(
      reason ? `Invalid argument '${arg}': ${reason}` : `Invalid argument: ${arg}`,
      ErrorCode.INVALID_ARGUMENT,
      { argument: arg }
    ),

  invalidAddress: (address?: string) =>
    new BeginError('Invalid Cardano address', ErrorCode.INVALID_ADDRESS, address ? { address } : undefined),

  invalidAmount: (amount?: string) =>
    new BeginError('Invalid amount: must be a positive number', ErrorCode.INVALID_AMOUNT, amount ? { amount } : undefined),

  walletNotFound: (name: string) =>
    new BeginError(`Wallet not found: ${name}`, ErrorCode.WALLET_NOT_FOUND, { wallet: name }),

  insufficientFunds: (required: string, available: string) =>
    new BeginError(
      `Insufficient funds: need ${required} ADA, have ${available} ADA`,
      ErrorCode.INSUFFICIENT_FUNDS,
      { required, available }
    ),

  unknownCommand: (command: string) =>
    new BeginError(`Unknown command: ${command}`, ErrorCode.UNKNOWN_COMMAND, { command }),

  networkError: (message: string) =>
    new BeginError(message, ErrorCode.NETWORK_ERROR),

  providerError: (message: string) =>
    new BeginError(message, ErrorCode.PROVIDER_ERROR),

  configError: (message: string) =>
    new BeginError(message, ErrorCode.CONFIG_ERROR),

  walletError: (message: string) =>
    new BeginError(message, ErrorCode.WALLET_ERROR),
};

// Convert any error to BeginError
export function toBeginError(err: unknown): BeginError {
  if (err instanceof BeginError) {
    return err;
  }
  if (err instanceof Error) {
    return new BeginError(err.message, ErrorCode.UNKNOWN_ERROR);
  }
  return new BeginError(String(err), ErrorCode.UNKNOWN_ERROR);
}
