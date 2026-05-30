/**
 * scripts/generate-icons.js
 * 从SVG图标生成各尺寸PNG图标（用于PWA manifest）
 *
 * 运行方式: node scripts/generate-icons.js
 * 需要: npm install sharp（如未安装会自动提示）
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const svgPath = resolve(rootDir, 'public/icons/icon.svg')
const outputDir = resolve(rootDir, 'public/icons')

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]

// 彩色图标模板（带圆角矩形背景的SVG）
function makeIconSVG(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#e74c3c"/>
      <stop offset="100%" stop-color="#ff6b6b"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="url(#bg)"/>
  <text x="${size/2}" y="${size/2 + size*0.08}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.round(size*0.14)}" font-weight="900" fill="#4dabf7" letter-spacing="4">LOF</text>
  <text x="${size/2}" y="${size/2 + size*0.08 + Math.round(size*0.16)}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.round(size*0.08)}" fill="#e74c3c">套利</text>
</svg>`
}

async function main() {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    console.error('❌ 请安装 sharp: npm install sharp')
    console.log('💡 安装后重新运行: node scripts/generate-icons.js')
    process.exit(1)
  }

  for (const size of sizes) {
    const svg = makeIconSVG(size)
    const buf = await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toBuffer()
    const outPath = resolve(outputDir, `icon-${size}x${size}.png`)
    writeFileSync(outPath, buf)
    console.log(`✅ 生成 icon-${size}x${size}.png`)
  }

  // 同时生成 apple-touch-icon
  const appleSVG = makeIconSVG(180)
  const appleBuf = await sharp(Buffer.from(appleSVG))
    .resize(180, 180)
    .png()
    .toBuffer()
  writeFileSync(resolve(outputDir, 'apple-touch-icon.png'), appleBuf)
  console.log('✅ 生成 apple-touch-icon.png')

  console.log('\n🎉 所有PWA图标生成完成！')
}

main().catch(console.error)
