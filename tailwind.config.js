/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0f0f1a',
          card: '#1a1a2e',
          hover: '#252542'
        },
        up: {
          light: '#ff6b6b',
          DEFAULT: '#e74c3c',
          bg: 'rgba(231, 76, 60, 0.15)',
          deep: 'rgba(231, 76, 60, 0.3)'
        },
        down: {
          light: '#51cf66',
          DEFAULT: '#2ecc71',
          bg: 'rgba(46, 204, 113, 0.15)',
          deep: 'rgba(46, 204, 113, 0.3)'
        },
        accent: '#4dabf7',
        muted: '#8892b0'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"SF Mono"', '"Cascadia Code"', 'Consolas', 'monospace']
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }]
      },
      screens: {
        'xs': '375px'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      }
    }
  },
  plugins: []
}
