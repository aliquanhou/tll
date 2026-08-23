/**
 * TLL AST - Bootstrap Compiler (TypeScript)
 * Abstract Syntax Tree definitions per TLL Language Specification 0.1
 */

export type Node = Statement | Expression;

export interface BaseNode {
  line: number;
  column: number;
}

// ============ Statements ============

export type Statement =
  | LetStatement
  | ConstStatement
  | FnDeclaration
  | ReturnStatement
  | IfStatement
  | WhileStatement
  | ForStatement
  | BreakStatement
  | ContinueStatement
  | DeferStatement
  | TryStatement
  | ThrowStatement
  | ExpressionStatement
  | BlockStatement
  | StructDeclaration
  | EnumDeclaration
  | InterfaceDeclaration
  | ImplDeclaration
  | ImportStatement
  | ExportStatement
  | TypeAliasStatement
  | AgentDeclaration
  | ToolDeclaration
  | WorkflowDeclaration
  | IntentDeclaration
  | EntityDeclaration
  | ApiDeclaration
  | ApplicationDeclaration
  | PackageDeclaration;

export interface LetStatement extends BaseNode {
  kind: 'Let';
  mutable: boolean;
  name: string;
  typeAnnotation?: TypeNode;
  value: Expression;
}

export interface ConstStatement extends BaseNode {
  kind: 'Const';
  name: string;
  typeAnnotation?: TypeNode;
  value: Expression;
}

export interface FnDeclaration extends BaseNode {
  kind: 'Fn';
  isPub: boolean;
  isAsync: boolean;
  name: string;
  params: Param[];
  returnType?: TypeNode;
  body: BlockStatement;
}

export interface Param {
  name: string;
  type: TypeNode;
}

export interface ReturnStatement extends BaseNode {
  kind: 'Return';
  value?: Expression;
}

export interface IfStatement extends BaseNode {
  kind: 'If';
  condition: Expression;
  consequent: BlockStatement;
  alternate?: BlockStatement | IfStatement;
}

export interface WhileStatement extends BaseNode {
  kind: 'While';
  condition: Expression;
  body: BlockStatement;
}

export interface ForStatement extends BaseNode {
  kind: 'For';
  variable: string;
  iterable: Expression;
  body: BlockStatement;
}

export interface BreakStatement extends BaseNode {
  kind: 'Break';
  label?: string;
}

export interface ContinueStatement extends BaseNode {
  kind: 'Continue';
  label?: string;
}

export interface DeferStatement extends BaseNode {
  kind: 'Defer';
  expression: Expression;
}

export interface TryStatement extends BaseNode {
  kind: 'Try';
  body: BlockStatement;
  catchParam?: string;
  catchBody?: BlockStatement;
  finallyBody?: BlockStatement;
}

export interface ThrowStatement extends BaseNode {
  kind: 'Throw';
  value: Expression;
}

export interface ExpressionStatement extends BaseNode {
  kind: 'ExpressionStatement';
  expression: Expression;
}

export interface BlockStatement extends BaseNode {
  kind: 'Block';
  statements: Statement[];
}

export interface StructDeclaration extends BaseNode {
  kind: 'Struct';
  isPub: boolean;
  name: string;
  fields: FieldDef[];
}

export interface FieldDef {
  name: string;
  type: TypeNode;
  defaultValue?: Expression;
}

export interface EnumDeclaration extends BaseNode {
  kind: 'Enum';
  isPub: boolean;
  name: string;
  generics?: string[];
  variants: EnumVariant[];
}

export interface EnumVariant {
  name: string;
  kind: 'unit' | 'tuple' | 'struct';
  tupleTypes?: TypeNode[];
  fields?: FieldDef[];
}

export interface InterfaceDeclaration extends BaseNode {
  kind: 'Interface';
  isPub: boolean;
  name: string;
  methods: MethodSignature[];
}

export interface MethodSignature {
  name: string;
  params: Param[];
  returnType?: TypeNode;
  isAsync: boolean;
  body?: BlockStatement;
}

export interface ImplDeclaration extends BaseNode {
  kind: 'Impl';
  interfaceName?: string;
  targetType: string;
  methods: FnDeclaration[];
}

export interface ImportStatement extends BaseNode {
  kind: 'Import';
  modulePath: string;
  alias?: string;
  namedImports?: string[];
  isWildcard: boolean;
}

export interface ExportStatement extends BaseNode {
  kind: 'Export';
  declaration: Statement; // FnDeclaration | ConstStatement | LetStatement | StructDeclaration
}

export interface TypeAliasStatement extends BaseNode {
  kind: 'TypeAlias';
  isPub: boolean;
  name: string;
  type: TypeNode;
}

export interface AgentDeclaration extends BaseNode {
  kind: 'Agent';
  name: string;
  properties: Record<string, Expression>;
}

export interface ToolDeclaration extends BaseNode {
  kind: 'Tool';
  name: string;
  params: Param[];
  returnType?: TypeNode;
  body: BlockStatement;
}

export interface WorkflowDeclaration extends BaseNode {
  kind: 'Workflow';
  name: string;
  properties: Record<string, Expression>;
}

export interface IntentDeclaration extends BaseNode {
  kind: 'Intent';
  name: string;
  params: Param[];
  returnType?: TypeNode;
  properties: Record<string, Expression>;
}

export interface EntityDeclaration extends BaseNode {
  kind: 'Entity';
  name: string;
  fields: EntityField[];
}

export interface EntityField {
  name: string;
  type: TypeNode;
  attributes: Record<string, Expression>;
}

