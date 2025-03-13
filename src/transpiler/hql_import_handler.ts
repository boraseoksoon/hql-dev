// src/transpiler/hql_import_handler.ts
import { dirname, resolve, readTextFile, exists } from "../platform/platform.ts";
import { transpileFile } from "./transformer.ts";
import { TransformOptions } from "./transformer.ts";

/**
 * Manages pre-processing of HQL imports before normal transformation.
 * This approach preserves the synchronous nature of the transformation pipeline.
 */
export class HQLImportHandler {
  // Track processed files to avoid circular dependencies
  private processedFiles = new Set<string>();
  // Map of HQL paths to their JS equivalents
  private importMap = new Map<string, string>();
  
  constructor(private options: TransformOptions = {}) {}
  
  /**
   * Pre-process all HQL imports in the file by transpiling them ahead of time,
   * and creating a mapping of HQL imports to JS imports for later use.
   */
  async preprocessImports(source: string, filePath: string): Promise<void> {
    // When bundling is enabled, skip preprocessing to avoid writing any extra files.
    if (this.options.bundle) {
      if (this.options.verbose) {
        console.log("Bundling mode enabled, skipping HQL import preprocessing.");
      }
      return;
    }
    
    // Simple regex to find potential HQL imports
    // This is just a heuristic - actual macro expansion will handle the real work
    const importRegex = /\(import\s+([^\s)]+)\s+['"]([^'"]+\.hql)['"]\)/g;
    let match;
    
    const sourceDir = dirname(filePath);
    
    while ((match = importRegex.exec(source)) !== null) {
      const importName = match[1];
      const importPath = match[2];
      
      if (this.options.verbose) {
        console.log(`Found potential HQL import: ${importName} from "${importPath}"`);
      }
      
      // Process this import
      await this.processHqlImport(importPath, sourceDir);
    }
  }
  
  /**
   * Processes an HQL import by transpiling the referenced HQL file and recording
   * the mapping from HQL path to JS path.
   * 
   * @param importPath Path to the HQL file being imported
   * @param sourceDir Directory of the file that contains the import
   */
  async processHqlImport(importPath: string, sourceDir: string): Promise<void> {
    // Only process .hql files
    if (!importPath.toLowerCase().endsWith('.hql')) {
      return;
    }
    
    // Resolve the absolute path to the imported HQL file
    const resolvedPath = resolve(sourceDir, importPath);
    
    // Skip if already processed to avoid circular dependencies
    if (this.processedFiles.has(resolvedPath)) {
      return;
    }
    
    // Add to processed files set
    this.processedFiles.add(resolvedPath);
    
    if (this.options.verbose) {
      console.log(`Processing HQL import: "${importPath}" (resolved to "${resolvedPath}")`);
    }
    
    // Check if the file exists
    if (!(await exists(resolvedPath))) {
      throw new Error(`HQL import not found: "${importPath}" (resolved to "${resolvedPath}")`);
    }
    
    // In bundling mode, skip transpiling to disk to avoid extra JS files.
    if (this.options.bundle) {
      if (this.options.verbose) {
        console.log(`Bundling mode enabled, skipping transpile of "${resolvedPath}" to disk.`);
      }
      return;
    }
    
    // Read the imported file to preprocess its imports too
    const importedSource = await readTextFile(resolvedPath);
    
    // Recursively preprocess imports in the imported file
    await this.preprocessImports(importedSource, resolvedPath);
    
    // Determine the output JavaScript path
    const jsOutputPath = this.getJsOutputPath(resolvedPath);
    
    // Transpile the imported HQL file (which writes the JS file to disk)
    await transpileFile(resolvedPath, jsOutputPath, {
      ...this.options,
      // In non-bundled mode, transpile each file normally.
      bundle: false,
      verbose: this.options.verbose === true
    });
    
    // Record the mapping from HQL path to JS path
    this.importMap.set(importPath, this.getRelativeJsImportPath(importPath));
    
    if (this.options.verbose) {
      console.log(`Successfully transpiled import: "${resolvedPath}" -> "${jsOutputPath}"`);
    }
  }
  
  /**
   * Get the JS import path for a given HQL import path, if it exists in our map.
   */
  getJsImportPath(hqlImportPath: string): string | undefined {
    // In bundling mode, we don't write extra files, so return undefined.
    if (this.options.bundle) {
      return undefined;
    }
    return this.importMap.get(hqlImportPath);
  }
  
  /**
   * Get the path to the JavaScript output file for a given HQL file.
   */
  private getJsOutputPath(hqlPath: string): string {
    return hqlPath.replace(/\.hql$/, '.js');
  }
  
  /**
   * Convert an HQL import path to a JS import path.
   */
  private getRelativeJsImportPath(importPath: string): string {
    return importPath.replace(/\.hql$/, '.js');
  }
  
  /**
   * Check if a given path is an HQL file.
   */
  static isHqlFile(path: string): boolean {
    return path.toLowerCase().endsWith('.hql');
  }
}
