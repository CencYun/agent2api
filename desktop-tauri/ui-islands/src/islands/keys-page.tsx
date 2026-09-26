import * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogSection,
  DialogTitle,
  Input,
  Label,
  Switch,
} from '@ui'

/**
 * Agent2API · 网关 Key 页（列表 / 新建 / 启停 / 删除 / 可用范围）—— React 岛。
 *
 * 替换 ui/keys-panel.js（那份用 innerHTML 拼 .models-table 的行、事件走容器委托）。
 * 对外接口与原实现**完全一致**：`window.wbKeysPanel = { load, render, visibleColumns }`
 * —— app.js:151 切到本页时调 load()，table-columns.js 的列宽层按 visibleColumns()
 * 算「当前可见列」（覆盖值落到哪个 <col>、末列不给把手），调用点一行都不用改。
 *
 * ── 数据口径（照旧，别改）──────────────────────────────────
 * 数据来自 `GET /api/keys`（`{keys, authRequired, providers, modelsByProvider}`，
 * keys 带明文 key 与掩码）。写接口都返回最新列表，就地替换后重绘；列表默认显示掩码，
 * 每行可单独「显示」明文并复制（复制走 clipboard.js 的 data-copy 委托）。
 * 「可用提供商 / 可用模型」两个白名单**空数组 = 不限制**（见后端 core::api_keys）。
 *
 * ── 两个多选为什么保留 select.js ─────────────────────────────
 * 这两个控件是**多选**，而组件库的 Select 是单选（Base UI 的 Select 不支持 multiple），
 * ui-kit 里也没有多选下拉。所以这一版按约定保留旧实现：React 里渲染原生
 * `<select multiple>`，在 layout effect 里灌选项并显式调 `wbSelect.sync(el)`
 * —— select.js 的 observer 回调跑在微任务里，重建选项后紧接着同步读界面还是旧的。
 * 等 ui-kit 补上多选下拉再换（见交付说明里的缺口清单）。
 *
 * ── 弹窗走组件库的 Dialog（与 request-clear-modal / conc-dialog 同一手法）──
 * 旧的 `#key-modal`（.modal-mask 一族）不再使用：Esc / 点遮罩关闭、焦点陷阱、滚动
 * 锁定都由 Dialog 内建。两个多选留在弹窗里与 Base UI 的模态并不冲突 —— select.js
 * 的浮层是「打开时才挂到 body」的第三方节点，Base UI 的 outside-press 判定对
 * 「浮层渲染之后注入的节点」明确放行（见其 useDismiss 的 markers 分支）。
 *
 * ── 列设置：为什么在 layout effect 里注册，而不是模块顶层 ──────
 * ① 本岛的模块体比 table-col-settings.tsx 先执行（import.meta.glob 按文件名字典序），
 *    模块顶层那一刻 `window.wbColSettings` 还不存在；
 * ② 「列设置」按钮要插进**本岛渲染出来的** .panel-head .head-actions，而 React 的首次
 *    渲染排在后面的任务里 —— 顶层 querySelector 拿到的是 index.html 的静态骨架
 *    （马上会被 replaceChildren 清掉），按钮会插进一个即将消失的节点。
 * 表头同步跟着注册一起做，并靠 syncStaticHead 内部的 `wbTableColumns.repaint('keys')`
 * 补上把手与列宽：table-columns.js 在本脚本之后加载，谁先跑都有可能 —— 它先跑时找
 * 不到表（当时 React 还没渲染），这次 repaint 补上；这次是空转时，它加载期自己会找。
 * <colgroup> / <thead> 由本文件渲染但 `data-col` 一个不少，React 从不动这几棵静态
 * 子树（虚拟 DOM 不变），所以命令式的重排 / 摘除是安全的。
 */

/* ─── 类型 ─────────────────────────────────── */

/** 一把 Key（`GET /api/keys` 的 keys[]，对应后端 `api_keys::ApiKeyEntry::public_json`） */
type KeyEntry = {
  id: string
  name?: string
  /** 明文：本机管理界面要能随时复制给客户端（掩码只用于列表折叠展示） */
  key?: string
  masked?: string
  enabled?: boolean
  createdAt?: number
  /** 白名单，**空数组 = 不限制** */
  allowedProviders?: string[]
  allowedModels?: string[]
}

/** 「可用提供商」的候选项：后端注册表摘要（项目禁止维护第二份 provider 清单） */
type ProviderOption = { id: string; label?: string }

/** 四个接口的响应；`created` 只在 POST 的响应里（新建后要立刻展开它） */
type KeysPayload = {
  keys?: KeyEntry[]
  authRequired?: boolean
  providers?: ProviderOption[]
  /** 每家 → 对外名清单，模型候选的**唯一**数据源（按当前勾选的提供商取并集） */
  modelsByProvider?: Record<string, string[]>
  created?: KeyEntry
}

