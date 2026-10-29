import { Button as UiButton } from '#components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#components/ui/dialog';
import { cn } from '#lib/utils';
import * as React from 'react';

export const Modal: React.FC<{
  open?: boolean;
  title?: React.ReactNode;
  width?: number | string;
  okText?: React.ReactNode;
  cancelText?: React.ReactNode;
  onOk?: () => void;
  onCancel?: () => void;
  footer?: React.ReactNode | null;
  /** antd 语义：true/对象（含 aria-label）渲染关闭钮；undefined/false 不渲染（kernel 历史缺省无钮） */
  closable?: boolean | Record<string, unknown>;
  /** maskClosable/getContainer 两员已随 2.0 终清（Base UI 遮罩与 Esc 同通道；
   * ISLAND portal 纪律由 body.seal-root 兜底，ADR-023） */
  destroyOnClose?: boolean;
  centered?: boolean;
  okButtonProps?: { danger?: boolean; htmlType?: string; onClick?: () => void; form?: string; disabled?: boolean };
  /** antd 语义：内容区样式（如 fields-reorder-dialog 的顶部留白） */
  bodyStyle?: React.CSSProperties;
  children?: React.ReactNode;
  className?: string;
}> = ({
  open = false,
  title,
  width = 520,
  okText = 'OK',
  cancelText = 'Cancel',
  onOk,
  onCancel,
  footer,
  closable,
  destroyOnClose = false,
  centered,
  okButtonProps,
  bodyStyle,
  children,
  className,
}) => {
  const body = destroyOnClose && !open ? null : children;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel?.();
      }}
    >
      <DialogContent
        showCloseButton={closable !== undefined && closable !== false}
        className={cn(
          /*
           * Height contract: cap the dialog to the viewport and let ONLY the
           * body scroll, keeping the footer (OK/Cancel) reachable. Radix
           * DialogContent is `fixed top-1/2 -translate-y-1/2`, so without a
           * max-height tall content used to overflow both viewport edges —
           * the Map Excel Data panel was unreachable at its bottom buttons.
           */
          'grid grid-rows-[auto_minmax(0,1fr)_auto]',
          centered && 'top-[50%]',
          className,
        )}
        style={{
          maxWidth: typeof width === 'number' ? `${width}px` : width,
          maxHeight: 'calc(100dvh - 48px)',
        }}
      >
        {title ? (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        ) : null}
        {body ? (
          <div className='min-h-0 overflow-y-auto' style={bodyStyle}>
            {body}
          </div>
        ) : null}
        {footer !== null ? (
          // 分隔线：矮视口下（弹层被 100dvh-48 压缩时）footer 与滚动内容的
          // 界线必须明确，否则按钮视觉上与表格/表单内容"重合"
          <DialogFooter className='mt-2 border-t border-[var(--border)] pt-3'>
            {footer ?? (
              <>
                <UiButton variant='outline' onClick={() => onCancel?.()}>
                  {cancelText}
                </UiButton>
                <UiButton
                  variant={okButtonProps?.danger ? 'destructive' : 'default'}
                  disabled={okButtonProps?.disabled}
                  type={okButtonProps?.htmlType as 'button' | 'submit' | 'reset' | undefined}
                  form={okButtonProps?.form}
                  onClick={okButtonProps?.onClick ?? (() => onOk?.())}
                >
                  {okText}
                </UiButton>
              </>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
