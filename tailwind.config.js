/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gokwik: { orange: '#FF6B00', dark: '#1a1a2e' },
        // Tier semantics reused across the console.
        tier: {
          prepaid: '#2E6B4F',
          pg: '#2A5F6B',
          short: '#8A6410',
          long: '#A8481C',
        },
      },
      fontFamily: { mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
    },
  },
  plugins: [],
};
