/**
 * utils/directApi.js
 * 浏览器直连中国金融API（JSONP方式，利用用户本地代理）
 *
 * 原理：JSONP 通过 <script> 标签跨域，不受 CORS 限制
 * 用户浏览器 → 本地代理 127.0.0.1:7897 → 中国API
 */

/**
 * 通用 JSONP 请求
 * @param {string} url - 含 callback 参数的完整URL
 * @param {number} timeout - 超时ms
 * @returns {Promise<any>}
 */
function jsonp(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const callbackName = '_lof_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
    const script = document.createElement('script')
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('JSONP超时'))
    }, timeout)

    function cleanup() {
      clearTimeout(timer)
      delete window[callbackName]
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    window[callbackName] = (data) => {
      cleanup()
      resolve(data)
    }

    script.onerror = () => {
      cleanup()
      reject(new Error('JSONP请求失败'))
    }

    // 替换URL中的回调占位符
    const finalUrl = url.replace('{callback}', callbackName)
    script.src = finalUrl
    document.head.appendChild(script)
  })
}

/**
 * 获取LOF场内行情（直连东方财富）
 */
export async function fetchMarketPricesDirect(codes) {
  const secids = codes.map(c => {
    if (c.startsWith('16') || c.startsWith('15')) return `0.${c}`
    if (c.startsWith('50') || c.startsWith('51')) return `1.${c}`
    return `0.${c}`
  }).join(',')

  const params = new URLSearchParams()
  params.set('pn', '1')
  params.set('pz', String(codes.length + 5))
  params.set('po', '1')
  params.set('np', '1')
  params.set('fltt', '2')
  params.set('invt', '2')
  params.set('fid', 'f3')
  params.set('secids', secids)
  params.set('fields', 'f2,f3,f4,f12,f14,f15,f16,f17,f18')
  params.set('cb', '{callback}') // JSONP回调占位符

  const url = `https://push2.eastmoney.com/api/qt/clist/get?${params.toString()}`
  console.log('[直连] 行情请求:', codes.length, '个代码')

  const data = await jsonp(url, 10000)
  const items = data?.data?.diff || []

  return {
    data: items.map(it => ({
      code: it.f12 || '',
      name: it.f14 || '',
      price: parseFloat(it.f2) || 0,
      changePct: parseFloat(it.f3) || 0,
      change: parseFloat(it.f4) || 0,
      high: parseFloat(it.f15) || 0,
      low: parseFloat(it.f16) || 0,
      open: parseFloat(it.f17) || 0,
      prevClose: parseFloat(it.f18) || 0
    })),
    source: 'eastmoney_direct'
  }
}

/**
 * 获取估算净值（直连天天基金）
 * 天天基金API原生就是JSONP格式
 */
export async function fetchNavDirect(codes) {
  const results = []

  for (const code of codes) {
    try {
      const url = `https://fundgz.1234567.com.cn/js/${code}.js?callback={callback}&_=${Date.now()}`
      const raw = await jsonp(url, 5000)

      const estimatedNav = parseFloat(raw.gsz) || 0
      const nav = parseFloat(raw.dwjz) || 0

      results.push({
        code: raw.fundcode || code,
        name: raw.name || '',
        nav,
        estimatedNav,
        estimatedTime: raw.gztime || '',
        estimatedPct: parseFloat(raw.gszzl) || 0,
        navDate: raw.jzrq || '',
        navAcc: parseFloat(raw.ljjz) || 0,
        displayNav: estimatedNav > 0 ? estimatedNav : nav,
        source: 'tiantian_direct'
      })
    } catch (e) {
      console.warn(`[直连] 净值失败 ${code}:`, e.message)
      results.push({ code, error: e.message })
    }
  }

  return { data: results, source: 'tiantian_direct' }
}

/**
 * 测试直连是否可达
 */
export async function testDirectConnection() {
  try {
    await jsonp(
      `https://push2.eastmoney.com/api/qt/clist/get?cb={callback}&pn=1&pz=1&po=1&np=1&fltt=2&invt=2&fid=f3&fs=b:MK0021&fields=f12`,
      5000
    )
    return true
  } catch {
    return false
  }
}
