# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that generates note titles using AI (OpenAI or Fireworks AI) based on note content. The plugin provides multiple ways to generate titles: command palette, editor menu, and file menu (single/bulk).

## Development Commands

### Building and Development
- `npm run dev` - Start development build with file watching (uses esbuild)
- `npm run build` - Production build with TypeScript type checking
- `npm run typecheck` - Run TypeScript compiler without emitting files
- `npm run lint` - Run ESLint on all files
- `npm run format` - Check code formatting with Prettier

### Version Management
- `npm run version` - Bump version in manifest.json and versions.json, then stage files

## Architecture

### Core Structure
- **Single file plugin**: All functionality in `main.ts` (468 lines)
- **Settings-based**: Configurable AI providers (OpenAI/Fireworks), models, and custom prompts
- **Multi-provider AI**: Supports both OpenAI (Chat Completions and legacy Completions) and Fireworks AI (Responses API)

### Key Components

**TitleGeneratorPlugin** (main class):
- `generateTitle()` - Core title generation with status bar feedback
- `callOpenAI()` - OpenAI API integration with model detection for endpoint selection
- `callFireworks()` - Fireworks AI integration using Responses API with store=false
- `renderPrompt()` - Template substitution for `{{content}}` placeholder

**TitleGeneratorSettingTab**:
- Dynamic UI that shows/hides provider-specific settings
- Prompt presets system with 5 built-in presets (kebab-case, Title Case, CamelCase, etc.)
- Live prompt editing with template validation

**Integration Points**:
- Command palette integration for active notes
- Editor menu integration for current note
- File menu integration for single/bulk title generation
- Uses `p-map` for controlled concurrency in bulk operations

### AI Provider Architecture
- Provider abstraction supports switching between OpenAI and Fireworks
- OpenAI: Auto-detects model type to use appropriate endpoint (Completions vs Chat Completions)
- Fireworks: Uses Responses API with explicit `store=false` for privacy
- Both providers use identical prompt templating and response processing

### File Operations
- Uses Obsidian's `fileManager.renameFile()` for atomic title changes
- Handles invalid filename characters and quote stripping
- Path parsing preserves directory structure and file extensions

## Dependencies

**Runtime**:
- `openai` - OpenAI API client
- `p-map` - Controlled concurrency for bulk operations
- `path-browserify` - Cross-platform path handling

**Build Tools**:
- ESBuild for fast compilation and bundling
- TypeScript with strict settings
- ESLint with Airbnb config
- Prettier for formatting
- Husky for git hooks