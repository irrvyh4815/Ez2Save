/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          900: "#064e3b",
          950: "#022c22"
        }
      },
      boxShadow: {
        subtle: "0 1px 2px rgb(15 23 42 / 0.08)"
      }
    }
  },
  plugins: []
};
