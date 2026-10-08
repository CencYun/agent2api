/**
 * Loomy 新手任务弹窗（签到后自动弹出）。
 *
 * ── 交互口径（用户定的）──────────────────────────────────────
 * 点签到 → 签到完成后若该账号还有未领取的新手任务 → 弹窗列出全部任务：
 * 已领取的标记 ✓，未领取的高亮并**自动**串行领取（第一次签到 = 签到 + 领取，
 * 一次点击完成）。全部领完后下次签到查询到 unclaimed=0，本弹窗不再出现 ——
 * 之后签到就只是签到。
 *
 * ── 数据从哪来 ───────────────────────────────────────────────
 * 弹窗只读 store 的 `onboarding` 段（查询 / 领取 / 合并结果都在
 * accounts-onboarding.ts），这里纯展示 + 两个动作出口（重试 / 关闭）。
 * 关闭不等同于取消：已经发出的领取请求照常完成（服务端幂等记账），
 * 只是界面不再展示。
 */

import * as React from 'react'
import {
  Badge, BadgeDot, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader,
  DialogSection, DialogTitle, Spinner,
} from '@ui'
import type { OnboardingGroup, OnboardingTask } from './accounts-shared'
import { closeOnboarding, retryOnboardingFailed } from './accounts-onboarding'
import { getStore, subscribe } from './accounts-store'

/** 该组任务的累计积分（以服务端回传的 done 为准） */
function earnedOf(tasks: OnboardingTask[]): number {
  return tasks.reduce((sum, task) => (task.done ? sum + task.points : sum), 0)
}

/** 该组任务的分值总分（「已获得 x / 共 y」的 y） */
function totalOf(tasks: OnboardingTask[]): number {
  return tasks.reduce((sum, task) => sum + task.points, 0)
}

/** 失败且还没领到的行数（决定要不要给「重试」按钮） */
function failedCountOf(tasks: OnboardingTask[]): number {
  return tasks.filter(task => task.error && !task.done).length
}

/** 相邻同分组的任务并成一段（后端按注册中心顺序返回，分组天然连续） */
function sectionsOf(tasks: OnboardingTask[]): Array<{ title: string; tasks: OnboardingTask[] }> {
  const out: Array<{ title: string; tasks: OnboardingTask[] }> = []
  for (const task of tasks) {
    const last = out[out.length - 1]
    if (last && last.title === task.group) last.tasks.push(task)
    else out.push({ title: task.group, tasks: [task] })
  }
  return out
}

/** 一行任务：标题 + 分值 + 状态（已领取 / 未领取 / 领取中 / 失败） */
function TaskRow({ task }: { task: OnboardingTask }) {
  const points = <span className='text-xs tabular-nums text-subtle'>+{task.points}</span>
  return (
    <div className='flex items-center gap-2 py-1.5'>
      <span className='flex-1 truncate text-sm' title={task.title}>{task.title}</span>
      {points}
      {task.done ? (
        <Badge variant='success' shape='tag'>
          <BadgeDot />已领取
        </Badge>
      ) : task.claiming ? (
        <span className='inline-flex w-[52px] items-center justify-center gap-1 text-xs text-subtle'>
          <Spinner className='size-3' />领取中
        </span>
      ) : task.error ? (
        <Badge variant='destructive' shape='tag' title={task.error}>失败</Badge>
      ) : (
        <Badge variant='secondary' shape='tag'>未领取</Badge>
      )}
    </div>
  )
}

/** 一个账号的任务集合：账号名（仅多账号时展示）+ 已获得读数 + 分组任务行 */
function GroupBlock({ group, multi }: { group: OnboardingGroup; multi: boolean }) {
  const failed = failedCountOf(group.tasks)
  return (
    <DialogSection>
      <div className='flex items-center gap-2'>
        {multi ? <h3>{group.label}</h3> : <h3>新手任务</h3>}
        {failed > 0 && <Badge variant='destructive' shape='tag'>{failed} 项失败</Badge>}
        <span className='ml-auto text-xs tabular-nums text-subtle'>
          已获得 {earnedOf(group.tasks)} / {totalOf(group.tasks)} 积分
        </span>
      </div>
      <div className='flex flex-col'>
        {sectionsOf(group.tasks).map(section => (
          <React.Fragment key={section.title}>
            {section.title ? (
              <div className='pt-1.5 text-xs font-medium text-subtle'>{section.title}</div>
            ) : null}
            {section.tasks.map(task => <TaskRow key={task.key} task={task} />)}
          </React.Fragment>
        ))}
      </div>
    </DialogSection>
  )
}

/**
 * 弹窗宿主：store.onboarding 非空即挂载（签到后的 offerOnboardingClaimFor
 * 负责往里写数据并自动开领，这里不发起任何请求）。
 */
export function OnboardingDialog() {
  const store = React.useSyncExternalStore(subscribe, getStore)
  const state = store.onboarding
  if (!state) return null
  const multi = state.groups.length > 1
  const allDone = state.groups.every(group => !group.tasks.some(task => !task.done))
  const anyFailed = state.groups.some(group => failedCountOf(group.tasks) > 0)
  const hint = allDone
    ? '全部领取完成，之后签到将不再弹出本弹窗'
    : state.claiming ? '正在逐项领取（服务端幂等，重复领取不会重复加分）…' : ''
  return (
    <Dialog open onOpenChange={next => { if (!next) closeOnboarding() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新手任务福利</DialogTitle>
          <span className='text-xs text-subtle'>
            {multi ? '以下账号还有未领取的新手任务' : '该账号还有未领取的新手任务'}
          </span>
        </DialogHeader>
        <DialogBody>
          {state.groups.map(group => <GroupBlock key={group.id} group={group} multi={multi} />)}
        </DialogBody>
        <DialogFooter>
          <div className='mr-auto text-xs text-subtle'>{hint}</div>
          {anyFailed && !state.claiming ? (
            <Button variant='outline' onClick={retryOnboardingFailed}>重试失败项</Button>
          ) : null}
          <Button variant='outline' onClick={closeOnboarding}>
            {state.claiming ? '后台领取中，关闭' : allDone ? '完成' : '关闭'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
