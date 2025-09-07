# HLVM Platform Specification

## Overview

HLVM (High-Level Virtual Machine) is an all-in-one development platform that combines language execution, AI assistance, and persistence in a single binary.

## Platform Architecture

### Core Components

```
HLVM Platform Binary (~150-200MB)
├── Deno Runtime (JavaScript/TypeScript execution)
├── Ollama Engine (LLM inference)
├── HQL Transpiler (Lisp → JavaScript)
├── SQLite Database (Persistence)
└── HLVM Stdlib (High-level APIs)
```

### System Architecture

```
┌─────────────────────────────────────────────────┐
│                 HLVM Platform                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │          Input Router & Evaluator         │  │
│  │  Handles: Commands, HQL, JavaScript, AI   │  │
│  └───────────────────────────────────────────┘  │
│                      ↓                          │
│  ┌───────────────────────────────────────────┐  │
│  │            Execution Engine               │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐ │  │
│  │  │  Deno   │  │ Ollama  │  │  SQLite  │ │  │
│  │  │ Runtime │  │  API    │  │    DB    │ │  │
│  │  └─────────┘  └─────────┘  └──────────┘ │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Platform Features

### 1. Unified Command Interface

```bash
# Start interactive REPL
$ hlvm

# Run files
$ hlvm run script.hql
$ hlvm run app.js

# Direct evaluation
$ hlvm eval "(+ 1 2)"

# AI interaction
$ hlvm chat "explain recursion"

# Server mode
$ hlvm serve --port 8080
```

### 2. Multi-Language Support

The platform natively supports three interaction modes:

- **HQL**: Lisp-like functional programming
- **JavaScript/TypeScript**: Full Deno compatibility
- **Natural Language**: AI-powered assistance

### 3. Integrated AI Assistant

```
hlvm> @ai "create a REST API"
hlvm> @explain <code>
hlvm> @optimize <function>
hlvm> @debug <error>
```

Ollama runs embedded within the platform, providing:
- Code generation
- Explanation
- Debugging assistance
- Optimization suggestions

### 4. Persistent Module System

```
hlvm> (defn my-func [x] (* x 2))
hlvm> :save my-module
hlvm> :quit

# Later session
hlvm> :load my-module
hlvm> (my-func 21)
42
```

All work is automatically persisted in SQLite:
- Function definitions
- Variable bindings
- Module exports
- REPL history

### 5. HLVM Stdlib

Built-in high-level APIs accessible from any language mode:

```javascript
// JavaScript access
const models = await hlvm.fetchModels();
const response = await hlvm.generate(prompt);

// HQL access
(hlvm/fetch-models)
(hlvm/generate prompt)
```

## Platform Specifications

### Binary Distribution

| Platform | Architecture | Size | Filename |
|----------|-------------|------|----------|
| macOS | ARM64 | ~180MB | hlvm-darwin-arm64 |
| macOS | x64 | ~180MB | hlvm-darwin-x64 |
| Linux | x64 | ~175MB | hlvm-linux-x64 |
| Linux | ARM64 | ~175MB | hlvm-linux-arm64 |
| Windows | x64 | ~185MB | hlvm-windows-x64.exe |

### Performance Targets

- Startup time: < 500ms
- First evaluation: < 50ms
- AI response time: < 2s (model dependent)
- Memory usage: < 500MB idle
- Binary size: < 200MB compressed

### System Requirements

- **OS**: macOS 12+, Linux (glibc 2.31+), Windows 10+
- **RAM**: 4GB minimum, 8GB recommended
- **Disk**: 500MB for binary + models
- **Network**: Required for AI model downloads

## Integration Points

### macOS Application Compatibility

HLVM platform serves as the backend for the macOS GUI application:

```
HLVM.app → spawns → hlvm binary
                         ↓
                   Stdio communication
                         ↓
                   Same APIs/ports
```

### File System Structure

```
~/.hlvm/
├── hlvm.db          # SQLite database
├── models/          # Ollama models
│   ├── llama2/
│   ├── codellama/
│   └── mistral/
├── modules/         # User modules
├── history.txt      # REPL history
└── config.json      # Configuration
```

### Network Architecture

- Ollama API: `localhost:11434`
- HLVM Server: Configurable port
- WebSocket: For streaming responses

## Platform Commands

### REPL Commands

| Command | Description |
|---------|-------------|
| `:help` | Show all commands |
| `:ls` | List current definitions |
| `:modules` | Show all modules |
| `:save <name>` | Save current work |
| `:load <file>` | Load file or module |
| `:reset` | Reset environment |
| `:models` | List AI models |
| `:quit` | Exit REPL |

### AI Commands

| Command | Description |
|---------|-------------|
| `@ai <prompt>` | General AI assistance |
| `@explain <code>` | Explain code |
| `@optimize <code>` | Optimize code |
| `@debug <error>` | Debug assistance |
| `@generate <spec>` | Generate code from spec |

## Development Workflow

### Example Session

```bash
$ hlvm
hlvm> (import "web")
hlvm> (defn api-handler [req]
        {:status 200 :body "Hello"})
hlvm> @ai "add JSON response to api-handler"
hlvm> :test api-handler
hlvm> :save my-api
hlvm> :deploy my-api
Generated: my-api.js (standalone bundle)
```

### Cross-Platform Development

```bash
# Develop on Mac
mac$ hlvm develop app.hql

# Test on Linux
linux$ hlvm test app.hql

# Deploy on Windows
windows> hlvm build app.hql --target windows
```

## Platform Benefits

1. **Zero Configuration**: No setup required
2. **All-Inclusive**: Everything in one binary
3. **Cross-Platform**: Identical behavior everywhere
4. **AI-Native**: Built-in AI assistance
5. **Persistent**: Work saved automatically
6. **Compatible**: Works with existing JavaScript ecosystem

## Future Roadmap

### v2.0 (Current)
- Single binary distribution
- Basic AI integration
- Local persistence

### v3.0 (Planned)
- Cloud sync
- Collaborative features
- Extended AI models
- Plugin system

### v4.0 (Vision)
- Distributed execution
- Mobile support
- Browser runtime
- Enterprise features

## Conclusion

HLVM Platform represents a fundamental shift in development tools - from fragmented toolchains to a unified platform. It's not just another tool; it's a complete development environment in a single binary.