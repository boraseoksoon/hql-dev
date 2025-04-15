// src/repl/persistent-state-manager.ts
// Manages persistent state for the REPL across sessions

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { formatErrorMessage } from "../../core/src/common/common-utils.ts";
import { Logger, globalLogger as logger } from "@core/logger.ts";

// State file name (will be stored directly in the repl directory)
const STATE_FILE = "repl-state.json";
const VERSION = "1.0.0";

// Default module name
const DEFAULT_MODULE = "global";

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
  metadata?: Record<string, any>;
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
    this.logger = logger;
    
    // Initialize state directory
    try {
      // Find the repl directory first
      const replDir = this.findReplDirectory();
      
      if (replDir) {
        // Use the repl directory for state storage
        this.stateDir = replDir;
        this.statePath = path.join(replDir, STATE_FILE);
        this.projectStatePath = this.statePath; // Same as statePath when using repl dir
        this.logger.debug(`Using repl directory for state storage: ${replDir}`);
        this.logger.debug(`State file path: ${this.statePath}`);
      } else {
        // Fall back to user home directory if repl directory not found
        const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
        this.stateDir = homeDir;
        this.statePath = path.join(homeDir, STATE_FILE);
        this.projectStatePath = null;
        this.logger.debug(`Repl directory not found, using home directory: ${homeDir}`);
        this.logger.debug(`State file path: ${this.statePath}`);
      }
    } catch (e) {
      // Fallback to current directory if environment variables are not accessible
      this.stateDir = ".";
      this.statePath = STATE_FILE;
      this.projectStatePath = null;
      this.logger.debug(`Error accessing home directory, using current directory for state storage`);
      this.logger.debug(`State file path: ${this.statePath}`);
    }
    
    // Initialize empty state
    this.currentState = this.createEmptyState();
  }
  
  /**
   * Find the repl directory in the project
   */
  private findReplDirectory(): string | null {
    try {
      // First, detect current directory
      let currentDir = Deno.cwd();
      this.logger.debug(`Current working directory: ${currentDir}`);
      
      // If we're in the repl directory or one of its subdirectories
      if (currentDir.includes('/repl')) {
        // Find the repl directory
        const parts = currentDir.split('/');
        let replIndex = -1;
        
        for (let i = parts.length - 1; i >= 0; i--) {
          if (parts[i] === 'repl') {
            replIndex = i;
            break;
          }
        }
        
        if (replIndex >= 0) {
          // Use the repl directory as the project dir for persistence
          const replDir = parts.slice(0, replIndex + 1).join('/');
          
          try {
            const stat = Deno.statSync(replDir);
            if (stat.isDirectory) {
              this.logger.debug(`Found repl directory at: ${replDir}`);
              return replDir;  // Return the repl directory specifically
            }
          } catch (e) {
            this.logger.debug(`Error checking repl directory: ${e}`);
            // Not a valid directory, return null
          }
        }
      } else {
        this.logger.debug("Current directory does not include '/repl', cannot find repl directory");
      }
      
      return null;
    } catch (error: unknown) {
      const errorMessage = formatErrorMessage(error);
      this.logger.debug(`Error finding repl directory: ${errorMessage}`);
      return null;
    }
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
          exports: [],
          metadata: {}
        }
      },
      history: []
    };
  }
  
  /**
   * Clean up any user modules and redirect to global
   * This should be called once during initialization
   */
  cleanupLegacyModules(): void {
    if (!this.initialized) return;
    
    // Check if "user" module somehow exists
    if ("user" in this.currentState.modules) {
      this.logger.debug(`Found "user" module, migrating to "global"`);
      
      // If both exist, merge user into global
      if ("global" in this.currentState.modules) {
        // Merge definitions
        for (const type of ['variables', 'functions', 'macros'] as const) {
          this.currentState.modules.global.definitions[type] = {
            ...this.currentState.modules.global.definitions[type],
            ...this.currentState.modules.user.definitions[type]
          };
        }
        
        // Merge imports and exports (avoiding duplicates)
        const addUniqueItems = (target: string[], source: string[]) => {
          for (const item of source) {
            if (!target.includes(item)) {
              target.push(item);
            }
          }
        };
        
        addUniqueItems(this.currentState.modules.global.imports, this.currentState.modules.user.imports);
        addUniqueItems(this.currentState.modules.global.exports, this.currentState.modules.user.exports);
      } else {
        // Just rename user to global
        this.currentState.modules.global = this.currentState.modules.user;
      }
      
      // Remove the user module
      delete this.currentState.modules.user;
      
      // Update last module if it was set to "user"
      if (this.currentState.lastModule === "user") {
        this.currentState.lastModule = "global";
      }
      
      // Save changes
      this.saveState(true);
    }
  }
  
  /**
   * Initialize the state storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.logger.debug("Initializing state storage...");
      
      // Check if we have write permissions to the directory
      try {
        const testFilePath = path.join(this.stateDir, ".write-test");
        await Deno.writeTextFile(testFilePath, "Test write permission");
        await Deno.remove(testFilePath);
        this.logger.debug(`Write permission test passed for ${this.stateDir}`);
      } catch (e) {
        this.logger.error(`No write permission to directory ${this.stateDir}: ${formatErrorMessage(e)}`);
        
        // Try to fall back to current directory
        this.stateDir = ".";
        this.statePath = STATE_FILE;
        this.projectStatePath = this.statePath;
        this.logger.debug(`Falling back to current directory for state storage: ${Deno.cwd()}`);
      }
      
      // Ensure state directory exists
      if (this.projectStatePath) {
        await ensureDir(this.stateDir);
        this.logger.debug(`Ensured directory exists: ${this.stateDir}`);
      } else {
        await ensureDir(this.stateDir);
        this.logger.debug(`Ensured directory exists: ${this.stateDir}`);
      }
      
      // Check if state file exists
      const hasProjectState = this.projectStatePath && await exists(this.projectStatePath);
      const hasGlobalState = await exists(this.statePath);
      
      this.logger.debug(`Project state file exists: ${hasProjectState}`);
      this.logger.debug(`Global state file exists: ${hasGlobalState}`);
      
      // Load the appropriate state file
      if (hasProjectState) {
        this.logger.debug(`Loading REPL state from ${this.projectStatePath}`);
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
      
      // Make sure we clean up any stray "user" modules
      this.cleanupLegacyModules();
      
      // Create a test entry and save immediately to verify storage is working
      const moduleState = this.getCurrentModuleState();
      moduleState.metadata = moduleState.metadata || {};
      moduleState.metadata.lastInitialized = new Date().toISOString();
      this.saveState(true);
      
    } catch (error: unknown) {
      const errorMessage = formatErrorMessage(error);
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
      
      // Handle module migration from "user" to "global" 
      if (loadedState.modules.user) {
        this.logger.debug(`Migrating "user" module to "global"`);
        
        // If both exist, merge user into global
        if (loadedState.modules.global) {
          // Merge definitions
          for (const type of ['variables', 'functions', 'macros'] as const) {
            loadedState.modules.global.definitions[type] = {
              ...loadedState.modules.global.definitions[type],
              ...loadedState.modules.user.definitions[type]
            };
          }
          
          // Merge imports and exports (avoiding duplicates)
          const addUniqueItems = (target: string[], source: string[]) => {
            for (const item of source) {
              if (!target.includes(item)) {
                target.push(item);
              }
            }
          };
          
          addUniqueItems(loadedState.modules.global.imports, loadedState.modules.user.imports);
          addUniqueItems(loadedState.modules.global.exports, loadedState.modules.user.exports);
        } else {
          // Just rename user to global
          loadedState.modules.global = loadedState.modules.user;
        }
        
        // Remove the user module
        delete loadedState.modules.user;
        
        // Update last module if it was set to "user"
        if (loadedState.lastModule === "user") {
          loadedState.lastModule = "global";
        }
      }
      
      this.currentState = loadedState;
      this.logger.debug(`Loaded state with ${Object.keys(loadedState.modules).length} modules`);
    } catch (error: unknown) {
      const errorMessage = formatErrorMessage(error);
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
      
      // Determine where to save - always prefer the repl directory if available
      const savePath = this.projectStatePath || this.statePath;
      
      this.logger.debug(`Attempting to save state to: ${savePath}`);
      
      // Ensure the directory exists
      await ensureDir(this.stateDir);
      
      // Write to file
      await Deno.writeTextFile(savePath, json);
      
      // Verify file was written
      try {
        const stat = await Deno.stat(savePath);
        this.logger.debug(`Saved REPL state to ${savePath} (${stat.size} bytes)`);
      } catch (e) {
        this.logger.error(`Failed to verify state file was written: ${formatErrorMessage(e)}`);
      }
      
      this.changed = false;
    } catch (error: unknown) {
      const errorMessage = formatErrorMessage(error);
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
    
    // Redirect "user" to "global" for backward compatibility
    if (moduleName === "user") {
      moduleName = "global";
      this.logger.debug(`Redirecting "user" module to "global"`);
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
        exports: [],
        metadata: {}
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
        // For arrays, recursively make elements serializable (limited depth?)
        // For now, keep as is, assuming arrays aren't excessively deep/complex.
        return value.map(item => this.makeSerializable(item));
      } 
      
      // --- Add Check for Complex Objects ---
      // If it's an object but not a plain Array, store a placeholder 
      // to avoid deep serialization issues with external modules like express.
      // This is a heuristic; might need refinement.
      else {
        // Return a simple placeholder instead of recursing
        return { _type: "external_object", representation: "[External Object]" };
        /* // Original recursive serialization for objects:
        const result: Record<string, any> = {};
        for (const [key, propValue] of Object.entries(value)) {
          if (key.startsWith('_')) continue; // Skip private properties
          result[key] = this.makeSerializable(propValue);
        }
        return result;
        */
      }
      // --- End Check ---
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

  /**
   * Reset all modules or keep only the structure
   * @param keepModules If true, keep module structure but clear all definitions
   */
  resetAllModules(keepModules = false): void {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    if (keepModules) {
      // Keep modules but clear their contents
      const currentModuleName = this.currentState.lastModule;
      
      // Iterate through all modules and clear their definitions
      for (const moduleName of Object.keys(this.currentState.modules)) {
        this.currentState.modules[moduleName] = {
          definitions: {
            variables: {},
            functions: {},
            macros: {}
          },
          imports: [],
          exports: [],
          metadata: {}
        };
      }
      
      // Make sure we're still in the same module
      this.currentState.lastModule = currentModuleName;
    } else {
      // Reset to a completely clean state with only the default module
      this.currentState = this.createEmptyState();
    }
    
    // Save the changes
    this.saveState(true);
    this.logger.debug(`Reset ${keepModules ? 'all module contents' : 'everything to default state'}`);
  }

  /**
   * Add metadata to the current module
   */
  addModuleMetadata(key: string, value: any): void {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    const moduleState = this.getCurrentModuleState();
    
    // Initialize metadata object if needed
    if (!moduleState.metadata) {
      moduleState.metadata = {};
    }
    
    // If the key already exists as an array, append to the array
    if (Array.isArray(moduleState.metadata[key])) {
      moduleState.metadata[key].push(value);
    } 
    // If key exists but is not an array, convert to array with both values
    else if (key in moduleState.metadata) {
      moduleState.metadata[key] = [moduleState.metadata[key], value];
    }
    // Otherwise, set as a new value
    else {
      moduleState.metadata[key] = [value];
    }
    
    this.saveState();
    this.logger.debug(`Added metadata '${key}' to module '${this.currentState.lastModule}'`);
  }

  /**
   * Get metadata from a module
   */
  getModuleMetadata(moduleName: string, key: string): any {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    const moduleState = this.getModuleState(moduleName);
    if (!moduleState || !moduleState.metadata) {
      return null;
    }
    
    return moduleState.metadata[key];
  }

  /**
   * Clear a specific metadata key from a module
   */
  clearModuleMetadata(moduleName: string, key: string): boolean {
    if (!this.initialized) {
      throw new Error("State manager not initialized");
    }
    
    const moduleState = this.getModuleState(moduleName);
    if (!moduleState || !moduleState.metadata || !(key in moduleState.metadata)) {
      return false;
    }
    
    delete moduleState.metadata[key];
    this.saveState();
    this.logger.debug(`Cleared metadata '${key}' from module '${moduleName}'`);
    return true;
  }
}

// Export a singleton instance for global use
export const persistentStateManager = new PersistentStateManager(); 