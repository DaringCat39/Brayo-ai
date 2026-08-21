import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#08080a',
        panel: '#111114',
        lime: '#d7ff5f',
        violet: '#8f7cff',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(215,255,95,.16), 0 24px 80px rgba(0,0,0,.4)',
      },
    },
  },
  plugins: [],
};

export default config;
