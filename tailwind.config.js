/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        risk: {
          low: '#16a34a',
          moderate: '#ca8a04',
          high: '#ea580c',
          critical: '#dc2626',
        },
      },
    },
  },
  plugins: [],
}
