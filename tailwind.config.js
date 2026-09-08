/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // GoKwik brand — orange primary on near-black, per the platform config
        // and the deployer's own chrome.
        gk: {
          orange: '#FF6B00',
          orangeDim: '#FF8A33',
          purple: '#A855F7',
        },
        // Neutral ramp with a slight blue cast, so the dark never reads as flat grey.
        ink: {
          950: '#0A0C11',
          900: '#12151D',
          850: '#171B24',
          800: '#1D222C',
          700: '#272D3A',
          600: '#39414F',
          500: '#4E5768',
          400: '#7A8496',
          300: '#9BA4B4',
          200: '#B8C0CD',
          50: '#E9EBF1',
        },
        // Semantic, tuned to sit on a dark ground rather than a light one.
        ok: '#3DD68C',
        warn: '#FFB020',
        bad: '#FF5F5F',
      },
      backgroundImage: {
        'gk-edge': 'linear-gradient(90deg, #FF6B00 0%, #FF8A33 35%, #A855F7 100%)',
      },
      fontFamily: { mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
    },
  },
  plugins: [],
};
