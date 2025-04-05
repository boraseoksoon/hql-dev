// src/repl/persistent-state-manager.ts
// Manages persistent state for the REPL across sessions

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { Logger } from "../logger.ts";
import { Value } from "../environment.ts";

// Base directory for REPL persistence
const REPL_STATE_DIR = ".hql-repl";
const STATE_FILE = "state.json";
const VERSION = "1.0.0";

// Default module name
const DEFAULT_MODULE = "user";

// Interface for module definitions
export interface ModuleDefinitions {
  variables: Record<string, any>;
  functions: Record<string, any>;
  macros: Record<string, any>;
}

// Interface for module metadata
export interface ModuleState {
  definitions: ModuleDefinitions;
  imports: string[];
  exports: string[];
}

// Interface for persistent REPL state
export interface PersistentState {
  version: string;
  lastModule: string;
  modules: Record<string, ModuleState>;
  history: string[];
}

/**
 * Manages the persistence of REPL state across sessions
 */
export class PersistentStateManager {
  private logger: Logger;
  private stateDir: string;
  private statePath: string;
  private projectStatePath: string | null = null;
  private currentState: PersistentState;
  private saveDebounceTimer: number | null = null;
  private initialized = false;
  private changed = false;
  
  constructor(options: { verbose?: boolean } = {}) {
    this.logger = new Logger(options.verbose ?? false);
    
    // Initialize state directory
    try {
      const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
      this.stateDir = path.join(homeDir, REPL_STATE_DIR);
      this.statePath = path.join(this.stateDir, STATE_FILE);
      
      // Check if we're in a project directory (has deno.json)
      const projectDir = this.detectProjectDirectory();
      if (projectDir) {
        this.projectStatePath = path.join(projectDir, REPL_STATE_DIR, STATE_FILE);
      }
    } catch (e) {
      // Fallback to current directory if environment variables are not accessible
      this.stateDir = REPL_STATE_DIR;
      this.statePath = path.join(REPL_STATE_DIR, STATE_FILE);
    }
    
    // Initialize empty state
    this.currentState = this.createEmptyState();
  }
  
  /**
   * Detect if we're in a project directory
   */
  private detectProjectDirectory(): string | null {
    try {
      let currentDir = Deno.cwd();
      const maxLevels = 5; // Limit how far up we'll look
      
      for (let i = 0; i < maxLevels; i++) {
        // Check for project markers - we can't use await in a constructor,
        // so we're doing a simple sync check for now
        if (
          Deno.statSync(path.join(currentDir, "deno.json")).isFile ||
          Deno.statSync(path.join(currentDir, "deno.jsonc")).isFile ||
          Deno.statSync(path.join(currentDir, "package.json")).isFile
        ) {
          return currentDir;
        }
        
        // Go up one directory level
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // We've reached the root
        currentDir = parentDir;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Error detecting project directory: ${errorMessage}`);
    }
    
    return null;
  }
  
  /**
   * Create an empty state object
   */
  private createEmptyState(): PersistentState {
    return {
      version: VERSION,
      lastModule: DEFAULT_MODULE,
      modules: {
        [DEFAULT_MODULE]: {
          definitions: {
            variables: {},
            functions: {},
            macros: {}
          },
          imports: [],
          exports: []
        }
      },
      history: []
    };
  }
  
  /**
   * Initialize the state storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Ensure state directory exists
      if (this.projectStatePath) {
        await ensureDir(path.dirname(this.projectStatePath));
      } else {
        await ensureDir(this.stateDir);
      }
      
      // Check if we have project-specific state
      const hasProjectState = this.projectStatePath && await exists(this.projectStatePath);
      const hasGlobalState = await exists(this.statePath);
      
      // Load the appropriate state file
      if (hasProjectState) {
        this.logger.debug(`Loading project-specific state from ${this.projectStatePath}`);
        await this.loadStateFromFile(this.projectStatePath!);
      } 
      // Fall back to global state
      else if (hasGlobalState) {
        this.logger.debug(`Loading global state from ${this.statePath}`);
        await this.loadStateFromFile(this.statePath);
      } 
      // No existing state, use empty state
      else {
        this.logger.debug("No existing state found, using empty state");
        this.currentState = this.createEmptyState();
      }
      
      this.initialized = true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error initializing state: ${errorMessage}`);
      // Fall back to empty state in case of error
      this.currentState = this.createEmptyState();
      this.initialized = true;
    }
  }
  
