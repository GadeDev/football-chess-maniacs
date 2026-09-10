// ============================================================
// index.ts — AI モジュール エクスポート
// ============================================================

// 共通型
export type { Difficulty, Era } from './types';

// 局面評価（§4）
export { evaluateBoard, recommendStrategy } from './evaluator';
export type { EvaluationResult, Strategy } from './evaluator';

// 合法手生成（§5）
export { generateAllLegalMoves } from './legal_moves';
export type { PieceLegalMoves, LegalAction, LegalMovesContext, ShootZone } from './legal_moves';

// ルールベースAI（COM対戦の判断層 / ブートストラップ）
export { generateRuleBasedOrders } from './rule_based';
export type { RuleBasedInput, RuleBasedOutput } from './rule_based';
