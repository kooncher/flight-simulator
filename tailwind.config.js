export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Inter', 'Noto Sans Thai', 'sans-serif']
      },
      colors: {
        brand: {
          50: '#eaf8ff',
          100: '#d4f1ff',
          200: '#a9e3ff',
          300: '#7ed5ff',
          400: '#52c7ff',
          500: '#0ea5e9',
          600: '#0b83b7',
          700: '#086184',
          800: '#053f52',
          900: '#021d20'
        }
      }
    }
  },
  plugins: []
}
