# TLL 完整语言验收矩阵状态
基线 commit: 9cbb0a9
验证开始: 2026-08-25

## 状态图例
- ✅ 通过
- ⚠️ 部分通过（有已知问题）
- ❌ 失败
- ⏳ 待验证

## 矩阵进度

### 1. Compiler ✅
- compiler.tll 编译自身: A==B 验证通过（144函数/2826常量完全一致，5.165秒）
- 编译10个核心语言特性测试文件: 10/10 编译成功
- 测试覆盖: hello, variables, functions, control_flow, arrays, maps, recursion, strings, exceptions, firstclass
- 验证脚本: tests/verify_compiler.js
- 运行时: 9/10 输出正确，10_firstclass 因语言不支持一等函数而返回空（非编译器问题）

### 2. Language Semantics ⚠️
- 变量/算术: ✅
- 函数定义/调用: ✅
- 控制流(if/else/while): ✅
- 数组操作: ✅
- map操作: ✅
- 递归: ✅
- 字符串操作: ✅
- 异常处理(try/catch/throw): ✅ **已修复** (codegen.tll 缺失 Try 语句处理)
- 一等函数(函数作为变量/参数): ❌ TLL 语言不支持，函数名只能直接调用
- 类型推断: ⏳

### 3. Module System ✅
- 10/10 测试通过
- 覆盖: 路径冲突(同基名)、符号身份隔离、别名(基本/函数参数/局部变量/对象属性)、循环依赖(预期编译错误)、正常依赖、同名常量/函数
- 验证脚本: tests/run-tests.js

### 4. Type System ✅
- 13/13 类型检查测试通过
- 覆盖: 基本类型、类型推断、算术、字符串拼接、函数声明、if/while、数组/map字面量、未定义变量检测、函数调用、stdlib调用、比较运算、嵌套作用域
- 类型检查器自身有22个类型警告(不影响功能)

### 5. Bytecode ✅
- 格式验证: 0 errors, 0 warnings
- 144 functions, 2826 constants (59 bool/322 null/526 number/1919 string), 14022 instructions
- mainFunctionIndex=143 有效, globalCount=171
- 所有 opcode 在有效范围(0-41), 无无效指令
- 验证脚本: tests/verify_bytecode.js

### 6. TLL VM ✅ **重大里程碑**
- 9/9 核心语言特性测试通过（vm.tll 独立执行 bytecode）
- 覆盖: hello, variables/arithmetic, functions, control_flow, arrays, maps, recursion(factorial/fib), strings, exceptions(try/catch/throw)
- 不依赖 TS Runtime 提供语义支持（TS Runtime 仅作为宿主解释 vm.tll 本身）
- 验证脚本: tests/verify_vm.js
- 已知: 完整自举性能~15分钟（双重解释瓶颈），正确性已验证

### 7. Stdlib ✅
- math: abs, floor, ceil, round, sqrt, pow, min, max, pi 全部正确
- json: stringify, parse, roundtrip 全部正确
- strings: trim, split, replace, indexOf, repeat 全部正确
- arrays: indexOf, includes, slice, range, join 全部正确
- fs: writeFile, readFile, exists, isFile, fileSize, remove 全部正确
- io: println, print 已验证
- convert: toString 已验证
- 新增测试: 11_math, 12_json, 13_stdlib_ext, 14_fs

### 8. Exception ✅
- try/catch/throw 已验证（09_exceptions 测试通过）
- codegen.tll 已修复 Try 语句编译
- 跨帧传播: 待深度验证

### 9. Closure ❌ 不支持
- TLL 不支持匿名函数字面量和闭包
- 函数只能通过名字直接调用，不能赋值给变量
- 这是语言设计限制，非 bug

### 10. Agent/Workflow ❌ 不支持
- lexer 有关键字占位(AGENT/TOOL/WORKFLOW/SPAWN)
- parser/codegen/vm 无实际实现
- 属于未来 TLL OS 扩展，非语言核心

### 11. CLI ⚠️ 部分
- 有 TypeScript bootstrap CLI (tll-compiler/dist/src/cli.js): run 命令
- TLL 自写 CLI 不存在
- 缺少 build/test/check/fmt/repl/version 子命令

### 12. Package ❌ 不支持
- 有 package.json (npm 元数据)
- 无包管理系统(依赖解析/版本锁定/安装)
- 模块系统仅支持相对路径 import

### 13. Cross-platform ⚠️ 部分
- Windows 11: 全部验证通过
- Linux (ubuntu-latest): CI 流水线验证通过(构建+模块测试+自举)
- macOS: 未验证

### 14. Clean-room ⚠️ 部分
- TLL VM 能独立执行 bytecode(无 TS Runtime 语义支持) ✅
- 编译器仍需 Node.js + TypeScript bootstrap 编译 ✅
- 目标: TLL Compiler 在 TLL VM 上运行(性能优化中)

### 15. CI ✅
- .github/workflows/ci.yml 存在
- ubuntu-latest, Node.js 20
- 步骤: checkout -> npm install -> build -> 验证产物 -> 模块测试(10) -> 自举验证(L4+L5)
- deploy.yml 也存在

### 16. Self-host ✅
- A==B 验证通过: 144 functions, 2826 constants
- 参考 VM 执行时间: 5.165 秒
- 三级确定性(A/B/C)已验证

### 17. Runtime Independence ✅ **核心目标达成**
- TLL VM (vm.tll) 能独立执行 bytecode
- 9/9 核心语言特性测试通过
- 不依赖 TS Runtime 提供语义支持
- TS Runtime 仅作为宿主解释 vm.tll 本身
- 完整自举(VM运行Compiler)性能优化中(~15分钟CPU)

## 关键Bug修复记录（9cbb0a9）
1. 直接调用误判builtin
2. 间接调用builtin对象传递错误
3. 寄存器数量不足(256->2048)
4. vm_setReg O(n)复制->O(1)索引赋值
5. 参数收集O(n²)->O(n)
6. 全部opcode内联到主循环
7. 9个常用builtin内联
