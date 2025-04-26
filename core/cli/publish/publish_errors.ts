// cli/publish/publish_errors.ts - Specialized error handling for the publishing system

import { TranspilerError } from "../../src/common/error.ts";

export class PublishError extends TranspilerError {
  constructor(
    message: string,
    options: {
      source?: string;
      filePath?: string;
      platform?: string;
      phase?: string;
      useColors?: boolean;
    } = {}
  ) {
    // Add a bit more context to error messages
    const enhancedMessage = options.platform 
      ? `Publishing to ${options.platform} failed: ${message}`
      : `Publishing failed: ${message}`;
      
    super(enhancedMessage, {
      source: options.source,
      filePath: options.filePath,
      useColors: options.useColors ?? true
    });
    
    Object.setPrototypeOf(this, PublishError.prototype);
  }
}