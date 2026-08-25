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

### 3. Module System ⏳
### 4. Type System ⏳
### 5. Bytecode ⏳
### 6. TLL VM ⏳
### 7. Stdlib ⏳
### 8. Exception ⏳ (与第2项关联)
### 9. Closure ⏳
### 10. Agent/Workflow ⏳
### 11. CLI ⏳
### 12. Package ⏳
### 13. Cross-platform ⏳
### 14. Clean-room ⏳
### 15. CI ⏳
### 16. Self-host ✅
- A==B 验证通过（参考VM 5.15秒）
- TLL VM自举: 性能优化中（~15分钟CPU）

### 17. Runtime Independence ⚠️
- TLL VM正确性已验证
- 性能瓶颈: 双重解释导致~15分钟CPU时间
- 参考VM(TS Runtime): 5.15秒

## 关键Bug修复记录（9cbb0a9）
1. 直接调用误判builtin
2. 间接调用builtin对象传递错误
3. 寄存器数量不足(256->2048)
4. vm_setReg O(n)复制->O(1)索引赋值
5. 参数收集O(n²)->O(n)
6. 全部opcode内联到主循环
7. 9个常用builtin内联
