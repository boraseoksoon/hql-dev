// src/paredit/index.ts
import * as vscode from 'vscode';
import { Logger } from '../../../shared/logger';
import { registerCommands } from './commands';
import { registerAutoClosePairsHandler } from './auto-close-pairs';

const logger = Logger.create(false);

/**
 * Activate paredit functionality
 */
export function activateParedit(context: vscode.ExtensionContext): void {
  logger.debug('Activating HQL paredit functionality');
  
  // Register paredit commands
  registerCommands(context);
  
  // Register auto-close pairs handler
  registerAutoClosePairsHandler(context);
}