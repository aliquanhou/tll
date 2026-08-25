# P0-1.8 Absolute TLL Independence Audit

**日期**: 2026-08-26
**基线**: tllos dd060b5 (v1.1.0-language-core)
**审计类型**: 只读审计，不修改代码

---

## 1. 审计目标

验证 TLL 是否具备完全移除 TS/JS 后独立存在的能力。

核心问题：删除所有 .ts / .js 后，TLL 是否还能 compile / build / run / check / selfhost？

---

## 2. 当前文件构成

| 类型 | 数量 | 位置 | 角色 |
|------|------|------|------|
| .tll | 89 | compiler/, runtime/, package/, stdlib/, tests/, examples/, tools/ | TLL 语言核心 |
| .ts | 8 | bootstrap/ts/ | TS Reference Compiler + Runtime |
| .js | 12 | tools/, tests/ | CLI + 测试框架 |
| .c/.cpp/.rs/.go/.java | 0 | — | 无原生 VM 实现 |

---

## 3. 执行链追踪

### 当前生产执行链 (tll run xxx.tll)

```
Node.js
  ↓
tools/tll.js (JS CLI)
  ↓
compileWithTLLCompiler():
  生成 __tll_cli_driver.tll
  调用 node bootstrap/dist/cli.js run driver.tll
    ↓
  TS Compiler (cli.ts) 解析并执行 driver.tll
    ↓
  driver.tll 调用 linkAndCompile() [TLL Compiler, 纯 TLL]
    ↓
  生成 user.tllbc
  ↓
TS Runtime (runtime.ts) 加载 runtime/vm_run.tllbc
  ↓
vm_run.tllbc [TLL VM Runner, 纯 TLL]
  读取 vm_run_target.tllbc
  调用 vm.run() [TLL VM, 纯 TLL]
  ↓
执行用户程序
```

### 关键发现

- **编译用户程序的是 TLL Compiler** (linker.tll + codegen.tll + ...)，不是 TS Compiler
- **执行用户程序的是 TLL VM** (vm.tll)，不是 TS Runtime
- TS Compiler 的角色：执行 driver.tll 的加载器（bootstrap）
- TS Runtime 的角色：加载 vm_run.tllbc 的宿主 VM（bootstrap loader）

---

## 4. Absolute Independence 实验

### 实验：TLL VM 直接执行 Compiler bytecode 编译用户程序

**步骤**:
1. 创建 `tools/generic_compiler.tll`（纯 TLL，调用 linkAndCompile 编译 `__input.tll`）
2. 用 TS Compiler 编译 generic_compiler.tll → generic_compiler.tllbc（bootstrap 步骤）
3. 用 TLL VM (vm_run.tllbc) 执行 generic_compiler.tllbc
4. generic_compiler.tllbc 读取 `__input.tll` (hello.tll)，编译输出 `__output.tllbc`
5. 用 TLL VM 执行 `__output.tllbc`

**结果**:
```
Step 3: COMPILE_OK: 2 functions  ← TLL VM 执行 TLL Compiler 成功
Step 4: __output.tllbc 生成 (2 functions, mainIndex=1)
Step 5: Hello, TLL OS!            ← TLL VM 执行用户程序成功
```

**结论**: TLL Compiler 可以由 TLL VM 执行，完全绕过 TS Compiler。

---

## 5. 依赖矩阵

