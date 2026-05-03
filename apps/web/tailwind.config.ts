import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sage: '#D9E4DD',
        'sage-border': '#B8CFC8',
        cream: '#FBF7F0',
        stone: '#CDC9C3',
        charcoal: '#555555',
        teal: '#5e8880',
        'teal-light': '#8AADA4',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'DM Sans', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'DM Mono', 'monospace'],
        'dm-sans': ['var(--font-dm-sans)', 'DM Sans', 'sans-serif'],
        'dm-mono': ['var(--font-dm-mono)', 'DM Mono', 'monospace'],
        // Keep old names for backward compat
        nunito: ['var(--font-dm-sans)', 'DM Sans', 'sans-serif'],
        'nunito-sans': ['var(--font-dm-sans)', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