/** 本岛用到的后端桥（见 bridge.rs 的「网关 Key」那一段） */
type KeysBridge = {
  getKeys(): Promise<KeysPayload | null | undefined>
  createKey(payload: {
    name: string
    /** 留空 = 后端自动生成 */
    key?: string
    allowedProviders: string[]
    allowedModels: string[]
  }): Promise<KeysPayload | null | undefined>
  updateKey(
    id: string,
    patch: { enabled?: boolean; allowedProviders?: string[]; allowedModels?: string[] },
  ): Promise<KeysPayload | null | undefined>
  deleteKey(id: string): Promise<KeysPayload | null | undefined>
}

/**
 * window 上由其它脚本 / 其它岛挂载的共享桥。
 *
 * 刻意用「局部窄类型 + 转型」而不是 declare global 往 Window 上加属性：
 * workbuddyDesktop / wbApp / wbColSettings / wbSelect 是多个岛共用的桥，若每个岛
 * 各 declare 一份，接口合并会因同名属性类型不一致直接报 TS2717。本文件只 declare
 * 自己独占的 wbKeysPanel（见文件末尾）。
 */
type SharedWindow = {
  workbuddyDesktop?: KeysBridge
  wbApp?: {
    toast?: (message: string, kind?: 'err' | 'ok') => void
    /** 时间戳 → 本地时间串（app.js 的 formatTime；createdAt 列用它） */
    formatTime?: (value: unknown) => string
    /** 顶栏状态区重画：本页徽标是顶栏那枚的镜像（按 id 读文案与 data-tone） */
    renderTopbarStatus?: () => void
    /** 当前页标识：首屏自持加载只在用户正看着本页时打后端 */
    readonly currentPage?: string
  }
  wbConfirm?: {
    ask?: (options: {
      title?: string
      /** 正文，允许 <strong> 等少量标记；内容由调用方负责转义 */
      html?: string
      okText?: string
      /** danger = 不可恢复的危险操作（确认键走红） */
      okClass?: string
    }) => Promise<boolean>
  }
  wbColSettings?: {
    register(spec: {
      id: string
      label?: string
      columns: readonly ColumnDecl[]
      mount?: () => Element | null
      onChange?: () => void
    }): ColSettingsHandle
    syncStaticHead(id: string, table: Element | null | undefined): void
  }
  wbSelect?: {
    /** 立即把外壳同步到 select 的当前状态（见文件头：重建选项后必须显式调） */
    sync?: (select: HTMLSelectElement) => boolean
  }
  /** 提供商显示名（注册表 + 自定义家的查找链，注册表里没有的 id 回落原样） */
  wbProviders?: { labelOf?: (id: string) => string | undefined }
}

function shared(): SharedWindow {
  return window as unknown as SharedWindow
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** toast 的统一出口（运行期读 wbApp，不在模块顶层解构） */
function toast(message: string, kind?: 'err' | 'ok'): void {
  shared().wbApp?.toast?.(message, kind)
}

/** 确认框正文是 HTML 串，插值一律先转义（不借 wbApp.esc：那是 app.js 的私有函数） */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] ?? ch))
}

/* ─── 常量与列声明 ───────────────────────────── */

type Align = 'left' | 'center' | 'right'

/** 列声明：key 与 index.html 里既有的 `data-col`、<col> 的 data-col 三处同名 */
type ColumnDecl = { key: string; label: string; align?: Align }

const COLUMNS: readonly ColumnDecl[] = [
  { key: 'name', label: '名称' },
  { key: 'key', label: 'Key' },
  { key: 'time', label: '创建时间' },
  { key: 'state', label: '启用' },
  { key: 'act', label: '操作', align: 'right' },
]

/** 每个单元格自己的类名（`state` / `r` 是既有 CSS 的钩子，见 page-gateway.css） */
const CELL_CLASS: Record<string, string> = {
  name: 'cell-name',
  key: 'cell-key',
  time: 'cell-time',
  state: 'cell-state state',
  act: 'cell-act r',
}

/** 页面区块（React root 直接建在它上面，见文件头） */
const SECTION = '.page[data-page="keys"]'

/* ─── 列设置：能力层（register / apply / syncStaticHead）─── */

type ColSettingsHandle = {
  apply<C extends { key: string }>(columns: C[]): (C & { align: Align })[]
  config(): unknown
}

let colSettings: ColSettingsHandle | null = null

/** 列设置改动后的重画入口：组件挂载后登记（onChange 从 React 之外回调进来） */
let onColumnsChanged: (() => void) | null = null

/**
 * 该表当前可见的列（顺序即配置顺序；列设置未就绪时退回全部列）。
 * 导出给 table-columns.js：列宽那一层要按当前可见列算（覆盖值落到哪个 <col>、
 * 末列不给把手），两边读同一份配置才不会各算一个样。
 */