export interface ApiDeclaration extends BaseNode {
  kind: 'Api';
  name: string;
  properties: Record<string, Expression>;
  endpoints: ApiEndpoint[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  returnType?: TypeNode;
  handler: string;
  properties: Record<string, Expression>;
}

export interface ApplicationDeclaration extends BaseNode {
  kind: 'Application';
  name: string;
  properties: Record<string, Expression>;
}

export interface PackageDeclaration extends BaseNode {
  kind: 'Package';
  name: string;
  properties: Record<string, Expression>;
}

// ============ Expressions ============

export type Expression =
  | IdentExpression
  | IntLiteral
  | FloatLiteral
  | StringLiteral
  | BoolLiteral
  | NullLiteral
  | ArrayLiteral
  | MapLiteral
  | TupleLiteral
  | StructLiteral
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | MemberExpression
  | IndexExpression
  | LambdaExpression
  | MatchExpression
  | IfExpression
  | BlockExpression
  | AwaitExpression
  | SpawnExpression
  | PipeExpression
  | RangeExpression
  | OptionSome
  | OptionNone
  | ResultOk
  | ResultErr
  | SelfExpression;

export interface IdentExpression extends BaseNode {
  kind: 'Ident';
  name: string;
}

export interface IntLiteral extends BaseNode {
  kind: 'Int';
  value: string;
}

export interface FloatLiteral extends BaseNode {
  kind: 'Float';
  value: string;
}

export interface StringLiteral extends BaseNode {
  kind: 'String';
  value: string;
  raw: boolean;
}

export interface BoolLiteral extends BaseNode {
  kind: 'Bool';
  value: boolean;
}

export interface NullLiteral extends BaseNode {
  kind: 'Null';
}

export interface ArrayLiteral extends BaseNode {
  kind: 'Array';
  elements: Expression[];
  typeAnnotation?: TypeNode;
}

export interface MapLiteral extends BaseNode {
  kind: 'Map';
  entries: { key: Expression; value: Expression }[];
}

export interface TupleLiteral extends BaseNode {
  kind: 'Tuple';
  elements: Expression[];
}

export interface StructLiteral extends BaseNode {
  kind: 'StructLiteral';
  typeName: string;
  fields: { name: string; value: Expression }[];
}

export interface BinaryExpression extends BaseNode {
  kind: 'Binary';
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression extends BaseNode {
  kind: 'Unary';
  operator: string;
  operand: Expression;
}

export interface CallExpression extends BaseNode {
  kind: 'Call';
  callee: Expression;
  args: Expression[];
}

export interface MemberExpression extends BaseNode {
  kind: 'Member';
  object: Expression;
  property: string;
}

export interface IndexExpression extends BaseNode {
  kind: 'Index';
  object: Expression;
  index: Expression;
}

export interface LambdaExpression extends BaseNode {
  kind: 'Lambda';
  params: Param[];
  returnType?: TypeNode;
  body: BlockStatement | Expression;
  isAsync: boolean;
}

export interface MatchExpression extends BaseNode {
  kind: 'Match';
  scrutinee: Expression;
  arms: MatchArm[];
}

export interface MatchArm {
  pattern: Pattern;
  body: Expression;
}

export type Pattern =
  | { kind: 'Wildcard' }
  | { kind: 'Literal'; value: Expression }
  | { kind: 'Ident'; name: string }
  | { kind: 'EnumVariant'; variant: string; fields?: string[] }
  | { kind: 'Tuple'; patterns: Pattern[] };

export interface IfExpression extends BaseNode {
  kind: 'IfExpr';
  condition: Expression;
  consequent: BlockStatement;
  alternate?: BlockStatement | IfExpression;
}

export interface BlockExpression extends BaseNode {
  kind: 'BlockExpr';
  statements: Statement[];
  result?: Expression;
}

export interface AwaitExpression extends BaseNode {
  kind: 'Await';
  expression: Expression;
}

export interface SpawnExpression extends BaseNode {
  kind: 'Spawn';
  expression: Expression;
}

export interface PipeExpression extends BaseNode {
  kind: 'Pipe';
  left: Expression;
  right: Expression;
}

export interface RangeExpression extends BaseNode {
  kind: 'Range';
  start: Expression;
  end: Expression;
  inclusive: boolean;
}

export interface OptionSome extends BaseNode {
  kind: 'Some';
  value: Expression;
}

export interface OptionNone extends BaseNode {
  kind: 'None';
}

export interface ResultOk extends BaseNode {
  kind: 'Ok';
  value: Expression;
}

export interface ResultErr extends BaseNode {
  kind: 'Err';
  value: Expression;
}

export interface SelfExpression extends BaseNode {
  kind: 'Self';
}

// ============ Type Nodes ============

export type TypeNode =
  | { kind: 'Named'; name: string; generics?: TypeNode[] }
  | { kind: 'Array'; element: TypeNode; size?: number }
  | { kind: 'List'; element: TypeNode }
  | { kind: 'Map'; key: TypeNode; value: TypeNode }
  | { kind: 'Tuple'; elements: TypeNode[] }
  | { kind: 'Function'; params: TypeNode[]; returnType: TypeNode }
  | { kind: 'Optional'; inner: TypeNode }
  | { kind: 'Reference'; inner: TypeNode; mutable: boolean }
  | { kind: 'Result'; ok: TypeNode; err: TypeNode }
  | { kind: 'Void' };

// ============ Program ============

export interface Program {
  statements: Statement[];
}
