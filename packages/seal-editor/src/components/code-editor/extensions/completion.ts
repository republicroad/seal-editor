import { getCompletions as getCompletionsWasm } from '@gorules/zen-engine-wasm';

import { isWasmAvailable } from '../../../helpers/wasm';

type Completion = {
  kind: string;
  type?: string;
  label: string;
  detail: string;
  info: string;
  boost?: number;
};

let completions: Completion[] = [];

// 轨道 B（A2，移植自 jdm 批 1）：注入自定义函数（zen-udf registry）补全条目。
// 与 WASM 内置补全合并后，全部 zen 表达式编辑器即时获得 UDF 补全与悬停文档
// （hover 按 label 匹配）。模块级槽位：setUdfCompletions 整体替换，传 [] 即清空。
let udfCompletions: Completion[] = [];

export type UdfCompletionTool = {
  name: string;
  title?: string;
  description?: string;
  /** A4：弃用标记（zen-udf schema 透传），置补全文档首行警示 */
  deprecated?: { since?: string; note?: string };
  parameters?: {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
};

export const setUdfCompletions = (tools: UdfCompletionTool[]) => {
  udfCompletions = tools.map((tool) => {
    const props = Object.entries(tool.parameters?.properties ?? {});
    const required = new Set(tool.parameters?.required ?? []);
    const infoLines = [
      ...(tool.deprecated
        ? [
            '⚠️ 已弃用' +
              (tool.deprecated.since ? `（自 ${tool.deprecated.since} 起）` : '') +
              (tool.deprecated.note ? `: ${tool.deprecated.note}` : ''),
          ]
        : []),
      `<b>${tool.title ?? tool.name}</b>`,
      tool.description ?? '',
      props.length
        ? `参数: ${props
            .map(([name, p]) => {
              const req = required.has(name) ? '' : '?';
              const desc = p.description ? ` — ${p.description}` : '';
              return `${name}${req} (${p.type ?? 'any'})${desc}`;
            })
            .join(', ')}`
        : '无参数',
    ].filter(Boolean);

    return {
      kind: 'function',
      type: 'function',
      label: tool.name,
      detail: `${tool.name}(${props.map(([name]) => name).join(', ')})`,
      info: infoLines.join('<br/>'),
      boost: 20,
    };
  });
};

export const getCompletions = () => {
  if (!isWasmAvailable() || completions.length > 0) {
    return completions.concat(udfCompletions);
  }

  completions = getCompletionsWasm();
  return completions.concat(udfCompletions);
};
