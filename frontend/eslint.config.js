// Hooks only: the rules of hooks, effect dependencies and the React
// Compiler's rules (the plugin's recommended set) except `refs`, which flags
// refs read during render: fine without the compiler (#245). Style is left
// to the reader and types to tsc.
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const recommended = Object.fromEntries(
  Object.keys(reactHooks.configs["recommended-latest"].rules)
    .filter((rule) => rule !== "react-hooks/refs")
    .map((rule) => [rule, "error"]),
);

export default [
  { ignores: ["dist/**", "src/components/ui/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: recommended,
  },
];
