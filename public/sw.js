/**
 * Service Worker — LOF溢价率套利计算器
 * 
 * 策略：
 * - 静态资源：Cache First（构建产物带hash，可永久缓存）
 * - API请求：Network First（需要实时数据，离线时用缓存兜底）
 * - HTML：Network First（确保获取最新页面）
 */

const CACHE_NAME = 'lof-premium-v1'
const STATIC_CACHE = 'lof-static-v1'
const API_CACHE = 'lof-api-v1'

// ===== 安装：预缓存核心资源 =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...')
  self.skipWaiting()
})

// ===== 激活：清理旧缓存 =====
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...')
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

// ===== 请求拦截 =====
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 跳过非GET请求
  if (request.method !== 'GET') return

  // API请求：Network First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE))
    return
  }

  // 静态资源（带hash的构建产物）：Cache First
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.match(/\.(js|css|woff2?|png|svg|ico)$/)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  // HTML页面：Network First
  event.respondWith(networkFirst(request, CACHE_NAME))
})

// ===== 缓存策略 =====

// 网络优先（失败时回退缓存）
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request)
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    // 如果是API请求，返回空数据的JSON
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({ success: false, error: '离线模式，数据不可用', time: new Date().toISOString() }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
    throw new Error('Network unavailable')
  }
}

// 缓存优先（失败时请求网络）
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    const cache = await caches.open(cacheName)
    cache.put(request, response.clone())
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}
