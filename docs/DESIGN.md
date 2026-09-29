# Design

The web app uses the PX Brand design system, Aero style, taken from PX Brand at commit
`97d0e145`. The kit lives in `apps/web/src/px/` as plain CSS and ES modules: tokens, components,
chart, icons, menus, overlays and toasts. The React code uses its `.px-*` classes and calls its
modules for menus, dialogs, toasts, the chart and the theme switch.

To update the kit, copy the new files from PX Brand over `apps/web/src/px/` and run `pnpm e2e`.

Rules the app follows from PX Brand:

- Green and red only for money and rule state. Links use `--link`.
- Negative numbers use the minus sign (−), and figures are tabular.
- Deleting an account asks first. Removing a day or a payout can be undone from the toast.
- Details stay folded until asked for: extra payout paths, "More numbers", firm notes and rule
  overrides.

`docs/features.md` lists every feature and was the brief for the layout.
