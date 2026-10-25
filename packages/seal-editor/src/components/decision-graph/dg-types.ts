import type { z } from 'zod';

import type { nodeSchema } from '../../helpers/schema';

export const privateSymbol = Symbol('private');

export type Position = {
  x: number;
  y: number;
};

type NodeSchema = z.infer<typeof nodeSchema>;

export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged' | 'moved';

export type Diff<T = any> = {
  _diff?: DiffMetadata<T>;
};

export type DiffMetadata<T = any> = {
  status?: DiffStatus;
  previousValue?: T;
  previousIndex?: number;
  currentIndex?: number;
  fields?: Record<string, DiffMetadata>;
};

export type DecisionNode<T = any> = {
  id: string;
  name: string;
  description?: string;
  type?: NodeSchema['type'] | string;
  content?: T;
  position: Position;
  [privateSymbol]?: {
    dimensions?: { height?: number; width?: number };
    selected?: boolean;
  };
  _diff?: {
    status: DiffStatus;
    fields?: Record<string, DiffMetadata>;
  };
};

export type DecisionEdge = {
  id: string;
  name?: string;
  sourceId: string;
  targetId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  _diff?: {
    status: DiffStatus;
  };
};

export type DecisionGraphType = {
  nodes: DecisionNode[];
  edges: DecisionEdge[];
  /**
   * B1 图可读性工程：注释框（随图持久化；引擎面不可见——引擎只读 nodes/edges，
   * 本字段为编辑器视觉资产，serde 容忍额外根键）。
   */
  annotations?: DecisionGraphAnnotation[];
};

/** 注释框（Unreal/ComfyUI comment box 形态）：可拖拽/缩放的背景便签 */
export type DecisionGraphAnnotation = {
  id: string;
  text: string;
  position: Position;
  width: number;
  height: number;
};

export type UserResolver = () => Promise<{
  user?: string;
}> | null;
