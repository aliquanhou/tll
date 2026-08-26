# TLL OS Package System Specification

**Version**: 1.1
**Status**: FROZEN (basic)

---

## 1. Overview

TLL has a basic package system for organizing modules and managing dependencies.

---

## 2. Package Manifest (tll.toml)

A package is a directory containing a `tll.toml` file:

```toml
[package]
name = "my-package"
version = "1.0.0"
description = "My TLL package"
main = "src/main.tll"

[dependencies]
"other-package" = "1.0.0"
```

### 2.1 Fields

| Field | Required | Description |
|-------|----------|-------------|
| `package.name` | Yes | Package name (used for import resolution) |
| `package.version` | Yes | Semantic version |
| `package.description` | No | Human-readable description |
| `package.main` | No | Entry file (default: `main.tll` or `index.tll`) |
| `dependencies` | No | Map of package name to version constraint |

---

## 3. Package Resolution

### 3.1 Lookup Order

When importing a bare package name (e.g., `from "mylib" import foo`):

1. Check `./node_modules/mylib/`
2. Check `../node_modules/mylib/`
3. Walk up directory tree checking `node_modules/`
4. Check global package cache
5. If not found: compile error

### 3.2 Entry Resolution

For a package directory:
1. Read `tll.toml` `package.main` field
2. If not present, look for `main.tll` or `index.tll`
3. If not found: compile error

---

## 4. Package Structure

```
my-package/
├── tll.toml
├── src/
│   ├── main.tll
│   └── utils.tll
├── tests/
│   └── test_main.tll
└── README.md
```

---

## 5. Limitations (v1.1)

The package system in v1.1 is basic:

| Feature | Status |
|---------|--------|
| Local packages | Supported |
| Remote packages | Not supported (no registry) |
| Version constraints | Parsed but not enforced |
| Lock file | Not supported |
| Transitive dependencies | Basic resolution |
| Package publishing | Not supported |
| Scoped packages | Not supported |

Remote package registry and full dependency management are planned for future versions.
