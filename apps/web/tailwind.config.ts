import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sage: '#D9E4DD',
        cream: '#FBF7F0',
        stone: '#CDC9C3',
        charcoal: '#555555',
      },
      fontFamily: {
        nunito: ['var(--font-nunito)', 'sans-serif'],
        'nunito-sans': ['var(--font-nunito-sans)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
