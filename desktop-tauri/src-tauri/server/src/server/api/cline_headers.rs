//! Cline 伪装头：`GET/PUT /api/cline/headers`。
//!
//! ── 这个端点管什么 ──────────────────────────────────────────
//! Cline 上游请求的伪装头（`X-CLIENT-TYPE: cline-sdk`、平台标识、版本号等）
//! 的**逐键覆盖**。默认值硬编码在 `core::providers::cline::headers`（与官方
//! 客户端形态对齐的那一套，上游收紧时跟着版本走），配置里只存用户改过的键
//! （`config::KEY_CLINE_UPSTREAM_HEADERS`），适配器每次构造上游请求都读快照
//! —— 改完下一个请求立即生效，不重启进程。
//!
//! ── 接口形状 ────────────────────────────────────────────────
//! GET 返回 `{overrides, effective}`：前者是用户改过的键（原样回显，界面
//! 据此标出哪些行被改过），后者是合并后的生效值（界面渲染的就是它）。
//! PUT 收 `{overrides: {...}}` **整体替换**覆盖表：非空值按键覆盖/新增，
//! 空串 = 这个头不发；把某个键从覆盖表里删掉 = 回落默认值。

use std::collections::BTreeMap;

use axum::body::Bytes;
use axum::extract::State;
use axum::response::Response;
use serde_json::{json, Map, Value};

use crate::server::config;
use crate::server::core::providers::cline::headers;
use crate::server::errors;
use crate::server::http::{ok_json, parse_body};
use crate::server::logging;
use crate::server::ServerState;

/// 覆盖表规模上限：伪装头就十来个键，64 是给自定义头留的余量
const MAX_ENTRIES: usize = 64;
/// 单个头名的长度上限（HTTP 头名的合理上界）
const MAX_KEY_LEN: usize = 128;
/// 单个头值的长度上限
const MAX_VALUE_LEN: usize = 4096;

/// GET /api/cline/headers —— 当前覆盖表 + 合并后的生效值
pub async fn get_cline_headers(State(_state): State<ServerState>) -> Response {
    ok_json(headers_json())
}

/// PUT /api/cline/headers —— body `{overrides: {"User-Agent": "...", ...}}`
///
/// 整体替换覆盖表（不是增量 merge：界面按「编辑后的整张表」提交，删除某行
/// 就是把它从表里去掉）。校验：对象形状、值必须是字符串、规模有界；非法项
/// 直接 400，不做静默修正 —— 头名打错字（比如多个空格）是用户该当场看到的。
pub async fn put_cline_headers(State(_state): State<ServerState>, body: Bytes) -> Response {
    let payload = match parse_body(&body) {
        Ok(value) => value,
        Err(error) => return errors::management_error(400, error.message),
    };
    let Some(object) = payload.as_object() else {
        return errors::management_error(400, "请求体必须是 JSON 对象");
    };
    let Some(raw_overrides) = object.get("overrides") else {
        return errors::management_error(400, "缺少 overrides");
    };
    let Some(entries) = raw_overrides.as_object() else {
        return errors::management_error(400, "overrides 必须是对象（头名 → 头值）");
    };
    if entries.len() > MAX_ENTRIES {
        return errors::management_error(400, format!("overrides 最多 {} 项", MAX_ENTRIES));
    }
    let mut overrides = BTreeMap::new();
    for (key, value) in entries {
        let key = key.trim();
        if key.is_empty() || key.len() > MAX_KEY_LEN {
            return errors::management_error(400, format!("头名非法或过长: {key:?}"));
        }
        let Some(text) = value.as_str() else {
            return errors::management_error(400, format!("头 {key} 的值必须是字符串"));
        };
        if text.len() > MAX_VALUE_LEN {
            return errors::management_error(400, format!("头 {key} 的值过长"));
        }
        overrides.insert(key.to_string(), text.to_string());
    }
    if !config::set_cline_upstream_headers(overrides) {
        logging::log("[Config]", "⚠️  Cline 伪装头写入失败，本次运行内仍生效");
    }
    logging::log("[Config]", "Cline 伪装头覆盖表已更新（下一个 Cline 请求生效）");
    ok_json(headers_json())
}

/// 响应形状（GET 与 PUT 共用，前端直接用响应刷新界面）
///
/// `defaults` 一并给出：界面要把「用户把值改回了默认」与「本来就没改」区分开
/// （前者是一份覆盖、后者不该出现在覆盖表里），没有默认值就做不到这个判断。
fn headers_json() -> Value {
    let overrides: BTreeMap<String, String> = config::cline_upstream_overrides().into_iter().collect();
    let defaults: Map<String, Value> = headers::DEFAULT_HEADERS
        .iter()
        .map(|(key, value)| ((*key).to_string(), Value::String((*value).to_string())))
        .collect();
    let effective: Map<String, Value> = headers::effective_headers()
        .into_iter()
        .map(|(key, value)| (key, Value::String(value)))
        .collect();
    json!({
        "overrides": overrides,
        "defaults": defaults,
        "effective": effective,
    })
}
