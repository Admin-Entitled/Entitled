/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0B0B0C',
          surface: '#17181B',
          'surface-2': '#111215',
          text: '#F2ECE2',
          muted: '#BDB6AC',
          accent: '#5B0A19',
          'accent-soft': 'rgba(91, 10, 25, 0.28)',
          metal: '#C8B58A',
          border: '#2A2C31',
          success: '#2F6B4F',
          danger: '#7A1F1F'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Fraunces', 'Libre Baskerville', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      }
    },
  },
  plugins: [],
}
