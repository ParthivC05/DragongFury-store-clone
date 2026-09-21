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
        app: '#0d0d0f',
        card: '#1a1a1f',
        input: '#222228',
        muted: '#6b6b72',
        primary: '#666f50',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
};