  /**
   * Load state from file
   */
  private async loadStateFromFile(filePath: string): Promise<void> {
    try {
      const content = await Deno.readTextFile(filePath);
      const loadedState = JSON.parse(content) as PersistentState;
      
      // Version compatibility check
      if (loadedState.version !== VERSION) {
        this.logger.warn(`State version mismatch. Found ${loadedState.version}, expected ${VERSION}`);
        // Basic migration - keep structure but add any missing fields
        loadedState.version = VERSION;
      }
      
      this.currentState = loadedState;
      this.logger.debug(`Loaded state with ${Object.keys(loadedState.modules).length} modules`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error loading state from ${filePath}: ${errorMessage}`);
      this.currentState = this.createEmptyState();
    }
  }
  
  /**
   * Save state to file with debouncing
   */
  private saveState(immediate = false): void {
    if (!this.initialized) return;
    
    // Cancel any pending save
    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    
    // Mark state as changed
    this.changed = true;
    
    // If immediate, save now
    if (immediate) {
      this.doSaveState();
      return;
    }
    
    // Otherwise debounce
    this.saveDebounceTimer = setTimeout(() => {
      this.doSaveState();
    }, 300);
  }
  
  /**
   * Actually perform the save operation
   */
  private async doSaveState(): Promise<void> {
    if (!this.changed) return;
    
    try {
      const json = JSON.stringify(this.currentState, null, 2);
      
      // Determine where to save
      const savePath = this.projectStatePath || this.statePath;
      
      // Ensure the directory exists
      await ensureDir(path.dirname(savePath));
      
      // Write to file
      await Deno.writeTextFile(savePath, json);
      
      this.logger.debug(`Saved state to ${savePath}`);
      this.changed = false;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error saving state: ${errorMessage}`);
    }
  }
  
  /**
   * Get the current active module name
   */
  getCurrentModule(): string {
    return this.currentState.lastModule;
  }
  
  /**
   * Switch to a different module or create it if it doesn't exist
   */
  switchToModule(moduleName: string): void {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    // Create the module if it doesn't exist
    if (!this.currentState.modules[moduleName]) {
      this.currentState.modules[moduleName] = {
        definitions: {
          variables: {},
          functions: {},
          macros: {}
        },
        imports: [],
        exports: []
      };
      this.logger.debug(`Created new module: ${moduleName}`);
    }
    
    this.currentState.lastModule = moduleName;
    this.saveState();
    this.logger.debug(`Switched to module: ${moduleName}`);
  }
  
  /**
   * Get the current module's state
   */
  getCurrentModuleState(): ModuleState {
    const moduleName = this.currentState.lastModule;
    
    // Ensure the module exists
    if (!this.currentState.modules[moduleName]) {
      this.switchToModule(DEFAULT_MODULE);
      return this.currentState.modules[DEFAULT_MODULE];
    }
    
    return this.currentState.modules[moduleName];
  }
  
  /**
   * Get all available module names
   */
  getModuleNames(): string[] {
    return Object.keys(this.currentState.modules);
  }
  
  /**
   * Get a specific module's state
   */
  getModuleState(moduleName: string): ModuleState | null {
    return this.currentState.modules[moduleName] || null;
  }
  
  /**
   * Add a definition to the current module
   */
  addDefinition(
    name: string, 
    value: any, 
    type: 'variable' | 'function' | 'macro' = 'variable',
    metadata?: Record<string, any>
  ): void {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    const moduleState = this.getCurrentModuleState();
    const targetCollection = moduleState.definitions[`${type}s`];
    
    // Store a serializable version of the value
    const serializableValue = this.makeSerializable(value);
    
    // Add metadata if provided
    if (metadata) {
      targetCollection[name] = {
        ...serializableValue,
        _metadata: metadata  // Store metadata with underscore to indicate it's special
      };
    } else {
      targetCollection[name] = serializableValue;
    }
    
    // Force an immediate save for function definitions
    this.saveState(type === 'function');
    this.logger.debug(`Added ${type} '${name}' to module '${this.currentState.lastModule}'`);
  }
  
