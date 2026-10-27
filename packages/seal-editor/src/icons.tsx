/**
 * Internal icon layer.
 *
 * 全量 lucide（2026-10-27 裁定，reui icon 试点否决收尾）：所有图标自 lucide-react
 * 以编辑器面的历史名重导出——别名层隔离形状源，消费面只认名字。
 * 规则：新增图标先进 lucide 找形状；缺口形状从 Tabler（MIT 同语系）借骨架经
 * custom 组件补，禁止再 vendor 第三方图标组件（ReUI icon 试水记录见
 * 22ecdc36/4c27dd10，已否决：fill 面性 1.7× 墨量、授权触点、覆盖缺口）。
 */

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
  X as CloseOutlined,
  CloudDownload as CloudDownloadOutlined,
  CloudUpload as CloudUploadOutlined,
  Minimize2 as CompressOutlined,
  GitFork as DeploymentUnitOutlined,
  ChevronDown as DownOutlined,
  Move as DragOutlined,
  Trash2 as DeleteOutlined,
  Upload as ExportOutlined,
  Paintbrush as FormatPainterOutlined,
  GripVertical as HolderOutlined,
  Download as ImportOutlined,
  WandSparkles as WandOutlined,
  Info as InfoCircleOutlined,
  Info as InformationIcon,
  Link2 as LinkIcon,
  ChevronLeft as LeftOutlined,
  SquareMinus as MinusSquareOutlined,
  EllipsisVertical as MoreOutlined,
  CirclePlus as PlusCircleOutlined,
  Copy as CopyOutlined,
  Plus as PlusOutlined,
  SquarePlus as PlusSquareOutlined,
  ChevronRight as RightOutlined,
  Search as SearchOutlined,
  RotateCw as SyncOutlined,
  ArrowLeftRight as SwapOutlined,
  List as UnorderedListOutlined,
  TriangleAlert as WarningFilled,
  TriangleAlert as WarningOutlined,
  Undo2 as UndoOutlined,
  Redo2 as RedoOutlined,
  Pencil as EditOutlined,
  CirclePlay as PlayCircleOutlined,
  CircleCheckBig as SuccessOutlined,
} from 'lucide-react';
