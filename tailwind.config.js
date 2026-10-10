/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./config/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: 'var(--brand-dark, #0D0D0D)',
          primary: 'var(--brand-primary, #8EBF45)',
          primaryHover: 'var(--brand-primary-hover, #7cb037)',
          secondary: 'var(--brand-secondary, #658C3E)',
          focus: 'var(--brand-focus, #527a23)',
          accent: 'var(--brand-accent, #A8BF75)',
          header: 'var(--brand-header-bg, #0D0D0D)',
          footer: 'var(--brand-footer-bg, #0D0D0D)',
          canvas: 'var(--brand-canvas, #F8FAFC)',
          text: 'var(--brand-text, #1E293B)',
        }
      },
      fontFamily: {
        brand: ['Lexend', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      }
    }
  },
  plugins: []
};
