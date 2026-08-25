# ADR-001: TLL OS 生产执行器架构决策

**状态**: 待确认
**日期**: 2026-08-26
**作者**: TLL OS Team
**影响范围**: runtime/, host/c/, compiler/, 整体构建链

---

## 1. 背景与问题陈述

### 1.1 当前状态

TLL OS 目前存在两套 VM 实现：

| 实现 | 语言 | 位置 | 角色 |
|------|------|------|------|
| TLL VM | 纯 TLL | `runtime/vm.tll` (~900行) | 自举 VM / 参考实现 |
| C VM (tllvm) | C | `host/c/` (~1500行) | Stage-0 Bootstrap Launcher |

### 1.2 已验证的技术事实

1. **C VM 直接执行用户程序**: ✅ 成功
   - hello.tllbc, closures.tllbc, hof.tllbc, mut_closure.tllbc 均正常运行
   - 支持 46 opcode、闭包、upvalue、异常、120 builtin

2. **C VM 执行 vm_run.tllbc**: ✅ 成功（空目标/无目标时）
   - 能加载并执行 vm_run.tllbc（23函数, 857常量, 194KB）

3. **C VM 元循环执行 TLL VM**: ❌ 失败
   - `tllvm → vm_run.tllbc → vm.tll → user.tllbc` 路径崩溃
   - 崩溃发生在 vm.run() 处理包含函数的程序时
   - 连极简程序（1函数, 0指令）都崩溃
   - 根因：C VM 与 TLL VM 之间存在 bytecode 语义不匹配

### 1.3 核心问题

> **tllos 的最终生产执行器到底是谁？**

这个问题必须在继续施工前回答，否则会导致：
- 双 VM 语义分叉
- C VM 无限膨胀为第二套完整 Runtime
- 自举链不清晰
- 0 .js / 0 .ts 目标无法达成

---

## 2. 候选方案比较

### 方案 A: runtime/vm.tll 作为唯一生产 VM

**架构**:
```
tllvm (C, 仅 loader)
  → 加载 vm_run.tllbc
    → 调用 vm.tll (TLL VM)
      → 执行用户程序
```

| 维度 | 说明 |
|------|------|
| opcode 语义 | vm.tll 唯一来源 |
| closure | vm.tll 唯一来源 |
| memory/value model | vm.tll 唯一来源 |
| builtin/Host ABI | vm.tll 调用 Host ABI |
| 生产用户程序 | vm.tll 执行 |
| bootstrap | tllvm 加载 vm_run.tllbc |
| 双 VM 语义 | ❌ 不存在（tllvm 仅 loader） |
| 0 .js / 0 .ts | ✅ 可达 |
| 预编译 .tllbc | 需要 vm_run.tllbc |
| fresh clone 启动 | tllvm → vm_run.tllbc → vm.tll |
| 唯一事实来源 | vm.tll |

**优点**:
- TLL VM 是 100% 纯 TLL，语言独立性最强
- 自举链最纯粹：TLL 编译 TLL，TLL 执行 TLL

**缺点**:
- **元循环复杂性**: C VM 必须正确执行 vm.tll 的全部 bytecode 语义
- **当前阻塞**: C VM 执行 vm.tll 元循环时崩溃，需要大量修复
- **性能开销**: 两层解释器嵌套（C 解释 TLL VM bytecode，TLL VM 解释用户 bytecode）
- **调试困难**: 元循环中的 bug 难以定位
- **tllvm 膨胀风险**: 为了正确执行 vm.tll，tllvm 必须实现完整的 46 opcode + closure + frame + value model，实际上变成第二套 VM

**当前可行性**: ❌ 阻塞（C VM 元循环执行失败）

---

### 方案 B: Native tllvm 作为唯一生产 VM（推荐）

**架构**:
```
tllvm (C, 完整 VM)
  → 加载用户 .tllbc
    → 直接执行用户程序
```

`runtime/vm.tll` 角色变更为：**Reference VM / 自举验证器 / 语言规范可执行版本**

