# 🔍 Code Indexer MCP Server

> **Intelligent Codebase Search with Vector Embeddings**

Transform your codebase into a searchable knowledge base using state-of-the-art vector embeddings and semantic search.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Qdrant](https://img.shields.io/badge/Qdrant-DC143C?style=flat-square&logo=qdrant&logoColor=white)](https://qdrant.tech/)
[![Ollama](https://img.shields.io/badge/Ollama-000000?style=flat-square&logo=ollama&logoColor=white)](https://ollama.ai/)

## ✨ Features

- 🧠 **Semantic Search** - Natural language code queries
- ⚡ **Real-time Indexing** - Incremental updates with file watching
- 🔧 **MCP Integration** - AI assistant compatibility
- 🛡️ **Production Ready** - Robust error handling and security
- 📁 **Multi-language** - TypeScript, Python, Java, C++, and more
- ☁️ **Flexible Deployment** - Local or cloud Qdrant support

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Ollama with embedding model
- Qdrant (local or cloud)

### Installation

```bash
# Install dependencies
npm install && npm run build

# Setup Ollama model
ollama pull nomic-embed-text:v1.5

# Configure environment
cp .env.example .env
# Edit .env with your Qdrant and Ollama settings

# Start the server
npm start
```

### Basic Configuration

```bash
# Essential settings in .env
QDRANT_URL=https://your-cluster.cloud.qdrant.io:6333
QDRANT_API_KEY=your-api-key
OLLAMA_MODEL=nomic-embed-text:v1.5
EMBEDDING_DIMENSIONS=768
```

## 📖 Usage

### Search Examples

```bash
# Natural language queries
"authentication middleware functions"
"React components for forms"
"error handling patterns"
"database connection setup"
```

### MCP Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `search_code` | Semantic code search | `{"query": "user authentication", "topK": 5}` |
| `index_files` | Index specific files | `{"filePaths": ["./src/auth.ts"]}` |
| `get_status` | Server health check | `{}` |
| `start_watching` | Monitor file changes | `{"directory": "./src"}` |
| `reindex_all` | Full reindexing | `{"directory": "./", "force": true}` |

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QDRANT_URL` | - | Qdrant server URL (required) |
| `QDRANT_API_KEY` | - | Qdrant API key (cloud only) |
| `OLLAMA_MODEL` | `nomic-embed-text:v1.5` | Embedding model |
| `EMBEDDING_DIMENSIONS` | `768` | Vector dimensions |
| `MAX_CONCURRENCY` | `5` | Parallel processing limit |
| `BATCH_SIZE` | `10` | Files per batch |
| `LOG_LEVEL` | `info` | Logging verbosity |
| `COLLECTION_NAME` | `code_index` | Qdrant collection |

### Performance Presets

**High Performance** (16+ GB RAM)

```bash
EMBEDDING_DIMENSIONS=768
MAX_CONCURRENCY=10
BATCH_SIZE=20
```

**Resource Efficient** (4-8 GB RAM)

```bash
EMBEDDING_DIMENSIONS=256
MAX_CONCURRENCY=2
BATCH_SIZE=5
```

### Supported File Types

| Language | Extensions |
|----------|------------|
| JavaScript/TypeScript | `.js`, `.jsx`, `.ts`, `.tsx` |
| Python | `.py`, `.pyx`, `.pyi` |
| Java | `.java` |
| C/C++ | `.c`, `.cpp`, `.h`, `.hpp` |
| Web | `.html`, `.css`, `.scss` |
| Data | `.json`, `.yaml`, `.xml` |
| Docs | `.md`, `.txt`, `.rst` |

## 🏗️ Architecture

```text
CodeIndexerServer (MCP Handler)
├── CodeIndexer (Core Engine)
│   ├── Ollama Client → Embedding Generation
│   ├── Qdrant Client → Vector Storage
│   └── Logger → Structured Logging
├── FileWatcher → Real-time Monitoring
└── ConfigManager → Environment Validation
```

### Data Flow

1. **File Detection** → FileWatcher triggers
2. **Content Processing** → Text extraction and chunking
3. **Embedding Generation** → Ollama creates vectors
4. **Vector Storage** → Qdrant persistence
5. **Semantic Search** → Similarity matching

## 🛡️ Production Deployment

### Security Checklist

- [ ] Use environment variables for credentials
- [ ] Configure HTTPS for cloud Qdrant
- [ ] Set appropriate log levels (`warn` or `error`)
- [ ] Implement monitoring and alerting
- [ ] Configure file permissions properly

### Health Monitoring

```bash
# Test Qdrant connection
curl -X GET "${QDRANT_URL}/collections"

# Test Ollama
curl -X POST "http://localhost:11434/api/embeddings" \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text:v1.5","prompt":"test"}'

# Check server status
curl -X GET "http://localhost:3000/health"
```

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection failed | Check `QDRANT_URL` and network |
| Authentication error | Verify `QDRANT_API_KEY` |
| Model not found | Run `ollama pull <model-name>` |
| Out of memory | Reduce `BATCH_SIZE` and `MAX_CONCURRENCY` |
| Slow indexing | Increase `MAX_CONCURRENCY`, check hardware |

### Debug Mode

```bash
LOG_LEVEL=debug
ENABLE_CONSOLE_LOGGING=true
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes with tests
4. Ensure tests pass: `npm test`
5. Commit changes: `git commit -m 'Add amazing feature'`
6. Push branch: `git push origin feature/amazing-feature`
7. Open Pull Request

### Development Setup

```bash
git clone https://github.com/coderdayton/code-indexer.git
cd code-indexer
npm install
npm run dev
```

## 🎯 Embedding Models

| Model | Dimensions | Use Case |
|-------|------------|----------|
| `nomic-embed-text:v1.5` | 64-768 | **Recommended** - Matryoshka learning |
| `bge-m3:567m` | 1024 | Multilingual, high quality |
| `bge-large-en-v1.5` | 1024 | English-focused |
| `all-MiniLM-L6-v2` | 384 | Lightweight, fast |

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Qdrant](https://qdrant.tech/) - Vector database
- [Ollama](https://ollama.ai/) - Local LLM server
- [Model Context Protocol](https://modelcontextprotocol.io/) - AI integration
- [Nomic AI](https://www.nomic.ai/) - Embedding models

---

**[🐛 Report Bug](https://github.com/coderdayton/code-indexer/issues)** • **[✨ Request Feature](https://github.com/coderdayton/code-indexer/issues)** • **[💬 Discussions](https://github.com/coderdayton/code-indexer/discussions)**

### Made with ❤️ by malu*
