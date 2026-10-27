/**
 * Internal icon layer.
 *
 * Most icons are re-exported from lucide-react under their historical
 * names used by the editor surface; a few frequent actions use ReUI Motion Icons
 * (`src/reui/icons/*`) for hover animations. Components migrate by
 * swapping the import path only.
 */
import SuccessCircleIcon from './reui/icons/animated/outline/check-circle';
import CrossIcon from './reui/icons/animated/outline/cross';
import PencilIcon from './reui/icons/animated/outline/pencil';
import PlayCircleIcon from './reui/icons/animated/outline/play-circle';
import RefreshArrowClockwiseIcon from './reui/icons/animated/outline/refresh-arrow-clockwise';
import TrashSquareIcon from './reui/icons/animated/outline/trash-square';
/** 试点（reui icon 替换 lucide 试水，视觉裁定后定去留）：simulator 工具条四动作的 ReUI 面性形态 */
import BrushReuiIcon from './reui/icons/default/outline/brush';
import CirclePlayReuiIcon from './reui/icons/default/outline/circle-play';
import CommandReuiIcon from './reui/icons/default/outline/command';
import CopyReuiIcon from './reui/icons/default/outline/copy';
import EntranceUpReuiIcon from './reui/icons/default/outline/entrance-up';
import ExitUpReuiIcon from './reui/icons/default/outline/exit-up';
import LayoutEqualReuiIcon from './reui/icons/default/outline/layout-equal';
import LayoutHeaderColumnsReuiIcon from './reui/icons/default/outline/layout-header-columns';
import PlusCircleReuiIcon from './reui/icons/default/outline/plus-circle';

export {
  BrushReuiIcon as FormatPilotReui,
  CirclePlayReuiIcon as RunPilotReui,
  CommandReuiIcon as CommandPilotReui,
  CopyReuiIcon as CopyPilotReui,
  EntranceUpReuiIcon as DownloadPilotReui,
  ExitUpReuiIcon as UploadPilotReui,
  LayoutEqualReuiIcon as AutoLayoutPilotReui,
  LayoutHeaderColumnsReuiIcon as SnapPilotReui,
  PlusCircleReuiIcon as PlusCirclePilotReui,
};

export {
  AlignHorizontalDistributeCenter as AutoLayoutOutlined,
  Columns3 as TableColumnsOutlined,
  Network as ApartmentOutlined,
  Plug as ApiOutlined,
  ArrowDown as ArrowDownOutlined,
  ArrowRight as ArrowRightOutlined,
  ArrowUp as ArrowUpOutlined,
  BookOpen as BookOutlined,
  Check as CheckOutlined,
  CircleCheckBig as CheckCircleTwoTone,
  MessageSquareText as CommentOutlined,
  Eraser as ClearOutlined,
  CircleX as CloseCircleTwoTone,
  CloudDownload as CloudDownloadOutlined,
  CloudUpload as CloudUploadOutlined,
  Minimize2 as CompressOutlined,
  GitFork as DeploymentUnitOutlined,
  ChevronDown as DownOutlined,
  Move as DragOutlined,
  Upload as ExportOutlined,
  Paintbrush as FormatPainterOutlined,
  GripVertical as HolderOutlined,
  Download as ImportOutlined,
  WandSparkles as WandOutlined,
  Info as InfoCircleOutlined,
  ChevronLeft as LeftOutlined,
  SquareMinus as MinusSquareOutlined,
  EllipsisVertical as MoreOutlined,
  CirclePlus as PlusCircleOutlined,
  Copy as CopyOutlined,
  Plus as PlusOutlined,
  SquarePlus as PlusSquareOutlined,
  ChevronRight as RightOutlined,
  Search as SearchOutlined,
  ArrowLeftRight as SwapOutlined,
  List as UnorderedListOutlined,
  TriangleAlert as WarningFilled,
  TriangleAlert as WarningOutlined,
  Undo2 as UndoOutlined,
  Redo2 as RedoOutlined,
} from 'lucide-react';

export {
  CrossIcon as CloseOutlined,
  TrashSquareIcon as DeleteOutlined,
  PencilIcon as EditOutlined,
  PlayCircleIcon as PlayCircleOutlined,
  RefreshArrowClockwiseIcon as SyncOutlined,
  SuccessCircleIcon as SuccessOutlined,
};