| 维度 | 说明 |
|------|------|
| opcode 语义 | tllvm (C) 为生产规范，vm.tll 为参考验证 |
| closure | tllvm (C) 生产实现，vm.tll 参考实现 |
| memory/value model | tllvm (C) 生产实现 |
| builtin/Host ABI | tllvm (C) 直接提供 |
| 生产用户程序 | tllvm 直接执行 |
| bootstrap | tllvm 执行 compiler.tllbc 编译源文件 |
| 双 VM 语义 | ⚠️ 存在两套实现，但角色明确分离 |
| 0 .js / 0 .ts | ✅ 可达 |
| 预编译 .tllbc | 需要 compiler.tllbc（用于编译源文件） |
| fresh clone 启动 | tllvm run hello.tll（自动编译+执行） |
| 唯一事实来源 | `spec/OPCODES.json` + `spec/BYTECODE.md` |

**优点**:
- **已验证可行**: C VM 直接执行用户程序已成功
- **性能最优**: 只有一层解释器
- **架构简单**: 没有元循环嵌套
- **调试直接**: 用户程序的 bug 直接在 C VM 中定位
- **自举清晰**: tllvm → compiler.tllbc → 编译 → tllvm → 执行
- **Native 发布**: 可提供预编译二进制，用户无需编译 C

**缺点**:
- C 代码量较大（~1500行），但这是 VM 实现的正常规模
- 需要维护两套 VM 语义的一致性（通过 OPCODES.json 规范 + 自动化测试）
- "100% 纯 TLL VM" 的说法需要修正为"生产 VM 为 Native，参考 VM 为纯 TLL"

**当前可行性**: ✅ 已验证（hello, closures 等直接执行成功）

**双 VM 语义管理**:
- `spec/OPCODES.json` 是 opcode 契约的唯一规范
- `spec/BYTECODE.md` 是 bytecode 格式的唯一规范
- 每次修改 opcode 语义，必须同时更新 C VM 和 TLL VM
- 自动化测试：同一 bytecode 在两套 VM 上输出必须一致
- vm.tll 的角色：自举验证（TLL 编译 TLL）、语言规范可执行版本、新功能原型验证

---

### 方案 C: Native VM + TLL VM 双生产实现

**架构**:
```
路径 1: tllvm → 用户 .tllbc（生产路径）
路径 2: tllvm → vm_run.tllbc → vm.tll → 用户 .tllbc（参考/验证路径）
```

| 维度 | 说明 |
|------|------|
| opcode 语义 | 两套实现，必须等价 |
| closure | 两套实现，必须等价 |
| memory/value model | 两套实现 |
| builtin/Host ABI | 两套实现 |
| 生产用户程序 | tllvm 直接执行（主路径） |
| bootstrap | 两条路径都可用 |
| 双 VM 语义 | ⚠️⚠️ 双生产实现，维护成本最高 |
| 0 .js / 0 .ts | ✅ 可达 |
| 预编译 .tllbc | 需要 compiler.tllbc + vm_run.tllbc |
| fresh clone 启动 | tllvm run hello.tll |
| 唯一事实来源 | 不明确 |

**优点**:
- 冗余度高，一套出问题可以用另一套
- 交叉验证能力强

**缺点**:
- **维护成本最高**: 任何语言特性变更必须同步两套实现
- **语义分叉风险**: 两套实现可能产生微妙差异
- **架构最复杂**: 元循环路径仍需维护
- **当前阻塞**: 元循环路径仍崩溃
- **没有明确的唯一事实来源**

**当前可行性**: ❌ 阻塞（元循环路径失败）

---

## 3. 决策

### 推荐方案: B — Native tllvm 作为唯一生产 VM

### 核心理由

1. **技术可行性已验证**: C VM 直接执行用户程序已成功，方案 B 的核心路径已打通
2. **避免元循环复杂性**: 方案 A/C 都需要 C VM 正确执行 TLL VM 的元循环，当前已证明这是一个复杂的工程难点
3. **性能最优**: 单层解释器比双层嵌套快数倍
4. **架构最清晰**: 生产路径只有一条，没有歧义
5. **语言独立性不受影响**: TLL 语言的独立性体现在 source → compiler → bytecode，VM 的实现语言不影响语言独立性
6. **行业惯例**: Python (CPython), Ruby (MRI), Lua (LuaJIT) 等语言的生产 VM 都是 Native 实现，参考实现可以是其他语言

