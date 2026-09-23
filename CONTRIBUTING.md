# Coding standards

Status: required standards. TypeScript and ESLint are configured in this repository.

## Source policy

Use Google Chrome extension documentation and Mozilla MDN/Extension Workshop for browser design. Both the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) and [TypeScript declaration-file do's and don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html) are required coding guidelines. Official documentation for selected development tools may be consulted for setup. Identify project-specific choices as such and record browser/version implications.

## Language conventions

Use the applicable portions of the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html): ES modules, named exports, narrow public interfaces, `const` by default, descriptive names, and no mutable exported bindings. Avoid `any`; use `unknown` for external values and narrow them before use. Prefer ordinary objects and functions to classes used only as namespaces.

Project conventions:

- Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Use two-space indentation, single-quoted strings, semicolons, and trailing commas in multiline structures.
- Use kebab-case filenames, camelCase functions/variables, and PascalCase types/classes.
- Annotate public service contracts; infer obvious local types. Include emitted `.js` extensions in relative module imports.
- Use `async`/`await`; handle rejected promises at event boundaries. Never suppress failures with empty catch blocks.
- Comments explain constraints and decisions. Document persistence formats, message contracts, and browser-specific workarounds.

These conventions adapt the guide to a browser extension; they are not a claim of complete Google style conformance.

## Declaration and callback contracts

Follow the TypeScript declaration guide for `.d.ts` files and application contracts. Use primitive types, meaningful generic parameters, and `unknown` for untrusted data. An ignored callback result is `void`. Optional callback parameters mean the caller may omit the argument, not that the callback may ignore it. Prefer unions and optional trailing parameters over redundant overloads when return types match; specific overloads precede general ones.

## Automated enforcement

`npm run lint` uses ESLint flat configuration, type-aware typescript-eslint strict rules, and stylistic rules. It rejects unsafe `any` operations, boxed types, redundant signatures, unused type parameters, floating promises, default application exports, and mutable exported bindings. `npm run lint:fix` applies safe available fixes.

`npm run check` runs lint, strict TypeScript checking, unit/tooling tests, both builds, and Mozilla package validation. `npm run test:browser` runs an isolated Chrome smoke test. Set `SM_BROWSER` to another Chromium browser executable to test that browser. No test uses a personal browser profile.

ESLint cannot enforce every guideline. Review callback optionality, overload order, generic meaning, data ownership, and API design manually. The default export in `eslint.config.mjs` is a tool-required exception; application files use named exports.

## Architecture rules

- Keep domain logic free of extension globals, storage, and DOM dependencies.
- Access extension APIs through the platform adapter and persistence through repositories.
- UI code sends typed commands; the background owns writes and returns explicit results.
- Validate persisted/imported data and messages at runtime. TypeScript types do not validate external values.
- Use explicit error codes such as `PERMISSION_REQUIRED`, `STORAGE_FULL`, `STALE_REVISION`, and `RESTORE_PARTIAL`, with actionable user messages.
- Keep functions focused on one operation. Extract abstractions when they remove actual duplication or isolate a browser boundary.
- Restrict parallel work by resource. Preserve tab order and serialize conflicting writes; never open hundreds of tabs with unbounded `Promise.all`.

## Data and security rules

- Schema changes include a migration and a representative old-data fixture.
- Never overwrite or reset user data automatically after migration failure; preserve it and report recovery options.
- Deletion, overwrite, import, and retry behavior must follow the product design.
- Never use `eval`, remote executable code, or unsafe HTML interpolation for browsing data.
- Never log titles, full URLs, bookmark trees, or imported content in routine diagnostics.
- Treat permissions and unsupported capabilities as normal runtime conditions.
- Pin development tool versions and commit a lockfile when tooling is introduced. Review new dependencies for purpose, maintenance, licensing, and packaged code impact.

## Tests and review

Test observable outcomes and failure paths. Every data-loss or compatibility bug fix should include a regression test where practical. Avoid tests that merely repeat implementation details.

A change is ready when:

- Type checks and applicable automated tests pass.
- Changed browser APIs have compatibility evidence for the supported targets.
- Storage or browser side effects have failure/retry behavior documented and tested.
- UI changes cover keyboard focus, accessible labels, and loading/error/empty states.
- Permission and manifest changes have a feature-specific justification.
- Relevant docs describe the final behavior and limitations.

Keep changes reviewable and scoped. Record validation actually performed; distinguish automated checks, manual checks, and checks not yet run. Use a decision note when changing the storage model, permission budget, browser support policy, or dependency strategy.
