# P0-1.9 Final Bootstrap Boundary Audit

**日期**: 2026-08-26
**基线**: tllos dd060b5 + audit commit
**审计类型**: 架构边界确认，不写实现代码

---

## 1. LANGUAGE CORE

### 1.1 定义

TLL Language Core 是 TLL 语言的语义定义，包括语法、类型系统、编译、字节码、VM 执行模型。

### 1.2 组成

| 组件 | 文件 | 语言 | 对宿主依赖 |
|------|------|------|-----------|
| Lexer | compiler/lexer.tll | TLL | 0 |
| Parser | compiler/parser.tll | TLL | 0 |
| AST | compiler/parser.tll (内嵌) | TLL | 0 |
| TypeChecker | compiler/typechecker.tll | TLL | 0 |
| Codegen | compiler/codegen.tll | TLL | 0 |
| Linker | compiler/linker.tll | TLL | 0 |
| Compiler Entry | compiler/compiler.tll | TLL | 0 |
| VM | runtime/vm.tll | TLL | 0 (语义层) |
| Package | package/package.tll | TLL | 0 |

### 1.3 语言核心语义

以下语义完全由 TLL 定义，不依赖任何宿主语言：

- 变量声明与赋值 (let, =)
- 基本类型 (int, float, string, bool, null)
- 复合类型 (array, map)
- 函数定义与调用 (fn, return)
- 一等函数 (Function Value, {__fn, fnIdx, env})
- 闭包 (OP_CLOSURE, OP_GET_UPVALUE, OP_SET_UPVALUE, OP_BOX_LOCAL)
- 控制流 (if/else, while, for)
- 异常处理 (try/catch/finally/throw)
- 模块系统 (import/export)
- 包管理 (tll.toml)
- 字节码执行模型 (46 个 opcode, 寄存器 + 栈帧)

### 1.4 结论

**TLL Language Core 对 TS/JS/C/Python 的语言语义依赖为 0。**

所有语法解析、类型检查、代码生成、链接、字节码执行、闭包环境管理均由 TLL 代码实现。

---

## 2. VM

### 2.1 TLL VM (runtime/vm.tll)

- **语言**: 100% TLL
- **行数**: ~900 行
- **功能**: 完整的 TLL bytecode 解释器
- **opcode 覆盖**: 46 个 opcode 全部实现
- **闭包支持**: UpvalueBox, ClosureEnv, 可变捕获, 兄弟闭包共享
- **异常支持**: TRY_START/TRY_END, 跨帧传播

### 2.2 VM 的执行依赖

TLL VM 本身是一个 TLL 程序，它需要被**某个 VM 加载器**执行。当前加载器是 TS Runtime。

这不是 TLL VM 的语言语义依赖，而是**执行依赖**。类似于：
- JVM 是 C++ 写的，但 Java 字节码的语义由 JVM 规范定义
- CPython 是 C 写的，但 Python 字节码的语义由 Python 规范定义
- TLL VM 是 TLL 写的，但 TLL bytecode 需要一个加载器来启动

### 2.3 VM 内部的 Host 调用

vm.tll 中的 `vm_callBuiltin` 函数调用了以下模块：

| 模块 | 调用方式 | 性质 |
|------|---------|------|
| io.println/print/readLine | 直接调用 | Host ABI (stdout/stdin) |
| fs.readFile/writeFile/etc. | 直接调用 | Host ABI (filesystem) |
| http.get/post/etc. | 直接调用 | Host ABI (network) |
| json.parse/stringify | 直接调用 | 可 TLL 实现 (当前由 Host 提供) |
| math.sqrt/sin/etc. | 直接调用 | 可 TLL 实现 (当前由 Host 提供) |
| strings.* | 直接调用 | 可 TLL 实现 (当前由 Host 提供) |
| arrays.* | 直接调用 | 可 TLL 实现 (当前由 Host 提供) |
| convert.* | 直接调用 | 可 TLL 实现 (当前由 Host 提供) |

**关键发现**: 当前 vm.tll 把所有 stdlib 都当作 Host 调用。最终架构中，只有 io/fs/http/process/clock 应该是 Host ABI，json/math/strings/arrays/convert 应该用 TLL 实现。

---

## 3. HOST ABI

### 3.1 定义

Host ABI 是 TLL 程序访问操作系统能力的唯一接口。Host ABI 的实现不属于 TLL 语言本身，可以由任何语言实现（C/Rust/WASM/TS）。

### 3.2 最终 Host ABI v1 规范

#### 3.2.1 标准 I/O

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| host_print | (text: string) | void | 写入 stdout |
| host_println | (text: string) | void | 写入 stdout + 换行 |
| host_read_line | (prompt: string) | string | 从 stdin 读取一行 |
| host_stderr | (text: string) | void | 写入 stderr |

