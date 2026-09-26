import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './lib/cn'

/**
 * 徽章 / 状态标签。
 *
 * 形态与 shadcn/ui 的 Badge 对齐：variant 取 default / secondary / destructive /
 * outline / ghost / link，命名与标准一致；后面六个是本项目的扩展档
 * （success / warning / info / brand / cn / intl）—— 项目的账号状态、版本标签
 * 需要这组语义色，但它们仍然是 variant 的取值，不再另起一套 prop。
 *
 * 与既有界面的对应：ui/css 的 `.badge`（控件底 + 控件描边）＝ `outline`，
 * `.badge.ok` ＝ `success`，`.badge.warn` ＝ `warning`，`.badge.bad` ＝ `destructive`，
 * `.badge.brand` ＝ `brand`，`.badge.tag` ＝ `shape="tag"`。
 *
 * shape 是第二个维度（与 Button 的 size 同理）：pill 是默认的胶囊徽章，
 * tag 是行内状态标签（更小更方，取 --r-xs）。
 */

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-[5px] overflow-hidden whitespace-nowrap border font-semibold',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-destructive-bd bg-destructive-soft text-destructive',
        outline: 'border-control-border bg-control text-subtle',
        ghost: 'border-transparent bg-transparent text-muted-foreground',
        link: 'border-transparent bg-transparent text-primary underline-offset-4 hover:underline',
        /* 以下为项目扩展档：状态与版本语义色 */
        success: 'border-success-bd bg-success-soft text-success',
        warning: 'border-warning-bd bg-warning-soft text-warning',
        info: 'border-info-bd bg-info-soft text-info',
        brand: 'border-primary-bd bg-primary-soft text-primary-fg',
        cn: 'border-cn-bd bg-cn-soft text-cn',
        intl: 'border-intl-bd bg-intl-soft text-intl',
      },
      shape: {
        pill: 'min-h-[21px] rounded-pill px-[9px] py-px text-[11.5px]',
        tag: 'min-h-[19px] rounded-xs px-2 py-0 text-[11px]',
      },
    },
    defaultVariants: { variant: 'default', shape: 'pill' },
  }
)

type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>

function Badge({ className, variant, shape, ...props }: BadgeProps) {
  return (
    <span
      data-slot='badge'
      className={cn(badgeVariants({ variant, shape }), className)}
      {...props}
    />
  )
}

/** 徽章里的状态圆点：颜色继承徽章文字色 */
function BadgeDot({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('size-1.5 flex-none rounded-full bg-current', className)} {...props} />
}

export { Badge, BadgeDot, badgeVariants, type BadgeProps }
