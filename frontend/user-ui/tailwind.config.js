/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          base: "#0B0B0C",
          surface: "#17181B",
          light: "#F2ECE2",
          oxblood: "#5B0A19",
        },
        
        borderColor: { hairline: "rgba(242,236,226,0.10)" },        
      },
    },
    plugins: [],
  }
  