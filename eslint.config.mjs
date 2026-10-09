// Module boundaries (architecture AD-1, AD-16) are enforced here, not by convention.
// Each source file matches exactly one `no-restricted-imports` layer config below;
// later configs override earlier ones for the same rule, which is how a known
// module is allowed to reach its own internals.
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export const MODULES = [
  "case-study",
  "material",
  "generation",
  "rendering",
  "sharing",
  "access",
  "jobs",
];

const SOURCE = "**/*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}";

const VENDOR_SDK = {
  regex: "^(@supabase/|@aws-sdk/|@anthropic-ai/|@playwright/|playwright(-core)?(/|$)|sharp(/|$))",
  message: "Vendor SDKs are imported only in src/modules/<module>/adapters/ (AD-1).",
};
const RESERVED_INTEGRATION = {
  regex: "^(@modelcontextprotocol/|@/modules/integration(/|$))",
  message: "MAC Productive / MCP is reached only through src/modules/integration, reserved for Epic 7 (AD-16).",
};
const DB_TYPES = {
  regex: "(^|/)db\\.types(\\.ts)?$",
  message: "Generated database types are imported only in adapters/.",
};
const MODULE_INTERNALS = {
  regex: "^@/modules/[^/]+/.+",
  message: "Import a module only through its public index: `@/modules/<module>` (AD-1).",
};
const RELATIVE_INTO_MODULES = {
  regex: "^(\\.\\.?/)+(.*/)?modules(/|$)",
  message: "Import modules through the `@/modules/<module>` alias, never by relative path (AD-1).",
};
const ALIAS_DOTDOT = {
  regex: "^@/(.*/)?\\.\\.(/|$)",
  message: "`..` segments are not allowed in `@/` alias imports.",
};
const SHARED_TO_APP = {
  regex: "^(@/|(\\.\\.?/)+(.*/)?)(app|worker)(/|$)",
  message: "src/shared must not depend on src/app or src/worker.",
};
const ANY_MODULE = {
  regex: "^@/modules(/|$)",
  message: "src/shared must not depend on modules.",
};
const DOTDOT_SEGMENT = {
  regex: "(^|/)\\.\\.(/|$)",
  message: "Inside src/modules, import across folders with the `@/modules/<module>/...` alias so boundaries can be checked; `..` path segments are not allowed.",
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const otherModuleInternals = (m) => ({
  regex: `^@/modules/(?!${escape(m)}/)[^/]+/.+`,
  message: "Import another module only through its public index: `@/modules/<module>` (AD-1).",
});

// Test files in domain/ may also import vitest; production domain code may not.
const domainImports = (m, { test = false } = {}) => ({
  regex: `^(?!zod(/|$)|${test ? "vitest(/|$)|" : ""}\\./|@/shared/${m ? `|@/modules/${escape(m)}/domain/` : ""}).+`,
  message: "domain/ is pure: it imports only @/shared/*, files of its own domain/ and zod (AD-1).",
});

const PROCESS_ENV = [
  "MemberExpression[object.name='process'][property.name='env']",
  "MemberExpression[object.name='process'][property.value='env']",
  "MemberExpression[object.property.name='process'][property.name='env']",
  "MemberExpression[object.property.name='process'][property.value='env']",
  "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
  "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.value='env']",
  "VariableDeclarator[init.property.name='process'] > ObjectPattern > Property[key.name='env']",
].map((selector) => ({
  selector,
  message: "process.env is read only in src/shared/env.ts; use getEnv().",
}));

// no-restricted-imports ignores `import()` and `require()`; mirror the same
// patterns for string-literal sources through no-restricted-syntax.
const asSelectorRegex = (regex) => `/${regex.replace(/\//g, "\\/")}/`;
const dynamicImports = (patterns) =>
  patterns.flatMap(({ regex, message }) => [
    { selector: `ImportExpression[source.value=${asSelectorRegex(regex)}]`, message },
    {
      selector: `CallExpression[callee.name='require'][arguments.0.value=${asSelectorRegex(regex)}]`,
      message,
    },
  ]);

/** One boundary layer: static, dynamic and require imports plus the process.env ban. */
const layer = (files, patterns, { ignores, extraSyntax = [] } = {}) => ({
  files,
  ...(ignores ? { ignores } : {}),
  rules: {
    "no-restricted-imports": ["error", { patterns }],
    "no-restricted-syntax": ["error", ...extraSyntax, ...PROCESS_ENV, ...dynamicImports(patterns)],
  },
});

const OUTSIDE_MODULES = [
  VENDOR_SDK,
  RESERVED_INTEGRATION,
  DB_TYPES,
  MODULE_INTERNALS,
  RELATIVE_INTO_MODULES,
  ALIAS_DOTDOT,
];
const SHARED = [
  VENDOR_SDK,
  RESERVED_INTEGRATION,
  DB_TYPES,
  ANY_MODULE,
  RELATIVE_INTO_MODULES,
  SHARED_TO_APP,
  ALIAS_DOTDOT,
];
const application = (internals) => [VENDOR_SDK, RESERVED_INTEGRATION, DB_TYPES, internals, DOTDOT_SEGMENT];
const adapters = (internals) => [RESERVED_INTEGRATION, internals, DOTDOT_SEGMENT];
const domain = (m, opts) => [domainImports(m, opts), DB_TYPES, DOTDOT_SEGMENT];
const DOMAIN_TEST = "*.test.{ts,tsx,mts,cts}";

export default defineConfig(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
      "supabase/**",
      "_bmad/**",
      "_bmad-output/**",
      "docs/**",
      ".claude/**",
      // Deliberately non-compliant inputs for test/authorize-guard.test.ts.
      "test/fixtures/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat["recommended-latest"],

  // Catch-all for any other file under src/ (e.g. src/lib): treated like the UI layer.
  layer([`src/${SOURCE}`], OUTSIDE_MODULES),

  // UI and worker entry: modules only through index.ts, no vendor SDKs.
  layer([`src/app/${SOURCE}`, `src/worker/${SOURCE}`, `src/*.{ts,tsx}`], OUTSIDE_MODULES),

  // Shared primitives depend on nothing app-specific.
  layer([`src/shared/${SOURCE}`], SHARED),

  // Any module: application layer (everything except domain/ and adapters/), adapters/, domain/.
  layer([`src/modules/*/${SOURCE}`, `src/modules/*/**/${SOURCE}`], application(MODULE_INTERNALS), {
    ignores: ["src/modules/*/domain/**", "src/modules/*/adapters/**"],
  }),
  layer([`src/modules/*/adapters/**/${SOURCE}`], adapters(MODULE_INTERNALS)),
  layer([`src/modules/*/domain/**/${SOURCE}`], domain(null)),
  layer([`src/modules/*/domain/**/${DOMAIN_TEST}`], domain(null, { test: true })),

  // Known modules may reach their own internals through the alias.
  ...MODULES.flatMap((m) => [
    layer(
      [`src/modules/${m}/${SOURCE}`, `src/modules/${m}/**/${SOURCE}`],
      application(otherModuleInternals(m)),
      { ignores: [`src/modules/${m}/domain/**`, `src/modules/${m}/adapters/**`] },
    ),
    layer([`src/modules/${m}/adapters/**/${SOURCE}`], adapters(otherModuleInternals(m))),
    layer([`src/modules/${m}/domain/**/${SOURCE}`], domain(m)),
    layer([`src/modules/${m}/domain/**/${DOMAIN_TEST}`], domain(m, { test: true })),
  ]),

  // src/modules/integration is reserved for Epic 7 (AD-16): no file may exist there.
  layer([`src/modules/integration/**/${SOURCE}`], application(MODULE_INTERNALS), {
    extraSyntax: [
      {
        selector: "Program",
        message: "src/modules/integration is reserved for Epic 7 (AD-16); MVP code must not live here.",
      },
    ],
  }),

  // The one file allowed to read process.env.
  {
    files: ["src/shared/env.ts"],
    rules: { "no-restricted-syntax": ["error", ...dynamicImports(SHARED)] },
  },
);