### runtime/vm.tll 的新定位

| 角色 | 说明 |
|------|------|
| Reference VM | TLL bytecode 语义的参考实现 |
| 自举验证器 | 验证 TLL Compiler 输出的 bytecode 可被纯 TLL VM 执行 |
| 语言规范可执行版本 | 新语言特性先在 vm.tll 中原型验证，再移植到 C VM |
| 交叉验证工具 | 同一 bytecode 在 C VM 和 TLL VM 上输出必须一致 |

### 规范驱动开发

为了避免双 VM 语义分叉，建立以下规范文件作为唯一事实来源：

| 文件 | 内容 |
|------|------|
| `spec/OPCODES.json` | 46 个 opcode 的编号、操作数格式、语义 |
| `spec/BYTECODE.md` | .tllbc 文件格式规范 |
| `spec/HOST_ABI.json` | Host ABI 函数列表、参数、返回值 |
| `spec/VALUE_MODEL.md` | TLLValue 内存布局、类型系统 |
| `spec/CLOSURE.md` | 闭包环境、upvalue、Box 语义 |

---

## 4. 实施路线图

### 阶段 1: 架构确认（本 ADR）
- [ ] 确认方案 B
- [ ] 更新文档中关于 "100% 纯 TLL VM" 的表述
- [ ] 明确 vm.tll 的新角色

### 阶段 2: 规范固化
- [ ] 完善 `spec/OPCODES.json`（当前已有，需审核完整性）
- [ ] 创建 `spec/BYTECODE.md`
- [ ] 完善 `spec/HOST_ABI.json`（当前已有）
- [ ] 创建 `spec/VALUE_MODEL.md`
- [ ] 创建 `spec/CLOSURE.md`

### 阶段 3: C VM 稳定化
- [ ] 修复 C VM 中已知的 bug（基于已通过的测试）
- [ ] 建立 C VM 与 TLL VM 的输出一致性测试套件
- [ ] 验证 compiler.tllbc 可在 C VM 中执行（自举）

### 阶段 4: 生产链完善
- [ ] 实现 `tll run <file.tll>`：tllvm 编译+执行
- [ ] 实现 `tll build <file.tll>`：输出 .tllbc
- [ ] 实现 `tll check <file.tll>`：仅类型检查
- [ ] 预编译 tllvm 二进制发布（Windows/Linux/macOS）

### 阶段 5: 最终切割
- [ ] 从 tllos 删除所有 .js / .ts
- [ ] 验证 fresh clone 可启动
- [ ] 验证 0 .js / 0 .ts
- [ ] 标记 v1.2 Runtime Independence

---

## 5. 关键约束声明

### 5.1 禁止事项（在 ADR 确认前）

- ❌ 禁止继续修复 C VM 的元循环执行能力
- ❌ 禁止为了让 vm_run.tllbc 在 C VM 中运行而增加 C 侧 TLL 语义
- ❌ 禁止删除或重写 vm.tll
- ❌ 禁止修改 opcode contract（42-45 闭包 opcode）
- ❌ 禁止修改 TLL Language Core

### 5.2 允许事项

- ✅ 修复 C VM 直接执行用户程序时的 bug
- ✅ 完善规范文档
- ✅ 建立一致性测试套件
- ✅ 完善 CLI 工具链

---

## 6. 附录: 术语定义

| 术语 | 定义 |
|------|------|
| **生产 VM** | 最终用户运行 TLL 程序时使用的 VM |
| **Reference VM** | 用于验证语言语义、自举测试的 VM 实现 |
| **Stage-0 Bootstrap** | 从零启动 TLL 编译器的最小执行环境 |
| **元循环解释器** | 用语言自身实现的解释器来执行该语言的程序 |
| **Host ABI** | VM 与操作系统之间的接口（文件、网络、进程等） |
| **Opcode Contract** | bytecode 指令的格式与语义规范，所有 VM 实现必须遵守 |

---

## 7. 决策记录

| 日期 | 决策 | 理由 |
|------|------|------|
| 2026-08-26 | 初始 ADR 提交，待确认 | C VM 元循环执行失败，需要明确生产执行器架构 |

---

**下一步**: 等待架构确认后，进入阶段 2（规范固化）。