function visibleColumns(): (ColumnDecl & { align: Align })[] {
  if (colSettings) return colSettings.apply([...COLUMNS])
  // 列设置没就绪（脚本加载失败等）：退回声明顺序，对齐取列上声明的默认值
  return COLUMNS.map(column => ({ ...column, align: column.align ?? 'left' }))
}

/** 静态表头就地重排：顺序 / 显隐 / 对齐（末尾顺带让列宽层重对一遍把手） */
function syncHead(): void {
  shared().wbColSettings?.syncStaticHead?.('keys', document.querySelector('table.keys-table'))
}

/** 登记列设置（只做一次）并同步表头；必须在 React 提交之后调用（见文件头） */
function setupColumns(): void {
  if (colSettings) return
  const handle = shared().wbColSettings?.register({
    id: 'keys',
    label: '网关 Key 表',
    columns: COLUMNS,
    mount: () => document.querySelector('.page[data-page="keys"] .panel-head .head-actions'),
    onChange: () => {
      syncHead()
      onColumnsChanged?.()
    },
  })
  if (!handle) return
  colSettings = handle
  syncHead()
}

/* ─── 纯函数：文案与候选项 ───────────────────── */

function keysOf(payload: KeysPayload | null): KeyEntry[] {
  return Array.isArray(payload?.keys) ? payload.keys : []
}

/** 后端下发的提供商摘要（注册表顺序：workbuddy → raccoon → …） */
function providersOf(payload: KeysPayload | null): ProviderOption[] {
  return Array.isArray(payload?.providers) ? payload.providers : []
}

function modelsByProviderOf(payload: KeysPayload | null): Record<string, string[]> {
  const map = payload?.modelsByProvider
  return map && typeof map === 'object' ? map : {}
}

/** 提供商显示名：注册表里没有的 id 回落原样（旧数据里可能有已下线的家） */
function providerLabel(id: string): string {
  return shared().wbProviders?.labelOf?.(id) || id
}

/**
 * 按**当前勾选的提供商**取对外名并集，铺成多选选项。
 * `selected` 里的名字即使不在并集里也照样保留（铺成已勾选状态）—— 用户取消勾选某家
 * 之后，那家独有的模型仍要看得见、能自己取消，否则「保存范围」会变成一次静默的
 * 数据修改。一家都没勾时返回**空数组**（没有约束范围就没有候选）。
 */
function modelOptions(
  table: Record<string, string[]>,
  selectedProviders: string[],
  selected: string[],
): { id: string; label: string }[] {
  const names = new Map<string, string>() // 小写 → 原始名（先到先得，保住后端给的大小写）
  const put = (value: unknown) => {
    const text = String(value ?? '').trim()
    if (!text) return
    const key = text.toLowerCase()
    if (!names.has(key)) names.set(key, text)
  }
  selectedProviders.forEach(id => {
    const list = table[id] ?? table[String(id).toLowerCase()]
    if (Array.isArray(list)) list.forEach(put)
  })
  // 已勾选的模型无论是否还在并集里都要铺出来（见函数说明）
  selected.forEach(put)
  const out = [...names.values()].map(id => ({ id, label: id }))
  out.sort((a, b) => (a.id.toLowerCase() < b.id.toLowerCase() ? -1 : 1))
  return out
}

/**
 * 一行 Key 名下的**限制摘要**。为什么要显示而不是留空：限制是**看不见的** —— 列表上
 * 不写，用户就只记得「我配过点什么」，客户端 404 时会去查模型、查账号，最后才想到是
 * Key 的限制。无限制时显示「不限制」而不是省略：省略与「没读到」长得一样。
 */
function restrictionText(k: KeyEntry): string {
  const providers = Array.isArray(k.allowedProviders) ? k.allowedProviders : []
  const models = Array.isArray(k.allowedModels) ? k.allowedModels : []
  if (!providers.length && !models.length) return '不限制'
  const parts: string[] = []
  if (providers.length) parts.push(providers.map(providerLabel).join('、'))
  // 模型那半边只报个数：一屏 Row 里塞不下十几个模型名，悬停由 title 给全量
  if (models.length) parts.push(`${models.length} 个模型`)
  return `限制：${parts.join(' / ')}`
}

/** 限制摘要的完整说明（悬停 title 用；列不宽，详情只能挂这里） */
function restrictionTitle(k: KeyEntry): string {
  const providers = Array.isArray(k.allowedProviders) ? k.allowedProviders : []
  const models = Array.isArray(k.allowedModels) ? k.allowedModels : []
  if (!providers.length && !models.length) {
    return '这把 Key 不限制提供商与模型（可用全部上游与全部对外模型）'
  }
  const lines: string[] = []
  if (providers.length) lines.push(`可用提供商：${providers.map(providerLabel).join('、')}`)
  if (models.length) lines.push(`可用模型：${models.join('、')}`)
  return lines.join('\n')
}

