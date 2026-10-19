import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import { VariableType, validateExpression, validateUnaryExpression } from '@gorules/zen-engine-wasm';
import { P, match } from 'ts-pattern';

import { codemirror } from '../../../helpers/codemirror';
import { isWasmAvailable } from '../../../helpers/wasm';
import { analyzeDollarNavigationPositions, analyzeExpressionValue } from '../../../helpers/zen-dollar-hints';
import { renderDiagnosticMessage } from './diagnostic';
import type { ZenType } from './types';
import {
  typeField,
  updateDollarContextEffect,
  updateExpectedVariableTypeEffect,
  updateExpressionTypeEffect,
  updateStrictModeEffect,
  updateVariableTypeEffect,
  zenKindToString,
} from './types';

/** E 恒值比较哨兵：比较符两侧均为字面量 → 条件恒定（作者笔误高发信号）。hint 级，不求值。 */
export const findConstantComparisons = (source: string): { start: number; end: number; ref: string }[] => {
  const re =
    /(?<![\w'"])(?:'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(?:'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?)(?![\w'"])/g;
  return [...source.matchAll(re)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    ref: m[0].replace(/\s+/g, ' '),
  }));
};

type ExpressionError = {
  type: string;
  source: string;
};

const extractPosition = (error: string): [number, number] | number | null => {
  try {
    const splitError = error.split(' at ');
    if (splitError.length <= 1) {
      return null;
    }

    const positions = splitError.pop()!;
    const trimmed = positions.replace('(', '').replace(')', '');
    const [left, right] = trimmed.split(', ');

    if (right) {
      return [parseInt(left), parseInt(right)];
    }

    return parseInt(left);
  } catch {
    return null;
  }
};

const lintExpression = (type: string, source: string): Diagnostic[] => {
  try {
    if (!isWasmAvailable()) {
      return [];
    }

    const error: ExpressionError = match(type)
      .with('standard', () => validateExpression(source))
      .with('unary', () => validateUnaryExpression(source))
      .otherwise(() => null);
    if (!error) {
      return [];
    }

    const position = match(extractPosition(error.source))
      .with(P.number, (n) => ({ from: n, to: n }))
      .with([P.number, P.number], ([l, r]) => ({ from: l, to: r }))
      .otherwise(() => ({ from: 0, to: source.length }));

    const errorSource = match(error.type)
      .with('parserError', () => 'Parser error')
      .with('lexerError', () => 'Lexer error')
      .with('compilerError', () => 'Compiler error')
      .with('vmError', () => 'VM error')
      .otherwise((n) => n);

    return [
      {
        from: position.from,
        to: position.to,
        message: error.source,
        source: errorSource,
        severity: 'error',
      },
    ];
  } catch (err) {
    return [
      {
        from: 0,
        to: source.length,
        message: String(err),
        severity: 'error',
      },
    ];
  }
};

export const zenLinter = (type: string) => {
  if (!isWasmAvailable()) {
    return [];
  }

  return codemirror.linter(
    (view) => {
      view.dom.setAttribute('data-severity', 'none');
      const tFields = view.state.field(typeField);

      const source = view.state.doc.toString();
      const diagnostics = validateZenExpression({
        source,
        expressionType: type as 'standard',
        strict: tFields.strict,
        types: tFields.types,
        expectedVariableType: tFields.expectedVariableType,
      });

      // ADR-021/$ 语义哨兵（zen-reference §1.5）：按表面注入上下文分派诊断——
      // expression-row：`$.<输入字段>` 静默丢行（bare-name 修复）；
      // dt-cell：全表达式单元 `$.` 恒不命中（$root/裸名修复）。null = 关闭。
      const dollarDiagnostics: Diagnostic[] = (() => {
        const ctx = tFields.dollarCtx;
        if (!ctx) {
          return [];
        }
        if (ctx.kind === 'dt-cell') {
          const constantHints = findConstantComparisons(source).map((hit) => ({
            from: hit.start,
            to: hit.end,
            severity: 'hint' as const,
            message:
              'Constant comparison — both sides are literals, so the condition never varies. Confirm this is intentional.',
            source: 'Constant comparison',
          }));
          return [
            ...constantHints,
            ...analyzeDollarNavigationPositions(source).map((hit) => ({
              from: hit.start,
              to: hit.end,
              severity: 'warning' as const,
              message: `"${hit.ref}" never matches in table cells — use "$root." or the bare name instead.`,
              source: 'Dollar scope',
              actions: [
                {
                  name: 'Strip "$." prefix',
                  apply: (lintView: EditorView, fixFrom: number, fixTo: number) =>
                    lintView.dispatch({
                      changes: { from: fixFrom + 2, to: fixTo, insert: '' },
                    }),
                },
              ],
            })),
          ];
        }
        return analyzeExpressionValue(source, ctx).map((hint) => ({
          from: hint.start,
          to: hint.end,
          severity: 'warning' as const,
          message: `"${hint.ref}" reads an input field via $ — rows only cover row outputs; write "${hint.suggestion}" (bare name) or the row is silently dropped.`,
          source: 'Dollar scope',
          actions: hint.suggestion
            ? [
                {
                  name: `Use "${hint.suggestion}"`,
                  apply: (lintView: EditorView, fixFrom: number, fixTo: number) =>
                    lintView.dispatch({
                      changes: { from: fixFrom, to: fixTo, insert: hint.suggestion ?? '' },
                    }),
                },
              ]
            : undefined,
        }));
      })();

      const allDiagnostics = [...diagnostics, ...dollarDiagnostics];

      if (allDiagnostics.some((d) => d.severity === 'error')) {
        view.dom.setAttribute('data-severity', 'error');
      } else if (allDiagnostics.some((d) => d.severity === 'warning')) {
        view.dom.setAttribute('data-severity', 'warning');
      } else if (allDiagnostics.some((d) => d.severity === 'info')) {
        view.dom.setAttribute('data-severity', 'info');
      } else if (allDiagnostics.some((d) => d.severity === 'hint')) {
        view.dom.setAttribute('data-severity', 'hint');
      }

      return allDiagnostics;
    },
    {
      needsRefresh: (update) => {
        return update.transactions.some((t) =>
          t.effects.some(
            (effect) =>
              effect.is(updateExpressionTypeEffect) ||
              effect.is(updateVariableTypeEffect) ||
              effect.is(updateExpectedVariableTypeEffect) ||
              effect.is(updateStrictModeEffect) ||
              effect.is(updateDollarContextEffect),
          ),
        );
      },
    },
  );
};

type ValidateZenExpressionParams = {
  source: string;
  expressionType?: 'standard' | 'unary';
  strict?: boolean;
  /** Generated by variableType.typeCheckUnary and variableType.typeCheckUnary **/
  types: ZenType[];
  expectedVariableType?: VariableType;
};

export const validateZenExpression = ({
  source,
  expressionType = 'standard',
  strict = false,
  types,
  expectedVariableType,
}: ValidateZenExpressionParams): Diagnostic[] => {
  if (source.trim().length === 0) {
    return [];
  }

  const expressionDiagnostics = source ? lintExpression(expressionType, source) : [];
  const typeDiagnostics: Diagnostic[] = types
    .filter((t) => !!t.error)
    .map((t) =>
      createDiagnostic({
        from: t.span[0],
        to: t.span[1],
        severity: match(t.error as string)
          .with(P.string.startsWith('Hint:'), () => 'hint' as const)
          .with(P.string.startsWith('Info:'), () => 'info' as const)
          .otherwise(() => 'warning' as const),
        message: t.error as string,
        source: 'Type check',
      }),
    );

  const diagnostics = [...expressionDiagnostics, ...typeDiagnostics];

  if (expressionType === 'unary' && types.length > 0) {
    const expressionResultKind = types[0].kind;
    if (expressionResultKind !== 'Bool') {
      diagnostics.push(
        createDiagnostic({
          from: 0,
          to: source.length,
          severity: strict ? 'error' : 'warning',
          message: `Expected unary expression to evaluate to type \`bool\`, received \`${zenKindToString(expressionResultKind)}\` instead.`,
          source: 'Type check',
        }),
      );
    }
  } else if (expectedVariableType && types.length > 0) {
    const expressionResultKind = types[0].kind;
    const expressionResultVt = VariableType.fromJson(expressionResultKind);
    const typesEqual = match([strict, expressionResultKind])
      .with([true, 'Any'], () => false)
      .otherwise(() => expressionResultVt.satisfies(expectedVariableType));

    if (!typesEqual) {
      diagnostics.push(
        createDiagnostic({
          from: 0,
          to: source.length,
          severity: strict ? 'error' : 'warning',
          message: `Expected expression to evaluate to type \`${zenKindToString(expectedVariableType.toJson())}\`, received \`${zenKindToString(expressionResultKind)}\` instead.`,
          source: 'Type check',
        }),
      );
    }
  }

  return diagnostics;
};

const createDiagnostic = (diagnostic: Diagnostic): Diagnostic => {
  diagnostic.renderMessage = (_) => {
    const element = document.createElement('div');
    element.innerHTML = renderDiagnosticMessage({
      text: diagnostic.message,
      className: 'cm-diagnosticMessageToken',
    });

    return element;
  };

  return diagnostic;
};