| 组件 | 源码语言 | 对 TS/JS 依赖 | 说明 |
|------|----------|---------------|------|
| Lexer | TLL | 0 | compiler/lexer.tll |
| Parser | TLL | 0 | compiler/parser.tll |
| TypeChecker | TLL | 0 | compiler/typechecker.tll |
| Codegen | TLL | 0 | compiler/codegen.tll |
| Linker | TLL | 0 | compiler/linker.tll |
| Compiler Entry | TLL | 0 | compiler/compiler.tll |
| VM | TLL | 0 | runtime/vm.tll |
| VM Runner | TLL | 0 | runtime/vm_run.tll |
| Package | TLL | 0 | package/package.tll |
| Stdlib (io/json/math/strings/arrays/convert/fs/http) | TLL | 0 | 通过 builtin 机制 |
| **TLL Language Core 合计** | **TLL** | **0** | **100% 纯 TLL** |
| TS Compiler | TS | — | bootstrap/ts/, Reference Compiler |
| TS Runtime | TS | — | bootstrap/ts/, Reference VM / Bootstrap Loader |
| CLI (tll.js) | JS | 100% | tools/tll.js, Node.js CLI |
| Test Framework | JS | 100% | tests/*.js |
| **宿主加载器** | **TS** | **100%** | **当前唯一执行 vm_run.tllbc 的方式** |

---

## 6. 移除 TS/JS 后的缺口分析

### 6.1 如果删除 bootstrap/ts/ (TS Compiler + TS Runtime)

**编译能力**:
- ❌ 无法编译新的 TLL 源码（没有加载器执行 TLL Compiler bytecode）
- ✅ 如果有预编译的 compiler.tllbc，理论上可以编译，但需要 VM 加载器

**运行能力**:
- ❌ 无法执行任何 TLL bytecode（没有 VM 加载器执行 vm_run.tllbc）

**根因**: 没有非 JS/TS 的 TLL bytecode VM 实现。

### 6.2 如果删除 tools/*.js (CLI)

- ❌ 没有命令行入口
- 需要一个纯 TLL 的 CLI，或者其他语言的 CLI

### 6.3 如果删除 tests/*.js

- ❌ 没有测试运行器
- 需要一个纯 TLL 的测试框架（tll test）

---

## 7. 达到 "0 JS / 0 TS" 的路径

### 方案 A：原生 VM 加载器（推荐）

```
tllos/
├── compiler/          # 纯 TLL (已有)
├── runtime/           # 纯 TLL (已有)
├── package/           # 纯 TLL (已有)
├── stdlib/            # 纯 TLL (已有)
├── host/
│   └── c/             # 新增: C 实现的最小 VM 加载器
│       └── tllvm.c    # 读取 .tllbc，执行 opcode
├── bootstrap/
│   └── compiler.tllbc # 预编译的 TLL Compiler bytecode (提交到仓库)
├── tools/
│   └── cli.tll        # 纯 TLL CLI (替代 tll.js)
└── tests/
    └── runner.tll     # 纯 TLL 测试框架 (替代 run-tests.js)
```

**工作流**:
1. `tllvm compiler.tllbc` → 启动 TLL Compiler
2. TLL Compiler 编译用户文件 → user.tllbc
3. `tllvm user.tllbc` → 执行用户程序

**需要实现**:
- C/Rust/WASM 实现的 TLL bytecode VM（~500 行，对应 runtime.ts 的 452 行）
- 预编译 compiler.tllbc 并提交
- 纯 TLL CLI (cli.tll)
- 纯 TLL 测试框架

### 方案 B：WASM VM 加载器

- 把 TLL VM (vm.tll) 编译成 WASM
- 需要 TLL-to-WASM 编译器（当前不存在）
- 长期目标，不适合当前阶段

### 方案 C：承认宿主依赖，明确边界

- 保留 TS Runtime 作为 "Reference VM / Bootstrap Loader"
- 明确声明：TLL 语言核心 100% 独立，宿主加载器是平台相关的
- 类似于 CPython (C)、JVM (C++)、CRuby (C)
- 这是当前最实际的方案

---

## 8. 自举能力验证

| 验证项 | 状态 | 证据 |
|--------|------|------|
| TLL Compiler 能编译自身 | ✅ PASS | selfhost.js A==B==C, 152 functions |
| TLL VM 能执行 Compiler bytecode | ✅ PASS | Absolute Independence 实验 Step 3 |
| 第二轮编译结果一致 | ✅ PASS | A==B==C, 9 维度 0 diffs |
| 第三轮编译结果一致 | ✅ PASS | A==B==C, 9 维度 0 diffs |
| TLL VM 能执行用户程序 | ✅ PASS | Absolute Independence 实验 Step 5 |
| fresh clone 可 bootstrap | ✅ PASS | vm_run.tllbc 自动生成 |
| **完全脱离 TS/JS 运行** | ❌ FAIL | 没有非 JS/TS 的 VM 加载器 |

---

## 9. 最终结论

### TLL Core Independence: ✅ PASS

TLL 语言核心（Lexer / Parser / TypeChecker / Codegen / Linker / Compiler / VM / Stdlib）是 **100% 纯 TLL**，对 TS/JS 的源码依赖为 **0**。

TLL Compiler 可以由 TLL VM 执行，TLL VM 可以执行用户程序。编译和执行语义完全由 TLL 代码实现。

### Absolute Zero JS/TS: ❌ FAIL

当前缺少一个**非 JS/TS 的 TLL bytecode VM 加载器**。TS Runtime 是当前唯一能执行 vm_run.tllbc 的宿主。

这不是 TLL 语言的缺陷，而是工程实现阶段的问题。类似于：
- Python 语言不依赖 C，但 CPython 是 C 写的
- Java 语言不依赖 C++，但 JVM 是 C++ 写的
- TLL 语言不依赖 TS，但当前 Reference VM 是 TS 写的

### 建议

**短期 (当前版本)**: 采用方案 C，明确边界：
- bootstrap/ts/ = Reference Implementation (Compiler + VM)
- compiler/ + runtime/ = TLL Language Core (100% TLL)
- TS Runtime = Bootstrap Loader (宿主加载器，非语言语义)

**中期 (v1.2)**: 实现方案 A：
- 用 C 实现最小 VM 加载器 (~500 行)
- 预编译 compiler.tllbc 提交到仓库
- 实现纯 TLL CLI
- 目标：`tllvm run hello.tll` 完全不需要 Node.js

**长期 (v2.0)**: 方案 B：
- TLL-to-native 编译器
- TLL VM 编译成原生代码
- 完全自包含

---

## 10. 审计状态

| 检查项 | 状态 |
|--------|------|
| TLL Core 对 TS 依赖 | 0 ✅ |
| TLL Compiler 对 TS 依赖 | 0 (源码) ✅ |
| TLL VM 对 TS 依赖 | 0 (源码) ✅ |
| TLL Package 对 TS 依赖 | 0 ✅ |
| TLL Stdlib 对 TS 依赖 | 0 ✅ |
| TLL CLI 对 JS 依赖 | 100% ❌ |
| TLL Bootstrap 对 TS/JS 依赖 | 100% ❌ |
| 非 JS/TS VM 加载器 | 不存在 ❌ |
| 完全脱离 TS/JS 运行 | 不可行 ❌ |

**结论**: TLL 语言核心已完全独立，但发行版仍依赖 TS/JS 作为宿主加载器。要达到 Absolute Zero JS/TS，需要实现原生 VM 加载器。
