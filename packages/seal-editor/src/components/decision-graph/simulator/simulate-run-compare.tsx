import React from 'react';

import { useT } from '../../../theming/i18n';
import { diffRunPaths, runOutputText, runOutputsEqual } from './simulate-run-diff';
import type { Simulation } from './simulation.types';

/**
 * 运行对比详情（六铁律「运行可对比」的完整形态）：命中路径 diff（节点集差 +
 * 同节点规则行差）+ 输出对照（基准淡红底在上、对比淡绿底在下——含错误文本，
 * 错误与正常输出的对比同样有诊断价值）。经 runs 面板懒加载（shiki/editor 树不进主包）。
 */
export const SimulateRunCompare: React.FC<{
  base: Simulation;
  compare: Simulation;
  baseLabel: string;
  compareLabel: string;
}> = ({ base, compare, baseLabel, compareLabel }) => {
  const t = useT();
  const pathDiff = diffRunPaths(base, compare);
  const pathsSame =
    pathDiff.nodesOnlyInBase.length === 0 &&
    pathDiff.nodesOnlyInCompare.length === 0 &&
    pathDiff.ruleDiffs.length === 0;
  const outputsSame = runOutputsEqual(base, compare);

  return (
    <div className='flex flex-col gap-2' data-testid='simulate-run-compare'>
      <section>
        <div className='mb-1 flex items-center gap-2'>
          <span className='text-[10px] font-medium uppercase opacity-60'>{t('dg.simulation.comparePaths')}</span>
          {pathsSame ? (
            <span className='rounded-sm bg-success/10 px-1 text-[10px] text-success'>
              {t('dg.simulation.compareSame')}
            </span>
          ) : null}
        </div>
        {!pathsSame && (
          <div className='flex flex-col gap-1 rounded-md bg-muted/60 p-2 font-mono text-[10px] leading-relaxed'>
            {pathDiff.nodesOnlyInBase.map((nodeId) => (
              <div key={`base-${nodeId}`} className='text-destructive'>
                − {nodeId} · {t('dg.simulation.compareOnlyInBase')}
              </div>
            ))}
            {pathDiff.nodesOnlyInCompare.map((nodeId) => (
              <div key={`compare-${nodeId}`} className='text-success'>
                + {nodeId} · {t('dg.simulation.compareOnlyInCompare')}
              </div>
            ))}
            {pathDiff.ruleDiffs.map(({ nodeId, baseRuleIds, compareRuleIds }) => (
              <div key={`rules-${nodeId}`} className='flex flex-col'>
                <span className='opacity-70'>~ {nodeId}</span>
                <span className='text-destructive'>
                  − [{baseRuleIds.join(', ')}] · {baseLabel}
                </span>
                <span className='text-success'>
                  + [{compareRuleIds.join(', ')}] · {compareLabel}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <div className='mb-1 flex items-center gap-2'>
          <span className='text-[10px] font-medium uppercase opacity-60'>{t('dg.simulation.compareOutput')}</span>
          {outputsSame ? (
            <span className='rounded-sm bg-success/10 px-1 text-[10px] text-success'>
              {t('dg.simulation.compareSame')}
            </span>
          ) : null}
        </div>
        {!outputsSame && (
          <div className='flex flex-col gap-1'>
            <pre className='max-h-40 overflow-auto rounded-md bg-destructive/10 p-2 font-mono text-[10px] leading-relaxed'>
              {`− ${baseLabel}\n${runOutputText(base)}`}
            </pre>
            <pre className='max-h-40 overflow-auto rounded-md bg-success/10 p-2 font-mono text-[10px] leading-relaxed'>
              {`+ ${compareLabel}\n${runOutputText(compare)}`}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};

export default SimulateRunCompare;
