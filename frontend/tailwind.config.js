/**
 * Tailwind CSS v3 – minimal color palette only.
 * Use: bg-app, bg-card, bg-input, text-muted, text-primary, bg-primary, border-gray-*.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        app: '#0a0c0a',
        card: '#151815',
        input: '#1b201b',
        muted: '#8d9a88',
        primary: '#B6FF2A',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
};