/* ─── 多选的读写（select.js 的原生 select 形态）──── */

type MultiOption = { id: string; label: string }

/**
 * 把选项灌进多选（每次打开 / 提供商勾选变化时整体重建）。
 * 重建而不是增量补：数据源可能整体换过，增量比对要写一整套 diff，收益只有「保留
 * 勾选」—— 而勾选由调用方在重建后用 `selected` 参数按 id 还回去。重建后必须显式
 * `wbSelect.sync()`：select.js 的 observer 回调跑在微任务里，紧接着同步读界面还是旧的。
 */
function fillMultiSelect(
  select: HTMLSelectElement | null,
  options: MultiOption[],
  selected: string[],
): void {
  if (!select) return
  const chosen = new Set((selected || []).map(item => String(item).toLowerCase()))
  select.innerHTML = options.map(item =>
    `<option value="${escapeHtml(item.id)}"${chosen.has(item.id.toLowerCase()) ? ' selected' : ''}>`
    + `${escapeHtml(item.label)}</option>`,
  ).join('')
  // 空选项时 select.js 的浮层打不开（它不会为一个空浮层开口子），这里补一条禁用的
  // 说明项，让用户至少看到「为什么没有东西可选」
  if (!options.length) {
    select.innerHTML = `<option value="" disabled>${escapeHtml(select.dataset.emptyHint || '暂无可选项')}</option>`
  }
  shared().wbSelect?.sync?.(select)
}

/** 读一个多选里当前勾选的 value（保持选项顺序） */
function selectedValues(select: HTMLSelectElement | null): string[] {
  return select ? [...select.selectedOptions].map(option => option.value).filter(Boolean) : []
}

/* ─── 弹窗（新建 / 改可用范围共用）──────────────── */

type KeyModalProps = {
  /** 编辑形态的 Key；null = 新建 */
  target: KeyEntry | null
  providers: ProviderOption[]
  modelsByProvider: Record<string, string[]>
  onClose: () => void
  /** 写接口返回的最新列表（与旧实现的 accept 同义）；revealId = 新建后要展开明文的那把 */
  onSaved: (next: KeysPayload | null | undefined, revealId?: string) => void
}

