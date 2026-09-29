# Design

The web app is styled with a small design kit in `apps/web/src/kit/`: plain CSS and ES modules
for tokens, components, the chart, icons, menus, overlays and toasts. The React code uses its
`.ui-*` classes and `<ui-icon>` element, and calls its modules for menus, dialogs, toasts, the
chart and the theme switch.

Rules the app follows:

- Green and red only for money and rule state. Links use `--link`.
- Negative numbers use the minus sign (−), and figures are tabular.
- Deleting an account asks first. Removing a day or a payout can be undone from the toast.
- Details stay folded until asked for: extra payout paths, "More numbers", firm notes and rule
  overrides.

`docs/features.md` lists every feature and was the brief for the layout.
