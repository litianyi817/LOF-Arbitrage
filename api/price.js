/**
 * /api/price.js — Vercel Serverless Function
 * 代理天天基金API，获取基金实时估算净值(IOPV)
 *
 * 调用方式: GET /api/price?codes=161116,160505,...
 * 
 * v1.1: 减小批大小和超时，适配Vercel 10s限制
 */

import { proxyFetch } from '../lib/proxy-fetch.js'

// 替换全局 fetch 为代理版本
globalThis.fetch = async (...args) => proxyFetch(...args)

const FUND_API_BASE = 'https://fundgz.1234567.com.cn/js'
const EASTMONEY_NAV_API = 'https://api.fund.eastmoney.com/f10/lsjz'

// 单个基金净值查询（天天基金主源，东方财富备用）
async function fetchFundNav(code) {
  // === 方案1：天天基金（实时估算净值） ===
  try {
    const result = await tryTiantianFund(code)
    if (result && !result.error) return result
  } catch { /* fall through */ }

  // === 方案2：东方财富基金净值（上一交易日确认值） ===
  try {
    const result = await tryEastmoneyNav(code)
    if (result && !result.error) return result
  } catch { /* fall through */ }

  return { code, error: '所有净值源均失败' }
}

async function tryTiantianFund(code) {
  const url = `${FUND_API_BASE}/${code}.js`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/'
      }
    })
    clearTimeout(timeout)

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()

    const jsonMatch = text.match(/jsonpgz\((\{[\s\S]*?\})\)/i)
    if (!jsonMatch) throw new Error('非JSONP')

    const raw = JSON.parse(jsonMatch[1])
    const estimatedNav = parseFloat(raw.gsz) || 0
    const nav = parseFloat(raw.dwjz) || 0

    return {
      code: raw.fundcode || code,
      name: raw.name || '',
      nav,
      estimatedNav,
      estimatedTime: raw.gztime || '',
      estimatedPct: parseFloat(raw.gszzl) || 0,
      navDate: raw.jzrq || '',
      navAcc: parseFloat(raw.ljjz) || 0,
      displayNav: estimatedNav > 0 ? estimatedNav : nav,
      source: 'tiantian'
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function tryEastmoneyNav(code) {
  const url = `${EASTMONEY_NAV_API}?callback=&fundCode=${code}&pageIndex=1&pageSize=1`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://fund.eastmoney.com/'
      }
    })
    clearTimeout(timeout)

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()

    // 去JSONP包装
    let data
    try {
      data = JSON.parse(text)
    } catch {
      const m = text.match(/^\s*\w*\((.+)\)\s*;?\s*$/s)
      if (m) data = JSON.parse(m[1])
      else throw new Error('非JSON')
    }

    const records = data?.Data?.LSJZList || []
    if (records.length === 0) throw new Error('无净值记录')

    const latest = records[0]
    const nav = parseFloat(latest.DWJZ) || 0
    const accNav = parseFloat(latest.LJJZ) || 0

    return {
      code,
      name: '',
      nav,
      estimatedNav: 0,     // 东方财富接口不提供实时估算
      estimatedTime: '',
      estimatedPct: 0,
      navDate: latest.FSRQ || '',
      navAcc: accNav,
      displayNav: nav,     // 直接用确认净值
      source: 'eastmoney_nav'
    }
  } finally {
    clearTimeout(timeout)
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`)
    const codeParam = searchParams.get('code')
    const codesParam = searchParams.get('codes')
    const sourceParam = searchParams.get('source') || 'tiantian'

    const codes = codesParam
      ? codesParam.split(',').filter(Boolean).slice(0, 15)  // 最多15个（Vercel 10s限制）
      : codeParam
        ? [codeParam]
        : []

    if (codes.length === 0) {
      return res.status(400).json({
        success: false,
        error: '请提供 code 或 codes 参数',
        time: new Date().toISOString()
      })
    }

    // 并发查询（批大小降至5，确保10秒内完成）
    const results = []
    const batchSize = 5
    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize)
      const batchResults = await Promise.allSettled(
        batch.map(code => fetchFundNav(code))
      )
      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          results.push(r.value)
        } else {
          results.push({ code: 'unknown', error: r.reason?.message || '请求失败' })
        }
      }
    }

    // 补充 displayNav 字段：优先用估算净值，否则用上一交易日净值
    for (const r of results) {
      if (!r.error && r.displayNav === undefined) {
        r.displayNav = r.estimatedNav > 0 ? r.estimatedNav : r.nav
      }
    }

    const successCount = results.filter(r => !r.error).length

    res.status(200).json({
      success: true,
      total: codes.length,
      successCount,
      data: results,
      source: sourceParam,
      time: new Date().toISOString()
    })
  } catch (err) {
    console.error('[price API] Error:', err.message)
    res.status(500).json({
      success: false,
      error: err.message,
      time: new Date().toISOString()
    })
  }
}
