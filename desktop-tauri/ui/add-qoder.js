/* Qoder 添加配置；由 add-provider-forms.js 统一渲染并绑定。 */
(() => {
  window.wbQoderAddForm = {
    provider: 'qoder',
    label: 'Qoder',
    // Qoder 没有「桌面端实时登录态」可导入（凭证在它自己的客户端里，且不是
    // 本网关的转发来源），因此不生成那一段
    desktop: false,
    regionOptions: [
      { value: 'global', label: '国际版' },
      { value: 'cn', label: '中国版' },
    ],
    webLogin: {
      // 网页登录国际版 / 中国版**都有**：两站是同一套 PKCE 设备授权协议，
      // 只有站点主机不同（qoder.com + openapi.qoder.sh 对 qoder.com.cn +
      // openapi.qoder.com.cn，见 core::providers::qoder::endpoints）。
      // 因此这里不设 `region` 限制 —— 地区分段切到哪一站，这段就登录哪一站。
      noteHtml: '打开官方授权页完成设备码授权，登录的是「地区」所选那一站的账号。',
      button: '打开 Qoder 网页登录',
      busyText: '等待 Qoder 授权完成…',
      // ── 两种打开方式（这一家独有的第二级）────────────────────
      // 内嵌窗口**每次都用全新的临时环境**（login_profile.rs），所以能连着加多个
      // 账号，不会像共用浏览器那样直接把人已经登录的那个账号放行过去；
      // 系统浏览器复用浏览器里已有的登录态 —— Google / GitHub 在部分环境下会
      // 拒绝内嵌窗口登录，那条路走不通时用它兜底。
      modes: [
        {
          value: 'embedded',
          label: '内嵌窗口（推荐）',
          hint: '内嵌窗口用全新环境，多账号互不影响；关窗即取消等待',
        },
        {
          value: 'external',
          label: '系统浏览器',
          hint: '系统浏览器打开（复用已登录账号）；完成后自动加入列表',
        },
      ],
    },
    manualTitle: '使用个人访问令牌（PAT）',
    manualNote: '在 Qoder 账号设置 → Integrations 生成 PAT（别填 Google / GitHub 的令牌）。',
    fields: [
      { key: 'pat', label: 'Qoder PAT', rows: 3, placeholder: '粘贴 Qoder 个人访问令牌（pt-…）' },
      { key: 'name', label: '备注名', optional: true, placeholder: '可选，留空使用账号昵称或邮箱' },
    ],
  };
})();
