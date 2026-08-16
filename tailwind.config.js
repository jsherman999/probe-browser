/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary-bg': '#1e293b',
        'secondary-bg': '#334155',
        'accent': '#3b82f6',
        'success': '#10b981',
        'error': '#ef4444',
        'warning': '#f59e0b',
        'text-primary': '#f1f5f9',
        'text-secondary': '#cbd5e1',
        'text-muted': '#94a3b8',
        'tile-concealed': '#475569',
        'tile-revealed': '#f1f5f9',
        'tile-border': '#64748b',
        'player-active': '#3b82f6',
        'player-target': '#f59e0b',
        'player-eliminated': '#6b7280',
      },
      fontFamily: {
        'base': ['Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      gridTemplateColumns: {
        13: 'repeat(13, minmax(0, 1fr))',
      },
      animation: {
        'flip': 'flip 0.3s ease-in-out',
        'shake': 'shake 0.4s ease-in-out',
        'pulse-glow': 'pulse-glow 1s ease-in-out infinite',
      },
      keyframes: {
        flip: {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(180deg)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-10px)' },
          '75%': { transform: 'translateX(10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.5)' },
          '50%': { boxShadow: '0 0 20px rgba(59, 130, 246, 1)' },
        },
      },
    },
  },
  plugins: [],
}
