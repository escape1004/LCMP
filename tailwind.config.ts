import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'noto': ['Noto Sans KR', 'sans-serif'],
      },
      colors: {
        // Dark theme colors
        'bg-primary': '#36393f',
        'bg-sidebar': '#2f3136',
        'accent': '#5865f2',
        'hover': '#42464d',
        'text-primary': '#dcddde',
        'text-muted': '#72767d',
        'success': '#3ba55c',
        'warning': '#faa61a',
        'danger': '#ed4245',
        'border': '#202225',
      },
      borderRadius: {
        'lg': '6px',
        'md': '4px',
        'sm': '2px',
      },
    },
  },
  plugins: [],
} satisfies Config;
