import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { cn } from './lib/cn'
import { Button } from './button'

/**
 * 弹窗（标准形态，与 shadcn/ui 的 Dialog 一致）。
 *
 * 部件划分照标准：Dialog / DialogTrigger / DialogPortal / DialogClose /
 * DialogOverlay / DialogContent / DialogHeader / DialogTitle / DialogDescription /
 * DialogFooter。DialogContent 默认自带遮罩与右上角关闭按钮（showCloseButton），
 * 不需要时传 false。
 *
 * 另外两个是本项目的扩展件，对应 ui/css/components.css 里的弹窗结构，
 * shadcn 标准里没有：
 *   · DialogBody    ← `.modal-body`（纵向排布、超高滚动的正文区）
 *   · DialogSection ← `.modal-section`（正文里的分区块，内嵌凹槽底 + 描边）
 *
 * 视觉对齐既有的 `.modal-mask` / `.modal` 一族：遮罩 46% 黑 + 3px 背景模糊，
 * 弹窗宽 min(620px, 100%)、--r-lg 圆角、--shadow-3 投影；入场是「淡入 + 上移 10px
 * 收 1.5%」，出场反向。z-index 取 30（与 .modal-mask 同档，轻提示在 40 之上）。
 *
 * 交互交给 Base UI 的 Dialog：焦点陷阱、Esc 关闭、滚动锁定、aria-modal 与
 * 关闭后焦点归位全部内建。
 */

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot='dialog' {...props} />
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot='dialog-trigger' {...props} />
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot='dialog-portal' {...props} />
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot='dialog-close' {...props} />
}

const DialogTitle = (props: DialogPrimitive.Title.Props) => (
  <DialogPrimitive.Title data-slot='dialog-title' {...props} />
)

const DialogDescription = (props: DialogPrimitive.Description.Props) => (
  <DialogPrimitive.Description data-slot='dialog-description' {...props} />
)

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot='dialog-overlay'
      className={cn(
        'fixed inset-0 isolate z-30 bg-mask backdrop-blur-[3px]',
        'transition-opacity duration-150',
        'data-open:animate-in data-open:fade-in-0',
        'data-closed:animate-out data-closed:fade-out-0',
        className
      )}
      {...props}
    />
  )
}

type DialogContentProps = DialogPrimitive.Popup.Props & {
  /** 是否自带右上角关闭按钮，默认 true */
  showCloseButton?: boolean
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot='dialog-content'
        className={cn(
          'fixed top-1/2 left-1/2 z-30 flex max-h-[calc(100vh-48px)] w-[min(620px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col',
          'overflow-hidden rounded-lg border border-border bg-surface shadow-3 outline-none',
          'transition-[opacity,transform] duration-200 [transition-timing-function:cubic-bezier(.2,.9,.3,1)]',
          'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[.985] data-open:slide-in-from-bottom-2.5',
          'data-closed:animate-out data-closed:fade-out-0',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot='dialog-close'
            render={<Button variant='ghost' size='icon-sm' className='absolute top-3 right-3' />}
          >
            <svg viewBox='0 0 12 12' className='size-3' aria-hidden='true'>
              <path
                d='M2.5 2.5l7 7M9.5 2.5l-7 7'
                stroke='currentColor'
                strokeWidth='1.5'
                strokeLinecap='round'
                fill='none'
              />
            </svg>
            <span className='sr-only'>关闭</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

/** 弹窗标题栏：标题左、操作右，底部一条 hairline。
    右侧留 40px 给 DialogContent 自带的关闭按钮（26px 按钮 + 12px 外边距 + 2px 间隙），
    标题再长也不会压到它下面。 */
function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='dialog-header'
      className={cn(
        'flex items-center gap-2.5 border-b border-hairline px-5 py-[15px] pr-10',
        '[&_h2]:flex-1 [&_h2]:text-[14.5px] [&_h2]:font-semibold',
        className
      )}
      {...props}
    />
  )
}

/** 弹窗正文（项目扩展，对应 `.modal-body`）：纵向排布、超高滚动 */
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='dialog-body'
      className={cn('flex flex-col gap-4 overflow-y-auto px-5 py-[18px]', className)}
      {...props}
    />
  )
}

/** 弹窗底栏：按钮靠右，左侧留白用 mr-auto 顶开 */
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='dialog-footer'
      className={cn(
        'flex items-center gap-2 border-t border-hairline bg-surface-2 px-5 py-[13px]',
        className
      )}
      {...props}
    />
  )
}

/** 正文里的分区块（项目扩展，对应 `.modal-section`）：内嵌凹槽底 + 描边 */
function DialogSection({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='dialog-section'
      className={cn(
        'flex flex-col gap-2.5 rounded-md border border-border bg-surface-inset p-3.5',
        '[&_h3]:text-[12.5px] [&_h3]:font-semibold',
        '[&_p]:text-xs [&_p]:leading-[1.65] [&_p]:text-subtle',
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogSection,
}
