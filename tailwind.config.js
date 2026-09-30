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
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#205f64',       /* Deep Teal */
          primary: '#498e72',    /* Sage Green */
          secondary: '#75c081',  /* Vibrant Light Green */
          focus: '#1a639c',      /* Vibrant Deep Blue */
          accent: '#2ca4c2',     /* Ocean Cyan */
          canvas: '#F8FAFC',     /* Soft Off-White */
          text: '#1E293B',       /* Slate text */
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
