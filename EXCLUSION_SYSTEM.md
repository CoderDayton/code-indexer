# Advanced Exclusion System

This document describes the advanced exclusion system implemented for the Code Indexer, which provides sophisticated file and folder filtering capabilities during indexing operations.

## Overview

The exclusion system allows you to specify which files and folders should be excluded from indexing using a comprehensive configuration file. This system supports multiple types of exclusion patterns and provides better control than simple glob patterns.

## Configuration File

The exclusion configuration is stored in `indexer-exclusions.json` by default. You can specify a different path using the `EXCLUSION_CONFIG_PATH` environment variable.

### Configuration Structure

```json
{
  "exclusions": {
    "folders": {
      "patterns": ["node_modules/**", ".git/**", "dist/**"]
    },
    "files": {
      "patterns": ["*.log", "*.tmp", "package-lock.json"]
    },
    "extensions": {
      "patterns": ["log", "tmp", "cache"]
    },
    "exact_names": {
      "patterns": [".DS_Store", "Thumbs.db"]
    },
    "size_limits": {
      "max_file_size_mb": 50,
      "max_file_size_bytes": 52428800
    },
    "content_based": {
      "binary_files": true,
      "empty_files": false,
      "minified_files": true
    }
  },
  "inclusion_overrides": {
    "patterns": ["README.*", "LICENSE*", "*.md"]
  },
  "language_specific": {
    "javascript": {
      "folders": ["node_modules/**", ".next/**"],
      "files": ["*.min.js", "package-lock.json"]
    }
  },
  "custom_rules": {
    "exclude_test_files": false,
    "exclude_documentation": false,
    "exclude_config_files": false,
    "exclude_sample_data": true
  }
}
```

## Environment Variables

- `USE_ADVANCED_EXCLUSIONS`: Enable/disable the advanced exclusion system (default: true)
- `EXCLUSION_CONFIG_PATH`: Path to the exclusion configuration file (default: "indexer-exclusions.json")
- `IGNORE_PATTERNS`: Fallback comma-separated patterns for legacy compatibility

## Exclusion Types

### 1. Folder Patterns
Exclude entire directories and their contents:
```json
"folders": {
  "patterns": [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "build/**",
    "coverage/**"
  ]
}
```

### 2. File Patterns
Exclude specific files using glob patterns:
```json
"files": {
  "patterns": [
    "*.log",
    "*.tmp",
    "*.min.js",
    "package-lock.json",
    "yarn.lock"
  ]
}
```

### 3. Extension Patterns
Exclude files by extension (without the dot):
```json
"extensions": {
  "patterns": ["log", "tmp", "cache", "bak"]
}
```

### 4. Exact Name Matches
Exclude files with exact names:
```json
"exact_names": {
  "patterns": [".DS_Store", "Thumbs.db", "desktop.ini"]
}
```

### 5. Size Limits
Exclude files larger than specified size:
```json
"size_limits": {
  "max_file_size_mb": 50,
  "max_file_size_bytes": 52428800
}
```

### 6. Content-Based Rules
Exclude based on file content characteristics:
```json
"content_based": {
  "binary_files": true,
  "empty_files": false,
  "minified_files": true
}
```

## Inclusion Overrides

Files matching inclusion override patterns will be indexed even if they match exclusion rules:

```json
"inclusion_overrides": {
  "patterns": [
    "README.*",
    "LICENSE*",
    "CHANGELOG.*",
    "*.md",
    "Dockerfile*"
  ]
}
```

## Language-Specific Exclusions

Define exclusions specific to programming languages:

```json
"language_specific": {
  "javascript": {
    "folders": ["node_modules/**", ".next/**"],
    "files": ["*.min.js", "package-lock.json"]
  },
  "python": {
    "folders": ["__pycache__/**", ".venv/**"],
    "files": ["*.pyc", "Pipfile.lock"]
  }
}
```

## Custom Rules

Enable/disable specific exclusion behaviors:

```json
"custom_rules": {
  "exclude_test_files": false,
  "exclude_documentation": false,
  "exclude_config_files": false,
  "exclude_sample_data": true
}
```

## Pattern Syntax

The system supports glob-style patterns:

- `*` - Matches any characters except `/`
- `**` - Matches any number of directories
- `?` - Matches any single character
- `[abc]` - Matches any character in brackets
- `*.ext` - Matches files with specific extension

## Error Handling

The system includes comprehensive error handling:

1. **Missing Configuration File**: Falls back to default patterns
2. **Invalid JSON**: Uses default configuration and logs error
3. **Invalid Patterns**: Skips invalid patterns and continues with valid ones
4. **File Access Errors**: Gracefully handles permission issues

## Backward Compatibility

The system maintains backward compatibility with the existing `IGNORE_PATTERNS` environment variable. If advanced exclusions are disabled, the system falls back to the legacy glob-based approach.

## Integration

The exclusion system is automatically integrated into:

- File indexing operations
- Directory scanning
- File watching
- Incremental indexing

## Performance

The system is designed for performance:

- Patterns are validated once at startup
- File matching uses efficient regex operations
- Directory traversal respects exclusion rules to avoid unnecessary I/O
- Caching of compiled patterns for repeated use

## Troubleshooting

### Common Issues

1. **Configuration not loading**: Check file path and permissions
2. **Patterns not working**: Verify pattern syntax and test with validation
3. **Performance issues**: Review pattern complexity and file system structure

### Debugging

Enable debug logging to see exclusion decisions:
```bash
LOG_LEVEL=debug npm start
```

### Testing

Use the provided test script to verify configuration:
```bash
node test-exclusions.js
```

## Examples

### Basic Web Project
```json
{
  "exclusions": {
    "folders": {
      "patterns": ["node_modules/**", "dist/**", ".next/**"]
    },
    "files": {
      "patterns": ["*.log", "*.map", "package-lock.json"]
    }
  }
}
```

### Python Project
```json
{
  "exclusions": {
    "folders": {
      "patterns": ["__pycache__/**", ".venv/**", "venv/**"]
    },
    "files": {
      "patterns": ["*.pyc", "*.pyo", "Pipfile.lock"]
    }
  }
}
```

### Multi-Language Project
```json
{
  "exclusions": {
    "folders": {
      "patterns": ["node_modules/**", "__pycache__/**", "target/**"]
    },
    "language_specific": {
      "javascript": {
        "files": ["*.min.js", "yarn.lock"]
      },
      "python": {
        "files": ["*.pyc"]
      },
      "rust": {
        "folders": ["target/**"]
      }
    }
  }
}
```