#### 3.2.2 文件系统

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| host_read_file | (path: string) | string | 读取文件内容 |
| host_write_file | (path: string, content: string) | void | 写入文件 |
| host_append_file | (path: string, content: string) | void | 追加写入 |
| host_file_exists | (path: string) | bool | 文件是否存在 |
| host_mkdir | (path: string) | void | 创建目录 |
| host_remove | (path: string) | void | 删除文件/目录 |
| host_list_dir | (path: string) | array | 列出目录内容 |
| host_is_file | (path: string) | bool | 是否是文件 |
| host_is_dir | (path: string) | bool | 是否是目录 |
| host_file_size | (path: string) | int | 文件大小 |
| host_copy_file | (src: string, dst: string) | void | 复制文件 |
| host_rename | (src: string, dst: string) | void | 重命名 |

#### 3.2.3 网络

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| host_http_get | (url: string) | map | GET 请求，返回 {status, headers, body} |
| host_http_post | (url: string, body: string) | map | POST 请求 |
| host_http_request | (method, url, headers, body) | map | 通用请求 |

#### 3.2.4 进程与环境

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| host_exit | (code: int) | void | 退出进程 |
| host_env_get | (key: string) | string | 获取环境变量 |
| host_args | () | array | 获取命令行参数 |
| host_cwd | () | string | 获取当前工作目录 |

#### 3.2.5 时钟与随机

| 函数 | 参数 | 返回 | 说明 |
|------|------|------|------|
| host_time_ms | () | int | 当前时间戳 (毫秒) |
| host_sleep | (ms: int) | void | 休眠 |
| host_random | () | float | 随机数 [0, 1) |

### 3.3 不属于 Host ABI 的能力

以下能力必须用 TLL 实现，放在 stdlib/ 目录：

| 模块 | 说明 | 实现方式 |
|------|------|---------|
| json | parse/stringify | 纯 TLL 算法 |
| math | sqrt/sin/cos/pow/log | 纯 TLL 算法 (可调用 host 浮点) |
| strings | length/split/replace/etc. | 纯 TLL 算法 |
| arrays | length/map/filter/reduce/etc. | 纯 TLL 算法 |
| convert | toInt/toString/typeOf | 纯 TLL 算法 |

### 3.4 Host ABI 的调用约定

```
TLL 程序
  ↓ OP_LOAD_BUILTIN (builtin index)
  ↓ OP_CALL (indirect)
TLL VM (vm.tll)
  ↓ vm_callBuiltin
  ↓ 识别 builtin 类型
  ├── stdlib builtin → 调用 TLL stdlib 模块
  └── host builtin → 调用 Host ABI 函数
       ↓
    Host Implementation (C/Rust/WASM/TS)
       ↓
    OS API
```

---

## 4. BOOTSTRAP

### 4.1 Bootstrap Problem

TLL Compiler 是 TLL 写的，TLL VM 也是 TLL 写的。要执行 TLL 程序，需要一个 VM 加载器。这个加载器不能是 TLL 写的（否则需要另一个加载器来加载它），形成无限递归。

### 4.2 当前 Bootstrap 链

```
Stage 0: TS Runtime (bootstrap/ts/runtime.ts)
  ↓ 加载并执行
Stage 1: vm_run.tllbc (TLL VM Runner, 编译自 runtime/vm_run.tll)
  ↓ 调用 vm.run()
Stage 2: TLL VM (runtime/vm.tll, 运行在 Stage 1 上)
  ↓ 执行
Stage 3: 用户 TLL 程序 (user.tllbc)
```

Stage 0 (TS Runtime) 是**第一把火**，它本身不是 TLL 语言的一部分。

### 4.3 最终 Bootstrap 链

```
Stage 0: Native Launcher (tllvm, C/Rust/WASM 实现)
  ↓ 加载并执行
Stage 1: vm_run.tllbc (预编译, 提交到仓库)
  ↓ 调用 vm.run()
Stage 2: TLL VM (runtime/vm.tll)
  ↓ 执行
Stage 3: 用户 TLL 程序
```

**Native Launcher 的职责**:
1. 读取 .tllbc 文件 (JSON 格式)
2. 初始化 VM 状态 (寄存器、栈、全局变量)
3. 实现 Host ABI (io/fs/http/process/clock)
4. 执行 opcode 循环
5. 约 500-800 行代码

**Native Launcher 不实现**:
- TLL 语言语义 (类型检查、编译、链接)
- TLL stdlib (json/math/strings/arrays/convert)
- 闭包环境管理 (由 TLL VM 实现)
- 模块解析 (由 TLL Compiler 实现)

### 4.4 Bootstrap 产物

最终 tllos 仓库应包含以下预编译产物：

