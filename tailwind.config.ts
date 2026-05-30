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
          DEFAULT: "#e8380d",
          dark: "#c22e0a",
          light: "#fde8e3",
        },
      },
    },
  },
  plugins: [],
};

export default config;
