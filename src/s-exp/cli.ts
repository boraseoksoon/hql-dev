// src/s-exp/cli.ts - Command-line interface for the S-expression layer

import * as fs from 'fs';
import * as path from 'path';
import { processHql } from './main';
import { Logger } from '../logger';

/**
 * Command-line options for the S-expression HQL compiler
 */
interface CliOptions {
  input: string;
  output?: string;
  verbose: boolean;
  watch: boolean;
  help: boolean;
}

/**
 * Parse command-line arguments
 */
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    input: '',
    output: undefined,
    verbose: false,
    watch: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-o' || arg === '--output') {
      if (i + 1 < args.length) {
        options.output = args[++i];
      } else {
        throw new Error('Output option requires a file path');
      }
    } else if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '-w' || arg === '--watch') {
      options.watch = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.input = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  
  return options;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log('HQL S-Expression Compiler');
  console.log('Usage: hql-sexpr <input.hql> [options]');
  console.log('');
  console.log('Options:');
  console.log('  -o, --output <file>  Write output to file instead of stdout');
  console.log('  -v, --verbose        Enable verbose logging');
  console.log('  -w, --watch          Watch the input file for changes');
  console.log('  -h, --help           Show this help message');
}

/**
 * Process a file using the S-expression layer
 */
async function processFile(
  inputPath: string,
  outputPath: string | undefined,
  verbose: boolean
): Promise<void> {
  const logger = new Logger(verbose);
  
  try {
    logger.log(`Processing ${inputPath}`);
    
    // Read the input file
    const source = await fs.promises.readFile(inputPath, 'utf-8');
    
    // Process the source
    const baseDir = path.dirname(inputPath);
    const result = await processHql(source, { baseDir, verbose });
    
    // Write the output
    if (outputPath) {
      await fs.promises.writeFile(outputPath, result, 'utf-8');
      logger.log(`Output written to ${outputPath}`);
    } else {
      process.stdout.write(result);
    }
    
    logger.log('Processing complete');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error processing file: ${errorMessage}`);
    throw error;
  }
}

/**
 * Watch a file for changes and reprocess when it changes
 */
async function watchFile(
  inputPath: string,
  outputPath: string | undefined,
  verbose: boolean
): Promise<void> {
  const logger = new Logger(verbose);
  logger.log(`Watching ${inputPath} for changes...`);
  
  // Process initially
  await processFile(inputPath, outputPath, verbose);
  
  // Set up a file watcher
  fs.watch(inputPath, async (eventType) => {
    if (eventType === 'change') {
      logger.log(`File ${inputPath} changed, reprocessing...`);
      try {
        await processFile(inputPath, outputPath, verbose);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error reprocessing file: ${errorMessage}`);
      }
    }
  });
}

/**
 * Main CLI entry point
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const options = parseArgs(args);
    
    if (options.help || !options.input) {
      printUsage();
      return;
    }
    
    // Ensure the input file exists
    if (!fs.existsSync(options.input)) {
      throw new Error(`Input file not found: ${options.input}`);
    }
    
    // If output file path is specified, ensure its directory exists
    if (options.output) {
      const outputDir = path.dirname(options.output);
      if (!fs.existsSync(outputDir)) {
        await fs.promises.mkdir(outputDir, { recursive: true });
      }
    }
    
    if (options.watch) {
      await watchFile(options.input, options.output, options.verbose);
    } else {
      await processFile(options.input, options.output, options.verbose);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run as script if invoked directly
if (require.main === module) {
  main().catch(console.error);
}