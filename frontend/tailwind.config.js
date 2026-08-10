/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211c",
        palm: "#247057",
        gold: "#c58b32",
        cloud: "#f7f8f5",
        primary: {
          DEFAULT: "#1f6b4f",
          hover: "#18563f",
          soft: "#e9f4ee",
        },
        surface: "#ffffff",
        canvas: "#f5f7f5",
        muted: "#647067",
        border: "#e2e7e3",
        success: "#18794e",
        warning: "#a15c05",
        danger: "#b42318",
        info: "#2563a6",
        sidebar: "#123c2f",
      },
      boxShadow: {
        card: "0 1px 2px rgba(18, 60, 47, 0.045)",
        dialog: "0 24px 64px rgba(15, 23, 42, 0.22)",
      },
    },
  },
  plugins: [],
};
