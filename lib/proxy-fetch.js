/**
 * lib/proxy-fetch.js
 * 带代理支持的 fetch 封装
 *
 * 环境变量:
 *   HTTPS_PROXY / HTTP_PROXY — 代理地址 (如 http://127.0.0.1:7897)
 *
 * 用法:
 *   import { proxyFetch } from '../lib/proxy-fetch.js'
 *   const resp = await proxyFetch(url, options)
 */

let _ready = false
let _fetch = null

async function initProxyFetch() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY ||
                   process.env.https_proxy || process.env.http_proxy

  if (!proxyUrl) {
    console.log('[proxy] 无代理 → 直连')
    _fetch = globalThis.fetch
    _ready = true
    return
  }

  console.log('[proxy] 尝试代理:', proxyUrl)

  // 方案1: undici ProxyAgent (Node 18+ 内置)
  try {
    const undici = await import('undici')
    const agent = new undici.ProxyAgent(proxyUrl)
    _fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, dispatcher: agent })
    console.log('[proxy] undici ProxyAgent ✓')
    _ready = true
    return
  } catch (e) {
    console.warn('[proxy] undici 不可用:', e.message)
  }

  // 方案2: https-proxy-agent
  try {
    const mod = await import('https-proxy-agent')
    const Cls = mod.HttpsProxyAgent || mod.default
    const agent = new Cls(proxyUrl)
    _fetch = (url, opts = {}) => globalThis.fetch(url, { ...opts, agent })
    console.log('[proxy] https-proxy-agent ✓')
    _ready = true
    return
  } catch (e) {
    console.warn('[proxy] https-proxy-agent 不可用:', e.message)
  }

  // 回退直连
  console.warn('[proxy] 无可用代理库 → 直连')
  _fetch = globalThis.fetch
  _ready = true
}

export async function proxyFetch(url, options) {
  if (!_ready) await initProxyFetch()
  return _fetch(url, options)
}
