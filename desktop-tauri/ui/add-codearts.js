/* CodeArts（华为云 AI 代码助手 / snap-access）添加配置；由 add-provider-forms.js 统一渲染并绑定。 */
(() => {
  /** ── 网页登录（OAuth 授权码 + PKCE）────────────────────────
   * 授权地址由网关拼（`providers::codearts::oauth::authorize_url`，参数与官方扩展
   * 逐字对过向量），portal 完成后把浏览器送回**网关自己的端口**上的
   * `http://127.0.0.1:<port>/oauth/callback` —— 路径不是我们能挑的：portal 只认授权
   * 地址里给的 `port`。所以浏览器与网关在同一台机器时两次回调（先 secret+redirect、
   * 再 code）都能落地；不在同一台时浏览器跳的是它自己的 127.0.0.1，到不了网关。
   *
   * 那种部署（网关跑在 NAS / 服务器上）的用法写在下面的提示里，两条通道都通：
   *   * 地址栏里那条 localhost 地址**改成网关地址**再回车 —— 带 `code` 就直接落账；
   *   * 只带 `secret` 时网关会转去走 ticket 轮询通道，代价是**拿不到 refresh token**
   *     （约一小时后要重新登录一次），界面上这句提示是照实说的。
   *
   * ── 凭据为什么是一整块、且只有一个 JSON 框 ──────────────────
   * CodeArts 的凭据是一次 OAuth/PKCE 登录换来的**临时三元组**（AK/SK/STS，实测约
   * 一小时到期），续期还要出示**当初那次登录的 PKCE verifier 与 DPoP 私钥**，
   * 所以少搬一半到期就刷不回来。而用户手上这份数据的**原生形状就是一段 JSON**
   * （官方插件写 `codearts_provider_credential`、CLIProxyAPI 的 auth 文件整份包在
   * 里面）：拆成六个框会把「粘哪一格」变成六次出错机会，`oauth_context` 本身还是
   * 嵌套对象、框里塞不下。因此一个框整份粘，前端解析后按字段铺开
   * （`add-provider-forms.js` 的 `jsonExpand`），带外层包装的与铺平的都认。
   */
  window.wbCodeArtsAddForms = [
    {
      provider: 'codearts',
      label: 'CodeArts',
      // 本家**没有**「读本机客户端登录态」这条后端路径（凭据只能靠网页登录或粘贴）。
      // 不显式关掉的话，桌面壳里会出现一个选了之后什么都没有的分段：chip 只看
      // `desktop !== false`，而下面的 desktopBlockOf 没有 desktopNote 就返回空串。
      // 浏览器面板看不到这个洞（platform()==='web' 时整段收起），只有 App 里会露。
      desktop: false,
      webLogin: {
        noteHtml: '打开华为云 CodeArts 的官方授权页登录：登录完成后官方页面会把浏览器带回<b>网关自己的</b> '
          + '<code>/oauth/callback</code>，网关用一次性授权码换取临时凭据并加入账号列表。'
          + '<br>网关跑在另一台机器上时（NAS / 服务器），浏览器跳的是它自己的 127.0.0.1 —— '
          + '把地址栏里那条地址的主机端口改成网关的（如 <code>http://192.168.1.58:3065/oauth/callback?…</code>）再回车即可。',
        button: '打开 CodeArts 授权页',
        busyText: '等待 CodeArts 登录完成…',
        modes: [
          {
            value: 'embedded',
            label: '内嵌窗口（推荐）',
            hint: '将打开内嵌窗口；登录完成后自动加入账号列表。关掉窗口即取消等待',
          },
          {
            value: 'external',
            label: '系统浏览器',
            hint: '将用系统默认浏览器打开授权页（会复用浏览器里已登录的华为云账号）；'
              + '浏览器与网关不在同一台机器时，按上方说明把回调地址改成网关地址再走一遍',
          },
        ],
      },
      manualTitle: '粘贴登录凭据',
      manualNoteHtml: '整份粘贴官方插件 / CLIProxyAPI 落盘的凭据 JSON（形如 '
        + '<code>{"codearts_provider_credential":{…}}</code>，铺平的也行）。'
        + '<br>必填：<code>access_key_id</code>、<code>secret_access_key</code>、<code>security_token</code>。'
        + '<b>要能自动续期，必须连 <code>refresh_token</code> 与 <code>oauth_context</code> 一起粘</b>'
        + ' —— 临时凭据约一小时到期，缺这半块就续不回来，只能重新登录。',
      fields: [
        {
          key: 'credentialJson',
          label: '凭据 JSON',
          rows: 8,
          // 解析后按字段铺开进请求体（后端 `Credential::from_payload` 嵌套/平铺都认）
          jsonExpand: true,
          placeholder: '{"codearts_provider_credential":{"access_key_id":"HSTA…","secret_access_key":"…","security_token":"…","expires_at":"2026-09-27T16:17:00.327Z","domain_id":"…","user_id":"…","user_name":"…","refresh_token":"eyJ…","oauth_context":{…}}}',
        },
        { key: 'name', label: '备注名', optional: true, placeholder: '可选，留空使用凭据里的 user_name' },
      ],
    },
  ];
})();