| 文件 | 说明 | 生成方式 |
|------|------|---------|
| bootstrap/compiler.tllbc | TLL Compiler 预编译 bytecode | 用 TS Compiler 编译 compiler/compiler.tll |
| bootstrap/vm_run.tllbc | TLL VM Runner 预编译 bytecode | 用 TS Compiler 编译 runtime/vm_run.tll |

这些是 Bootstrap Seed，不是源码。它们允许 fresh clone 后立即运行，不需要先编译 TLL Compiler。

---

## 5. SELF-HOSTING

### 5.1 自举能力验证

| 验证项 | 状态 | 证据 |
|--------|------|------|
| TLL Compiler 能编译自身 | ✅ PASS | selfhost.js A==B==C |
| TLL VM 能执行 Compiler bytecode | ✅ PASS | P0-1.8 实验: generic_compiler.tllbc |
| TLL Compiler 编译结果确定性 | ✅ PASS | A==B==C, 9 维度 0 diffs |
| TLL VM 能执行用户程序 | ✅ PASS | P0-1.8 实验: Hello, TLL OS! |
| 完整自举链 (Compiler → VM → Compiler → VM) | ✅ PASS | selfhost.js 三轮验证 |

### 5.2 自举数据

```
Functions: 152
Constants: 3867
Instructions: 18463
Globals: (自举报告中记录)
Schema: 稳定
A vs B: 0 diffs
B vs C: 0 diffs
A vs C: 0 diffs
```

### 5.3 自举链图示

```
                    ┌─────────────────┐
                    │  Native Launcher │  ← Stage 0 (Host)
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │   vm_run.tllbc   │  ← Stage 1 (预编译)
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │     TLL VM      │  ← Stage 2 (runtime/vm.tll)
                    └────────┬────────┘
                             ↓
              ┌──────────────┴──────────────┐
              ↓                             ↓
     ┌─────────────────┐           ┌─────────────────┐
     │ compiler.tllbc  │           │  user.tllbc     │
     │ (TLL Compiler)  │           │  (用户程序)      │
     └────────┬────────┘           └─────────────────┘
              ↓
     编译 compiler.tll
              ↓
     compiler.tllbc' (== compiler.tllbc)
              ↓
     再次编译自身 → 确定性验证
```

---

## 6. FINAL REPOSITORY

### 6.1 tllos 最终结构 (0 .js / 0 .ts)

```
tllos/
├── compiler/
│   ├── lexer.tll
│   ├── parser.tll
│   ├── typechecker.tll
│   ├── codegen.tll
│   ├── linker.tll
│   └── compiler.tll
├── runtime/
│   ├── vm.tll
│   └── vm_run.tll
├── package/
│   └── package.tll
├── stdlib/
│   ├── io.tll          ← 封装 Host ABI
│   ├── fs.tll          ← 封装 Host ABI
│   ├── http.tll        ← 封装 Host ABI
│   ├── json.tll        ← 纯 TLL 实现
│   ├── math.tll        ← 纯 TLL 实现
│   ├── strings.tll     ← 纯 TLL 实现
│   ├── arrays.tll      ← 纯 TLL 实现
│   └── convert.tll     ← 纯 TLL 实现
├── bootstrap/
│   ├── compiler.tllbc  ← 预编译 Compiler (Bootstrap Seed)
│   └── vm_run.tllbc    ← 预编译 VM Runner (Bootstrap Seed)
├── host/
│   └── README.md       ← Host ABI 规范 + 实现指南
├── spec/
│   ├── LANGUAGE.json
│   ├── OPCODES.json
│   ├── BUILTINS.json
│   ├── HOST_ABI.json   ← 新增: Host ABI 规范
│   └── MIGRATION.json
├── language/
│   ├── syntax/
│   ├── types/
│   ├── functions/
│   ├── closures/
│   └── modules/
├── docs/
│   ├── getting-started/
│   ├── architecture/
│   └── P0-1-8_ABSOLUTE_INDEPENDENCE_AUDIT.md
├── examples/
│   ├── hello.tll
│   └── closures.tll
├── tests/
│   ├── closure/
│   ├── module-system/
│   ├── package/
│   ├── exception/
│   ├── regression/
│   ├── acceptance/
│   ├── runtime-equivalence/
│   └── runner.tll      ← 纯 TLL 测试运行器
├── tools/
│   └── cli.tll         ← 纯 TLL CLI (tll run/build/check)
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── LICENSE (Apache-2.0)
├── NOTICE
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── .gitignore
```

### 6.2 文件统计

| 类型 | 数量 | 说明 |
|------|------|------|
| .tll | ~100 | 全部源码 + 测试 + 示例 |
| .json | ~10 | spec + 配置 |
| .md | ~15 | 文档 |
| .yml | 2 | CI |
| .tllbc | 2 | Bootstrap Seed (预编译产物) |
| **.ts** | **0** | **完全移除** |
| **.js** | **0** | **完全移除** |

### 6.3 迁移到 tll-bootstrap 的内容

