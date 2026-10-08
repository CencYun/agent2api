/**
 * Loomy 新手任务：签到后的状态查询 + 弹窗装载 + 领取循环。
 *
 * ── 为什么独立成文件 ─────────────────────────────────────────
 * accounts-data.ts 已经超出行数约定，而这条链有自己的状态机（查询 → 过滤 →
 * 自动领取 → 行级结果合并），塞进去只会更难读。对外只暴露两个入口：
 *   · offerOnboardingClaimFor(ids) —— 签到完成后调（runCheckin / checkinAll），
 *     只对 Loomy 账号查询任务状态，有未领取才打开弹窗并自动开领；
 *   · retryOnboardingFailed() —— 弹窗里「重试」按钮的执行体。
 *
 * ── 交互口径（用户定的）──────────────────────────────────────
 * 第一次点签到 = 签到 + 新手任务领取：弹窗打开后**自动**串行领取，行级状态
 * 实时从「未领取 → 领取中 → ✓ 已领取 / 失败」推进；全部领完后下次签到查询到
 * unclaimed=0，弹窗不再出现 —— 之后签到就只是签到。任务是一次性福利，所以
 * 只挂手动签到这条链，定时签到（后端调度）不受影响。
 *
 * 服务端幂等（重复上报 alreadyCompleted，不重复加分），领取循环里不做本地
 * 去重 —— 就算并发触发两次也不会多拿。
 */

import {
  errorMessage, shared, toast,
  type OnboardingDialogState, type OnboardingGroup, type OnboardingTask, type OnboardingTaskRaw,
} from './accounts-shared'
import { displayNameOf, providerOf } from './accounts-domain'
import { findAccount, getStore, patch } from './accounts-store'

/** 新手任务只有 Loomy 一家有（后端同款判定：loomy_account_record 按 provider 过滤） */
const LOOMY_PROVIDER_ID = 'loomy'

/** 后端任务行 → 归一形状（字段残缺按缺省处理，恶意/异常数据不进弹窗） */
function normalizeTask(raw: OnboardingTaskRaw): OnboardingTask | null {
  const key = typeof raw?.key === 'string' ? raw.key : ''
  if (!key) return null
  return {
    key,
    title: typeof raw.title === 'string' && raw.title ? raw.title : key,
    group: typeof raw.group === 'string' && raw.group ? raw.group : '',
    points: Number(raw.points) || 0,
    done: raw.done === true,
  }
}

function normalizeTasks(raw: unknown): OnboardingTask[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map(normalizeTask).filter((task): task is OnboardingTask => task !== null)
}

/** 弹窗当前的整体状态（持久挂在 store 上，组件只读） */
function dialogState(): OnboardingDialogState | null {
  return getStore().onboarding
}

/** 就地更新一个账号的任务集合（找不到说明弹窗已被关闭/换过，忽略即可） */
function updateGroup(groupId: string, update: (tasks: OnboardingTask[]) => OnboardingTask[]): void {
  const state = dialogState()
  if (!state) return
  const groups = state.groups.map(group =>
    group.id === groupId ? { ...group, tasks: update(group.tasks) } : group,
  )
  patch({ onboarding: { ...state, groups } })
}

/** 某账号是否还有未完成的任务 */
function hasUndone(group: OnboardingGroup): boolean {
  return group.tasks.some(task => !task.done)
}

/**
 * 签到完成后的入口：只查 Loomy 账号；全部查询完再决定要不要弹窗（哪怕只有
 * 一个账号有未领取任务，弹窗也一次性带上所有账号的快照，领取逐账号串行）。
 * 查询失败（登录失效 / 网络不通）**静默跳过**：签到本身刚结束，失败详情不该
 * 被第二层弹窗盖住，用户下次签到还会再查。
 */