  /**
   * Convert a value to a serializable form
   */
  private makeSerializable(value: any): any {
    if (value === null || value === undefined) return value;
    
    if (typeof value === 'function') {
      // For functions, store string representation with source
      try {
        return {
          _type: 'function',
          source: value.toString()
        };
      } catch {
        return {
          _type: 'function',
          source: 'function() { /* Source not available */ }'
        };
      }
    }
    
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        // For arrays, recursively make elements serializable
        return value.map(item => this.makeSerializable(item));
      }
      
      // For objects, recursively make properties serializable
      const result: Record<string, any> = {};
      for (const [key, propValue] of Object.entries(value)) {
        if (key.startsWith('_')) continue; // Skip private properties
        result[key] = this.makeSerializable(propValue);
      }
      return result;
    }
    
    // Primitives can be serialized directly
    return value;
  }
  
  /**
   * Remove a definition from the current module
   */
  removeDefinition(name: string): boolean {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    const moduleState = this.getCurrentModuleState();
    let removed = false;
    
    // Check all definition types
    for (const type of ['variables', 'functions', 'macros'] as const) {
      if (name in moduleState.definitions[type]) {
        delete moduleState.definitions[type][name];
        removed = true;
        this.logger.debug(`Removed ${type.slice(0, -1)} '${name}' from module '${this.currentState.lastModule}'`);
      }
    }
    
    if (removed) {
      this.saveState();
    }
    
    return removed;
  }
  
  /**
   * Remove an entire module
   */
  removeModule(moduleName: string): boolean {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    // Don't allow removing the default module
    if (moduleName === DEFAULT_MODULE) {
      this.logger.warn(`Cannot remove the default module (${DEFAULT_MODULE})`);
      return false;
    }
    
    // Check if the module exists
    if (!this.currentState.modules[moduleName]) {
      return false;
    }
    
    // Remove the module
    delete this.currentState.modules[moduleName];
    
    // If we removed the current module, switch to the default
    if (this.currentState.lastModule === moduleName) {
      this.currentState.lastModule = DEFAULT_MODULE;
    }
    
    this.saveState();
    this.logger.debug(`Removed module '${moduleName}'`);
    return true;
  }
  
  /**
   * Add an import to the current module
   */
  addImport(moduleName: string): void {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    const moduleState = this.getCurrentModuleState();
    
    // Only add if not already imported
    if (!moduleState.imports.includes(moduleName)) {
      moduleState.imports.push(moduleName);
      this.saveState();
      this.logger.debug(`Added import '${moduleName}' to module '${this.currentState.lastModule}'`);
    }
  }
  
  /**
   * Remove an import from the current module
   */
  removeImport(moduleName: string): boolean {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    const moduleState = this.getCurrentModuleState();
    const index = moduleState.imports.indexOf(moduleName);
    
    if (index !== -1) {
      moduleState.imports.splice(index, 1);
      this.saveState();
      this.logger.debug(`Removed import '${moduleName}' from module '${this.currentState.lastModule}'`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Update or set the history entries
   */
  setHistory(history: string[]): void {
    if (!this.initialized) return;
    
    this.currentState.history = [...history];
    this.saveState();
  }
  
  /**
   * Get the history entries
   */
  getHistory(): string[] {
    return [...this.currentState.history];
  }
  
  /**
   * Force an immediate save of the state
   * Used when the application is about to exit
   */
  forceSync(): void {
    if (!this.initialized) return;
    
    // Cancel any pending debounced save
    if (this.saveDebounceTimer !== null) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    
    // Force an immediate save
    this.doSaveState();
  }
}

// Export a singleton instance for global use
export const persistentStateManager = new PersistentStateManager(); 