function KeyModal({ target, providers, modelsByProvider, onClose, onSaved }: KeyModalProps) {
  const editingId = target?.id ?? null
  const editing = Boolean(editingId)

  const [name, setName] = React.useState(target?.name ?? '')
  const [keyValue, setKeyValue] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [summary, setSummary] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  /** 在途守卫：命令式的关闭判定（Esc / 点遮罩）必须能**同步**读到它 */
  const savingRef = React.useRef(false)

  const providersRef = React.useRef<HTMLSelectElement | null>(null)
  const modelsRef = React.useRef<HTMLSelectElement | null>(null)

  /** 当前选的摘要（旧实现直接写 DOM 的 textContent，这里落进 state） */
  function paintRestrictionState(): void {
    const pickedProviders = selectedValues(providersRef.current)
    const pickedModels = selectedValues(modelsRef.current)
    if (!pickedProviders.length && !pickedModels.length) {
      setSummary('当前不限制：这把 Key 可以用全部提供商与全部对外模型')
      return
    }
    const parts: string[] = []
    if (pickedProviders.length) {
      parts.push(`提供商：${pickedProviders.map(providerLabel).join('、')}`)
    }
    if (pickedModels.length) parts.push(`模型：${pickedModels.join('、')}`)
    // 只限制了模型、没限制提供商（旧数据里可能存在这种组合）：模型候选此刻只剩已勾的
    // 那几个（没有提供商就没有并集可铺），要说清怎么把候选拿回来 —— 否则用户会以为
    // 「模型清单坏了，加不了新的」
    if (!pickedProviders.length) {
      parts.push('（模型候选需先选提供商；不选则沿用当前这几项，保存后仍按模型白名单生效）')
    }
    setSummary(parts.join('　'))
  }

  /**
   * 重建「可用模型」的候选（提供商勾选变化时调）。勾选前先把**当前已勾的模型**读出来
   * 当保留项传进去 —— 否则取消勾选一家会让那家独有的、已被勾上的模型从选项里消失，
   * 用户再想取消它都点不到。
   */
  function rebuildModelOptions(): void {
    const select = modelsRef.current
    if (!select) return
    const pickedProviders = selectedValues(providersRef.current)
    const pickedModels = selectedValues(select)
    // 空候选的说明文案分两种：没勾提供商时是「先选提供商」，勾了却是空才是「这几家
    // 现在没有可用模型」（后端没给该家的清单 = 没登录态）
    select.dataset.emptyHint = pickedProviders.length
      ? '这几家当前没有可用模型（账号未登录或清单为空）'
      : '请先在上面选择可用提供商'
    fillMultiSelect(select, modelOptions(modelsByProvider, pickedProviders, pickedModels), pickedModels)
    paintRestrictionState()
  }

  /**
   * 打开即灌两个多选。只在挂载时做一次：选项源（注册表摘要 / 模型清单）在弹窗存活
   * 期间不会变 —— 列表数据变了弹窗也会跟着关掉重开。
   */
  React.useLayoutEffect(() => {
    fillMultiSelect(providersRef.current, providers.map(item => ({
      id: String(item.id),
      label: String(item.label ?? item.id),
    })), target?.allowedProviders || [])
    rebuildModelOptions()
  }, [])

  /**
   * 两个多选的变化：提供商变 → 重建模型候选（联动）；模型自己变 → 只刷摘要。
   * 用原生 addEventListener 而不是 React 的 onChange：事件是 select.js 在 toggle 里
   * 手工 dispatch 的（写完 option.selected 立刻同步派发），走原生监听与旧实现同一条路。
   */
  React.useEffect(() => {
    const providerSelect = providersRef.current
    const modelSelect = modelsRef.current
    if (!providerSelect || !modelSelect) return
    const onProviders = () => rebuildModelOptions()
    const onModels = () => paintRestrictionState()
    providerSelect.addEventListener('change', onProviders)
    modelSelect.addEventListener('change', onModels)
    return () => {
      providerSelect.removeEventListener('change', onProviders)
      modelSelect.removeEventListener('change', onModels)
    }
  }, [])

  /** 收尾：解除在途守卫（写两处，避免两边漂移） */
  function stopSaving(): void {
    savingRef.current = false
    setSaving(false)
  }

  async function save(): Promise<void> {
    if (savingRef.current) return
    const allowedProviders = selectedValues(providersRef.current)
    const allowedModels = selectedValues(modelsRef.current)
    savingRef.current = true
    setSaving(true)
    setStatus('保存中…')
    try {
      const api = shared().workbuddyDesktop
      if (!api) throw new Error('后端桥不可用')
      if (editingId) {
        // 只提交两个白名单：别名与启停都不动（部分更新语义，见后端 api_keys::update）
        const next = await api.updateKey(editingId, { allowedProviders, allowedModels })
        // 先解除守卫再关窗（旧实现同序：saving = false 在 closeModal 之前）
        stopSaving()
        onSaved(next)
        onClose()
        toast('✅ 可用范围已保存')
        return
      }
      const trimmedKey = keyValue.trim()
      if (trimmedKey && trimmedKey.length < 8) {
        setStatus('Key 至少需要 8 个字符')
        return
      }
      const next = await api.createKey({
        name: name.trim(), key: trimmedKey || undefined, allowedProviders, allowedModels,
      })
      stopSaving()
      onSaved(next, next?.created?.id)
      onClose()
      toast('✅ Key 已创建，记得复制给客户端')
    } catch (error) {
      setStatus(`保存失败：${errorMessage(error)}`)
    } finally {
      stopSaving()
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next, eventDetails) => {
        // 关闭请求（Esc / 点遮罩 / 右上角 ✕）全部汇到这里。保存中拒绝关闭必须走
        // eventDetails.cancel()：光「不更新 open prop」拦不住 Base UI 的 store。
        if (next) return
        if (savingRef.current) {
          eventDetails.cancel()
          return
        }
        onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? `可用范围 · ${target?.name || '未命名'}` : '新建 API Key'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogSection>
            <div className='flex flex-wrap items-center gap-2.5'>
              <Label htmlFor='key-name' className='text-[12.5px] whitespace-nowrap text-subtle'>名称</Label>
              <Input id='key-name' type='text' maxLength={60} placeholder='例如 Cursor / 公司电脑'
                autoComplete='off' value={name} disabled={editing}
                onChange={event => setName(event.currentTarget.value)} />
            </div>
            {/* 编辑形态**不渲染** Key 输入行：那一行在改范围时没有意义（Key 值不可改）。
                条件渲染而不是 hidden 属性 —— 组件库的工具类带 !important 且在 @layer
                utilities，会压过未分层的 [hidden]{display:none}。 */}
            {!editing && (
              <div className='flex flex-wrap items-center gap-2.5'>
                <Label htmlFor='key-value' className='text-[12.5px] whitespace-nowrap text-subtle'>Key</Label>
                <Input id='key-value' type='text' placeholder='留空自动生成；手填至少 8 个字符'
                  autoComplete='off' spellCheck={false} value={keyValue}
                  onChange={event => setKeyValue(event.currentTarget.value)}
                  // 回车 = 提交（旧实现只绑在这一个输入框上）
                  onKeyDown={event => { if (event.key === 'Enter') void save() }} />
              </div>
            )}
            {/* 两个多选：**不给 className / 不写 size** —— 宽度规则（min 180 / max 260）
                与「原生 select 当宽高锚」都在 page-gateway.css 里按 id 写，触发器外壳
                跟着它一起被撑到同样尺寸。id 保留是刻意的（见交付说明）。 */}
            <div className='flex flex-wrap items-center gap-2.5'>
              <Label htmlFor='key-allowed-providers' className='text-[12.5px] whitespace-nowrap text-subtle'>
                可用提供商
              </Label>
              <select id='key-allowed-providers' multiple data-placeholder='留空 = 不限制'
                ref={providersRef} />
            </div>
            <div className='flex flex-wrap items-center gap-2.5'>
              <Label htmlFor='key-allowed-models' className='text-[12.5px] whitespace-nowrap text-subtle'>
                可用模型
              </Label>
              <select id='key-allowed-models' multiple data-placeholder='留空 = 不限制'
                ref={modelsRef} />
            </div>
            <p>
              留空表示不限制；同时设置时请求需同时满足两个条件（模型在白名单内且路由到允许的提供商）。
              「可用模型」的候选跟着上面勾选的提供商走：没勾提供商时它是空的（还没有约束范围），
              勾了几家就列出这几家能收的全部对外名。
            </p>
            {/* 当前选的摘要：多选的触发器上只显示「勾了几项的文案」，勾了哪几家要在这儿
                摊开 —— 用户点完「保存范围」就看不到弹窗了，摘要要在关窗前给他核对一遍。 */}
            <p>{summary}</p>
          </DialogSection>
          <div className='min-h-[18px] text-[11.5px] text-muted-foreground'>{status}</div>
        </DialogBody>
        <DialogFooter>
          <div className='mr-auto' />
          <Button variant='outline' onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant='default' disabled={saving} onClick={() => void save()}>
            {editing ? '保存范围' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── 页面本体 ───────────────────────────────── */

/** 组件挂载后登记的入口：对外契约的 load / render 都经它转发 */
type PageHandle = {
  load(): Promise<void>
  /** 旧实现的重绘入口（当前无外部调用点，保留契约） */
  render(): void
}

let handle: PageHandle | null = null

/** app.js 切到本页时调它拉一次（挂载前的调用见文件末尾的说明） */
async function load(): Promise<void> {
  await handle?.load()
}

/** 保留旧实现的能力：按当前数据重绘一次 */
function render(): void {
  handle?.render()
}

function KeysPage() {
  const [data, setData] = React.useState<KeysPayload | null>(null)
  /** 已切到明文显示的 key id */
  const [revealed, setRevealed] = React.useState<ReadonlySet<string>>(() => new Set())
  /** 在途操作的行（按钮与开关禁用）；同步守卫读下面的 ref */
  const [pending, setPending] = React.useState<ReadonlySet<string>>(() => new Set())
  /** 弹窗：null = 关着；{ key: null } = 新建 */
  const [modal, setModal] = React.useState<{ key: KeyEntry | null } | null>(null)
  /** 列设置改了 / 契约 render() 被调 → 强制重画（数据没变但可见列变了） */
  const [, setVersion] = React.useState(0)

  const pendingRef = React.useRef<Set<string>>(new Set())
  const loadingRef = React.useRef(false)

  const applyData = React.useCallback((next: KeysPayload | null) => {
    setData(next)
  }, [])

  /** 写接口返回的最新列表：形状不对（读失败）时保持原样，与旧实现的 accept 同口径 */
  const accept = React.useCallback((next: KeysPayload | null | undefined) => {
    if (next && Array.isArray(next.keys)) applyData(next)
  }, [applyData])

  const loadPanel = React.useCallback(async (): Promise<void> => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const api = shared().workbuddyDesktop
      if (!api) throw new Error('后端桥不可用')
      applyData((await api.getKeys()) ?? null)
    } catch (error) {
      toast(`读取 Key 列表失败：${errorMessage(error)}`, 'err')
    } finally {
      loadingRef.current = false
    }
  }, [applyData])

  /** 行内异步操作的统一外壳：置忙 → 跑 → 用返回值刷新 → 收忙（失败只 toast） */
  async function runRowAction(
    id: string,
    run: () => Promise<KeysPayload | null | undefined>,
    doneText?: string,
  ): Promise<void> {
    if (pendingRef.current.has(id)) return
    pendingRef.current.add(id)
    setPending(new Set(pendingRef.current))
    try {
      accept(await run())
      if (doneText) toast(doneText)
    } catch (error) {
      toast(`操作失败：${errorMessage(error)}`, 'err')
    } finally {
      pendingRef.current.delete(id)
      setPending(new Set(pendingRef.current))
    }
  }

  function toggleReveal(id: string): void {
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 删除：原生 confirm 在 Tauri 的 WebView 里不弹窗、直接放行（等于没有确认） */
  async function removeKey(k: KeyEntry): Promise<void> {
    const api = shared().workbuddyDesktop
    const ask = shared().wbConfirm?.ask
    if (!api || !ask) return
    const label = escapeHtml(k.name || k.masked || k.id)
    const confirmed = await ask({
      title: '删除网关 Key',
      html: `确定删除 Key「<strong>${label}</strong>」？使用它的客户端会立刻无法访问。`,
      okText: '删除',
      okClass: 'danger',
    })
    if (!confirmed) return
    void runRowAction(k.id, () => api.deleteKey(k.id), 'Key 已删除')
  }

  /** 开关：写接口回的是最新列表，就地替换（与旧实现的 runRowAction 同路） */
  function toggleEnabled(k: KeyEntry, next: boolean): void {
    const api = shared().workbuddyDesktop
    if (!api) return
    void runRowAction(
      k.id,
      () => api.updateKey(k.id, { enabled: next }),
      next ? 'Key 已启用' : 'Key 已停用',
    )
  }

  /* ─── 挂载期的两件事：契约登记 + 列设置（见文件头）────── */

  React.useLayoutEffect(() => {
    handle = {
      load: loadPanel,
      render: () => setVersion(version => version + 1),
    }
    onColumnsChanged = () => setVersion(version => version + 1)
    setupColumns()
    // 注册完必须再画一次：首帧的 visibleColumns() 还是「列设置未就绪」的回退值
    // （全部列、声明顺序），用户藏过列的话表头与表体会对不上。layout effect 里的
    // setState 是同步重画，发生在浏览器绘制之前，看不到这一帧。
    setVersion(version => version + 1)
    return () => {
      handle = null
      onColumnsChanged = null
    }
  }, [loadPanel])

  /**
   * 首屏自持加载：app.js 的 showPage 在本脚本加载前就执行过（那时 window.wbKeysPanel
   * 还不存在，切页那次调用落空），用户上次若停在本页，这里补一次 —— 与旧实现文件
   * 末尾的 `if (wbApp.currentPage === 'keys') load()` 等价。
   */
  React.useEffect(() => {
    if (shared().wbApp?.currentPage === 'keys') void loadPanel()
  }, [loadPanel])

  /** 顶栏那枚是本页徽标的镜像（app.js 的 renderTopbarStatus 按 id 读文案与 data-tone）：
   *  数据一变就让它跟上，否则要等下一次主状态轮询（20 秒）才同步 */
  React.useEffect(() => {
    shared().wbApp?.renderTopbarStatus?.()
  }, [data])

  /* ─── 渲染 ─────────────────────────────── */

  const list = keysOf(data)
  const columns = visibleColumns()
  const authRequired = data?.authRequired === true
  const enabledCount = list.filter(item => item.enabled).length
  const badgeText = authRequired ? `已启用鉴权 · ${enabledCount} 把 Key 生效` : '未启用鉴权'

  /** 一个单元格的内容（不含 <td> 外壳）；「某一列长什么样」只有这一处实现 */
  function cell(columnKey: string, k: KeyEntry, busyRow: boolean): React.ReactNode {
    switch (columnKey) {
      case 'name':
        return (
          <>
            <div className='mid'><span className='t'>{k.name || '未命名'}</span></div>
            <div className='mname' title={restrictionTitle(k)}>{restrictionText(k)}</div>
          </>
        )
      case 'key': {
        const shown = revealed.has(k.id)
        return (
          <div className='keycell'>
            <code className='kv'>{shown ? k.key : k.masked}</code>
            <Button size='sm' variant='ghost' onClick={() => toggleReveal(k.id)}>
              {shown ? '隐藏' : '显示'}
            </Button>
            {/* data-copy 是 clipboard.js 的委托钩子 */}
            <Button size='sm' variant='ghost' data-copy={k.key} title='复制 Key'>复制</Button>
          </div>
        )
      }
      case 'time':
        return (
          <span className='muted'>{k.createdAt ? shared().wbApp?.formatTime?.(k.createdAt) : '—'}</span>
        )
      case 'state':
        return (
          <Switch checked={k.enabled === true} disabled={busyRow}
            aria-label={`启用「${k.name || '未命名'}」`}
            onCheckedChange={next => toggleEnabled(k, next)} />
        )
      case 'act':
        return (
          <div className='row-actions'>
            <Button size='sm' variant='ghost' disabled={busyRow} onClick={() => setModal({ key: k })}>
              可用范围
            </Button>
            <Button size='sm' variant='destructive' disabled={busyRow}
              onClick={() => void removeKey(k)}>
              删除
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <section className='panel'>
      <div className='panel-head'>
        <h2>API Key 列表</h2>
        {/* id 与 data-tone 保留：app.js 的 renderTopbarStatus 按 id 镜像这枚徽标的文案
            与配色（data-tone 有值走它，不去拆组件库 Badge 那串 Tailwind 类名） */}
        <Badge id='keys-status' variant={authRequired ? 'success' : 'warning'}
          data-tone={authRequired ? 'ok' : 'warn'}>
          {badgeText}
        </Badge>
        <div className='head-actions'>
          {/* 列设置的触发按钮由 wbColSettings.register 插进这个容器的最前面（命令式，
              与模型管理页同一手法：插入位置由那边决定，本岛只留容器） */}
          <Button variant='default' onClick={() => setModal({ key: null })}>
            ＋ 新建 Key
          </Button>
        </div>
      </div>

      <div className='models-table-wrap'>
        <table className='models-table keys-table'>
          {/* colgroup / thead 由本文件渲染，但 data-col 一个不少：列设置的就地重排
              （syncStaticHead）与列宽层（table-columns.js）都按它定位列 */}
          <colgroup>
            <col className='k-name' data-col='name' />
            <col className='k-key' data-col='key' />
            <col className='k-time' data-col='time' />
            <col className='k-state' data-col='state' />
            <col className='k-act' data-col='act' />
          </colgroup>
          <thead>
            <tr>
              <th data-col='name'>名称</th>
              <th data-col='key'>Key</th>
              <th data-col='time'>创建时间</th>
              <th data-col='state'>启用</th>
              <th className='r' data-col='act'>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.length ? list.map(k => {
              const busyRow = pending.has(k.id)
              return (
                <tr key={k.id} className={k.enabled ? '' : 'off'} data-id={k.id}>
                  {columns.map(column => (
                    <td key={column.key} className={`${CELL_CLASS[column.key] ?? ''} ta-${column.align}`}>
                      {cell(column.key, k, busyRow)}
                    </td>
                  ))}
                </tr>
              )
            }) : (
              // 空态的 colspan 跟着可见列数走：写死 5 之后藏起两列，这一格会比表体宽出
              // 两格，把整张表顶出横向滚动
              <tr>
                <td colSpan={columns.length} className='empty'>
                  {data ? '还没有 Key，当前不鉴权' : '加载中…'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className='panel-foot'>
        <span>
          客户端请求需带 <code>{'Authorization: Bearer <key>'}</code> 或 <code>{'x-api-key: <key>'}</code>；
          修改后立即生效，本程序自身会自动使用第一把启用的 Key。每把 Key 可单独限制
          <b>可用提供商</b>与<b>可用模型</b>（行内「可用范围」）：留空 = 不限制，两个都设时
          按交集生效 —— 被限制的模型对这把 Key 表现为「不存在」（拉 /v1/models 也看不到它），
          提供它的家不在可用列表里时请求同样被拒。
        </span>
      </div>

      {modal ? (
        <KeyModal
          target={modal.key}
          providers={providersOf(data)}
          modelsByProvider={modelsByProviderOf(data)}
          onClose={() => setModal(null)}
          onSaved={(next, revealId) => {
            if (revealId) setRevealed(prev => new Set(prev).add(revealId))
            accept(next)
          }}
        />
      ) : null}
    </section>
  )
}

/* ─── 挂载：接管 index.html 里既有的页面区块 ─────── */

let mounted = false

/**
 * 把 React root 直接建在页面区块上（不套宿主 div：页面 CSS 用 `.page > *` 这组直接
 * 子选择器分配高度，中间插一层会打断它）。先清掉骨架里的静态子节点 —— 下面按同样的
 * 类名重新渲染，留着会与 React 打架。
 */
function mount(): void {
  if (mounted) return
  const section = document.querySelector<HTMLElement>(SECTION)
  if (!section) return
  mounted = true
  section.replaceChildren()
  createRoot(section).render(<KeysPage />)
}

// 脚本排在页面骨架之后（index.html 里 islands/ui.js 在各 section 之后），正常直接挂；
// 万一将来被挪到前面，退化成等 DOM 解析完再挂。
if (document.querySelector(SECTION)) mount()
else document.addEventListener('DOMContentLoaded', mount, { once: true })

declare global {
  interface Window {
    /** 网关 Key 面板（替换 ui/keys-panel.js，接口与原实现一致） */
    wbKeysPanel?: {
      /** 切到本页时拉一次（app.js:151） */
      load(): Promise<void>
      /** 按当前数据重绘（旧实现的能力，保留） */
      render(): void
      /** 当前可见的列（table-columns.js 的列宽层按它算覆盖值与末列把手） */
      visibleColumns(): (ColumnDecl & { align: Align })[]
    }
  }
}

window.wbKeysPanel = { load, render, visibleColumns }