export async function offerOnboardingClaimFor(ids: string[]): Promise<void> {
  try {
    const loomyIds = ids.filter(id => providerOf(findAccount(id)) === LOOMY_PROVIDER_ID)
    if (!loomyIds.length) return
    const groups: OnboardingGroup[] = []
    for (const id of loomyIds) {
      try {
        const data = await shared().workbuddyDesktop?.getOnboardingTasks?.(id)
        const tasks = normalizeTasks(data?.tasks)
        // 账号已被删除 / 上游没返回任务：都跳过
        if (!tasks.length) continue
        if (!tasks.some(task => !task.done)) continue
        groups.push({ id, label: displayNameOf(findAccount(id)) || id, tasks })
      } catch {
        /* 单账号查询失败不拖累其它账号 */
      }
    }
    if (!groups.length) return
    patch({ onboarding: { groups, claiming: false } })
    void claimOnboardingGroups()
  } catch (error) {
    console.warn('[onboarding] 新手任务查询失败，跳过弹窗:', error)
  }
}

/** 合并一次领取响应：done 以服务端为准，失败行带原因（保持可重试） */
function mergeClaimResult(
  groupId: string,
  data: { results?: Array<Record<string, unknown>>; tasks?: unknown } | null | undefined,
  failure?: string,
): void {
  const failedKeys = new Map<string, string>()
  if (failure) {
    // 整账号失败（401 / 网络断）：所有未完成行都标这个原因
    // （具体的 key 级原因无从分辨，统一文案即可，重试按钮是出路）
  }
  const rows = Array.isArray(data?.results) ? data.results : []
  for (const row of rows) {
    const key = typeof row?.key === 'string' ? row.key : ''
    if (key && row?.ok !== true) {
      failedKeys.set(key, String(row?.error || '领取失败'))
    }
  }
  updateGroup(groupId, tasks => {
    const server = normalizeTasks(data?.tasks)
    // 服务端返回的任务集合优先（含新领取的 done 标记）；空响应退回本地状态
    const merged = server.length
      ? server.map(task => ({
          ...task,
          error: failedKeys.get(task.key) ?? (failure && !task.done ? failure : undefined),
        }))
      : tasks.map(task => ({
          ...task,
          claiming: false,
          error: failedKeys.get(task.key) ?? (failure && !task.done ? failure : task.error),
        }))
    return merged.map(task => ({ ...task, claiming: false }))
  })
}

/** 汇总一条 toast（全部账号合计） */
function summarize(groups: OnboardingGroup[]): void {
  let claimed = 0
  let points = 0
  let failed = 0
  let firstError = ''
  for (const group of groups) {
    for (const task of group.tasks) {
      if (task.error && !task.done) {
        failed += 1
        if (!firstError) firstError = task.error
      } else if (task.done) {
        claimed += 1
        points += task.points
      }
    }
  }
  if (failed) {
    toast(`新手任务有 ${failed} 项领取失败${firstError ? `（${firstError}）` : ''}`, 'err')
  } else if (claimed) {
    toast(`✅ 新手任务已全部领取，共 ${points} 积分`, 'ok')
  }
}

/**
 * 领取循环：逐账号串行（与签到同一条防风控口径），行级状态实时推进。
 * 弹窗被关闭（store.onboarding 变 null）后停止剩余账号 —— 已经发出的请求
 * 让它飞，服务端幂等，多打不会多拿。
 */
export async function claimOnboardingGroups(): Promise<void> {
  const state = dialogState()
  if (!state || state.claiming) return
  patch({ onboarding: { ...state, claiming: true } })
  try {
    for (const group of state.groups) {
      if (!dialogState()) return
      if (!hasUndone(group)) continue
      // 行级「领取中」：失败过的行也重试（服务端幂等，重试是唯一出路）
      updateGroup(group.id, tasks =>
        tasks.map(task => (task.done ? task : { ...task, claiming: true, error: undefined })),
      )
      try {
        const data = await shared().workbuddyDesktop?.claimOnboardingTasks?.(group.id)
        mergeClaimResult(group.id, data)
      } catch (error) {
        mergeClaimResult(group.id, null, errorMessage(error))
      }
    }
  } finally {
    const current = dialogState()
    if (current) patch({ onboarding: { ...current, claiming: false } })
    if (current) summarize(current.groups)
  }
}

/** 弹窗「重试」按钮：把还有未完成任务的账号再走一轮（已完成的自动跳过） */
export function retryOnboardingFailed(): void {
  void claimOnboardingGroups()
}

/** 关闭弹窗（领取中的请求继续在后台飞，结果被服务端记账，只是界面不再展示） */
export function closeOnboarding(): void {
  patch({ onboarding: null })
}