以下内容从 tllos 移除，迁移到私有仓库 `tll-bootstrap`：

| 内容 | 原因 |
|------|------|
| bootstrap/ts/*.ts | TS Reference Compiler + Runtime (历史参考) |
| tools/tll.js | Node.js CLI (被 tools/cli.tll 替代) |
| tools/tll-repl.js | Node.js REPL (被 TLL REPL 替代) |
| tools/exec_bytecode.js | Node.js bytecode 执行器 (被 Native Launcher 替代) |
| tests/*.js | Node.js 测试框架 (被 tests/runner.tll 替代) |
| node_modules/ | 依赖 (不再需要) |
| package.json | npm 配置 (不再需要) |
| tsconfig.json | TS 编译配置 (不再需要) |

### 6.4 tll-bootstrap 仓库定位

```
tll-bootstrap (私有)
├── 历史 TS Compiler (参考实现)
├── 历史 TS Runtime (参考 VM)
├── 迁移工具 (TS → TLL 转换辅助)
├── 实验代码
└── Bootstrap Seed 生成器
    (用 TS Compiler 编译 compiler.tll → compiler.tllbc)
```

tll-bootstrap 的唯一用途：
1. 生成新的 Bootstrap Seed (compiler.tllbc, vm_run.tllbc)
2. 作为 Reference Implementation 进行交叉验证
3. 保留历史演进记录

---

## 7. 实施路径

### Phase 1: Host ABI 规范化 (不写代码)
- 确认 Host ABI v1 规范
- 更新 spec/HOST_ABI.json
- 更新 vm.tll 中的 builtin 分类 (Host vs Stdlib)

### Phase 2: Stdlib TLL 化
- 用 TLL 实现 json.tll, math.tll, strings.tll, arrays.tll, convert.tll
- vm_callBuiltin 中这些模块改为调用 TLL stdlib
- 只有 io/fs/http/process/clock 保留为 Host 调用

### Phase 3: 纯 TLL CLI
- 实现 tools/cli.tll (tll run/build/check)
- 使用预编译的 compiler.tllbc 进行编译
- 使用预编译的 vm_run.tllbc 进行执行

### Phase 4: 纯 TLL 测试框架
- 实现 tests/runner.tll
- 替代 tests/run-tests.js

### Phase 5: Native Launcher 设计
- 设计 tllvm 规范 (C/Rust/WASM)
- 实现最小可用版本
- 验证能加载 vm_run.tllbc 并执行用户程序

### Phase 6: 最终清理
- 从 tllos 移除所有 .ts/.js
- 迁移到 tll-bootstrap
- 验证 fresh clone 0 .ts/.js 可运行
- 标记 v1.2.0: Zero Host Language Dependency

---

## 8. 最终结论

### 8.1 已证明

| 声明 | 状态 |
|------|------|
| TLL Language Core 不依赖 TS/JS/C/Python 语言语义 | ✅ 已证明 |
| TLL Compiler 可以由 TLL VM 执行 | ✅ 已证明 |
| TLL Compiler 可以编译自身 | ✅ 已证明 (A==B==C) |
| TLL VM 可以执行 Compiler bytecode | ✅ 已证明 |
| 用户程序可以完全由 TLL Compiler + TLL VM 执行 | ✅ 已证明 |
| 所有 OS 能力可以统一通过 Host ABI | ✅ 设计完成 |

### 8.2 待完成

| 项目 | 状态 | 说明 |
|------|------|------|
| Host ABI v1 规范 | ✅ 设计完成 | 本文档第 3 节 |
| Stdlib TLL 化 | ⏳ 待实现 | json/math/strings/arrays/convert |
| 纯 TLL CLI | ⏳ 待实现 | tools/cli.tll |
| 纯 TLL 测试框架 | ⏳ 待实现 | tests/runner.tll |
| Native Launcher | ⏳ 待设计实现 | tllvm (C/Rust/WASM) |
| tllos 仓库 0 .ts/.js | ⏳ 待清理 | Phase 6 |

### 8.3 核心洞察

**TLL 已经不是"能不能自举"的问题，而是"用什么作为第一把火"的问题。**

- TLL 语言语义：100% 独立
- TLL Compiler：100% TLL，可自举
- TLL VM：100% TLL，可执行 Compiler 和用户程序
- 唯一缺口：需要一个 Native Launcher 来加载第一份 TLL bytecode

这个 Native Launcher **不是 TLL 语言的一部分**，它是 Host。就像：
- C 语言不依赖汇编，但需要汇编器作为第一把火
- Java 语言不依赖 C++，但需要 JVM (C++) 作为宿主
- TLL 语言不依赖 TS/C/Rust，但需要一个 VM 加载器作为宿主

**最终目标不是"0 宿主语言"，而是"0 宿主语言对 TLL 语言语义的污染"。**
