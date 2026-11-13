/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#05070d',
          900: '#080c15',
          850: '#0b111c',
          800: '#0f1623',
          700: '#16202f',
        },
        accent: {
          DEFAULT: '#10b981',
          soft: '#34d399',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(16,185,129,0.25)',
      },
    },
  },
  plugins: [],
};
