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
        "primary-light": "#8b89f6",
        // Translation text: warm tint + WCAG AA contrast on card surfaces.
        translation: "#806F3A",
        "translation-light": "#D6BB7E",
        "background-light": "#F8FAFF",
        "background-dark": "#0f172a",
        "card-light": "#FFFFFF",
        "card-dark": "#1f2937",
        success: "#047857",
        danger: "#dc2626"
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
