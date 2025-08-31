# 🚀 Code Indexer MCP Server

> **Transform your AI's understanding of code!** 🤖✨

Make any AI model instantly understand your entire codebase with lightning-fast semantic search. No more "find that function" - just ask naturally and get precise results!

## ✨ What Makes This Special?

🧠 **Talk to Your Code** - Ask "find the authentication logic" instead of grep-ing
⚡ **Blazing Fast** - Powered by Ollama embeddings + Qdrant vector magic
🔄 **Live Updates** - Code changes? We've got you covered automatically
🎯 **Zero Setup Hassles** - We fixed all the config headaches for you!
🛡️ **Bulletproof** - Production-ready with comprehensive error handling
🎨 **VS Code Native** - Seamlessly integrates with your workspace

## 🎯 Perfect For

- **AI Pair Programming** - Give your AI assistant superpowers
- **Large Codebases** - Navigate massive projects effortlessly
- **Code Reviews** - Find similar patterns and implementations
- **Documentation** - Auto-discover relevant examples
- **Refactoring** - Locate all usage patterns instantly

## ⚡ Quick Start (3 minutes!)

### What You Need

- Node.js 18+ (check with `node --version`)
- [Ollama](https://ollama.ai) with `nomic-embed-text` model
- [Qdrant](https://qdrant.tech) running (Docker: `docker run -p 6333:6333 qdrant/qdrant`)

### Get Running

```bash
# 1. Clone and install
git clone https://github.com/CoderDayton/code-indexer
cd code-indexer
npm install

# 2. Copy the example config (we made this super easy!)
cp .env.example .env

# 3. Start your engines
npm run build && npm start
```

### 🔧 Quick Config

Your `.env` file is pre-configured with sensible defaults:

```env
# Already set up for local development!
QDRANT_URL=http://localhost:6333
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=nomic-embed-text:latest
COLLECTION_NAME=code_index
# BASE_DIRECTORY=auto-detected!
```

## 🎮 Available Commands

Once running, your AI can use these tools:

| Tool | What it does | Example |
|------|-------------|---------|
| `index_files` | Index specific files/folders | "Index my `src/` directory" |
| `search_code` | Find code semantically | "Find JWT validation logic" |
| `reindex_all` | Refresh everything | "Reindex after big refactor" |
| `start_watching` | Auto-update on changes | "Watch for file changes" |
| `get_status` | Check what's indexed | "Show indexing status" |

## 🏗️ What We Fixed For You

> **Fresh & Clean!** This version has been completely reorganized for maximum clarity.

✅ **Unified Config System** - No more scattered config files
✅ **Rock-Solid Validation** - Zod schemas catch config errors early
✅ **Clean Architecture** - Easy to understand and extend
✅ **Comprehensive Tests** - Everything is tested and verified
✅ **Zero Legacy Cruft** - Removed all the old, confusing files
✅ **Better Error Messages** - Actually helpful when things go wrong

## 🛠️ Development Mode

```bash
npm run dev     # Hot reload during development
npm test        # Run the test suite
npm run build   # Create production build
```

## 🏛️ Architecture Overview

```text
🎯 MCP Server     ➜  Talks to AI models
🧠 Code Indexer  ➜  Processes your files
🔍 Vector Store  ➜  Qdrant similarity search
👁️ File Watcher  ➜  Keeps everything fresh
⚙️ Config System ➜  Zod-validated settings
```

## 🐛 Troubleshooting

**"Connection refused"** → Check if Qdrant/Ollama are running
**"Model not found"** → Run `ollama pull nomic-embed-text`
**"Permission denied"** → Make sure BASE_DIRECTORY is readable
**Still stuck?** → Check the logs in `./logs/` directory

## 🎉 What's Next?

- 🔌 **VS Code Extension** - Direct integration coming soon
- 🌐 **Web UI** - Browse your indexed code visually
- 🔄 **Git Integration** - Index only changed files on commits
- 📊 **Analytics** - See what code patterns are most queried

## 📜 License

MIT License - Build amazing things! 🚀

---

### Made with ❤️ by malu

> 💡 **Pro tip**: Try asking your AI "show me all error handling patterns" after indexing - you'll be amazed!
