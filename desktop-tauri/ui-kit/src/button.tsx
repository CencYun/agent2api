import * as React from 'react'
import { Button as BaseButton } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './lib/cn'

/**
 * 按钮。
 *
 * 形态与 shadcn/ui 的 Button 对齐：variant 取 default / outline / secondary /
 * ghost / destructive / link，size 取 default / xs / sm / lg / icon / icon-xs /
 * icon-sm / icon-lg —— 名字与档位都照标准来，按 shadcn 的习惯写就能命中。
 * 样式值取项目令牌（见 styles/theme.css），观感与既有界面一致。
 *
 * 与 ui/css/components.css 那套类名的对应：button.primary → default，
 * 基础 button → outline，button.danger → destructive，button.sm → sm，button.icon → icon。
 *
 * 交互层交给 Base UI 的 Button：原生 `<button>` 的薄封装，补了 data-pressed /
 * data-disabled 等状态属性。
 */

const buttonVariants = cva(
  [
    'group/button inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border',
    'font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out',
    'outline-none select-none active:translate-y-[0.5px]',
    'disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        /** 主按钮：平铺主色 + 近白文字 */
        default:
          'border-primary bg-primary font-semibold text-primary-on shadow-glow hover:border-primary-hover hover:bg-primary-hover',
        /** 默认按钮：控件底 + 控件描边 */
        outline:
          'border-control-border bg-control text-foreground shadow-1 hover:border-control-border-hover hover:bg-control-hover',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'border-transparent bg-transparent text-subtle shadow-none hover:bg-control-hover hover:text-foreground',
        /** 危险按钮：语义柔底 + 语义描边 */
        destructive:
          'border-destructive-bd bg-destructive-soft text-destructive hover:bg-destructive-hover',
        link: 'border-transparent bg-transparent text-primary shadow-none underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[30px] rounded-md px-3 text-[12.5px]',
        xs: 'h-6 rounded-sm px-2 text-[11.5px]',
        sm: 'h-[26px] rounded-sm px-2.5 text-[12px]',
        lg: 'h-9 rounded-md px-4 text-[13px]',
        icon: 'h-[30px] w-[30px] rounded-md p-0',
        'icon-xs': 'size-6 rounded-sm p-0',
        'icon-sm': 'h-[26px] w-[26px] rounded-sm p-0',
        'icon-lg': 'size-9 rounded-md p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

type ButtonProps = Omit<React.ComponentProps<typeof BaseButton>, 'className'> &
  VariantProps<typeof buttonVariants> & {
    className?: string
  }

function Button({ className, variant, size, ...props }: ButtonProps) {
  return <BaseButton className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button, buttonVariants, type ButtonProps }
