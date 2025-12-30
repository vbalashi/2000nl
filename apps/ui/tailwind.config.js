/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./playwright/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Lexend", "sans-serif"]
      },
      colors: {
        primary: "#2e2bee",
        "background-light": "#F5F7FB",
        "background-dark": "#0f172a",
        "card-light": "#FFFFFF",
        "card-dark": "#1f2937",
        success: "#10B981",
        danger: "#EF4444"
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem"
      }
    }
  },
  plugins: []
};
