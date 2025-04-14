// Fix for perform function
export function perform<T>(
  fn: () => T,
  context?: string,
  errorType?: new (message: string, ...args: any[]) => TranspilerError,
  errorArgs?: any[] | string | any,
): T {
  try {
    return fn();
  } catch (error) {
    // If error is already of the expected type, re-throw it
    if (errorType && error instanceof errorType) {
      throw error;
    }

    // Prepare the message with context
    const msg = context
      ? `${context}: ${formatErrorMessage(error)}`
      : formatErrorMessage(error);

    // If an error type is specified, create a new error of that type
    if (errorType) {
      const args = Array.isArray(errorArgs) ? errorArgs :
                   errorArgs !== undefined ? [errorArgs] : [];
      throw new errorType(msg, ...args);
    }

    // Otherwise, use a generic TranspilerError
    throw new TranspilerError(msg);
  }
}
