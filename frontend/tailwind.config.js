/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#F5A623", // MST turuncu tonu
          dark: "#E08E00",
        },
        traction: "#2563eb", // Yürüyüş = mavi
        pump: "#f59e0b", // Pompa = turuncu
      },
    },
  },
  plugins: [],
};
