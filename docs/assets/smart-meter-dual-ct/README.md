# Smart Meter Dual CT artwork

Supplied owner photo, 10 October 2026. Original retained byte-for-byte as
`product-original.png`. Its existing alpha was composited onto white without
regenerating product pixels for `product-white.png` and
`store-photo/{small,large,xlarge}.png` (75/500/1000 pixels). Exported derivatives
omit source metadata. The original includes the meter and its antenna.

Built-in image editing (not CLI fallback) produced `wireframe-source.png` from
the supplied photo. `icon.svg` is a mechanical alpha trace, not a separately
imagined product. `images/{small,large,xlarge}.png` are transparent line art at
75/500/1000 pixels; `wireframe-preview.png` is white-backed QA only. Preserve the
original photo as the product listing image; the generated art is for the icon.

These are future assets, not enabled support. No active driver references them.
See `docs/SMART_METER_DUAL_CT_PLAN.md` for identity/telemetry gates and channel roles.

Reproduce line-art preparation with sharp available through workspace NODE_PATH:

```sh
node scripts/prepare-stream-5000-artwork.cjs \
  docs/assets/smart-meter-dual-ct/wireframe-source.png \
  docs/assets/smart-meter-dual-ct
```

## Image-editing prompt

Use case: style-transfer. Edit target: supplied EcoFlow Smart Meter Dual CT product photograph. Create faithful clean black technical contour line-art of this exact meter and its separate antenna, preserving three-quarter perspective and geometry, stepped DIN-rail housing, upper connector recesses, front status panel with three indicator circles and reset-button outline, bottom connector housing, and the antenna's thin shaft, round base and short angled cable. Keep both components fully visible in the same arrangement with generous padding. No shading, textures, filled panels, labels, logos, words or invented terminals/clamps. Black crisp structural outlines only; all panel interiors and background truly transparent. This is a meter, not a battery; do not replace its geometry or add screens. Artwork suitable for faithful mechanical SVG tracing and Homey driver graphics.
