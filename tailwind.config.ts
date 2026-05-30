import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1f4be0",
          dark: "#1a3cc4",
          light: "#e8edfc",
        },
        paper: "#f4f3f1",
        ink: {
          DEFAULT: "#1a1a1a",
          2: "#59554e",
          3: "#8e897f",
        },
        line: {
          DEFAULT: "#e0ded9",
          strong: "#cfccc4",
        },
      },
    },
  },
  plugins: [],
};

export default config;
