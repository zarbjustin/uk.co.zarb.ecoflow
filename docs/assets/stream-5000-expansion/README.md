# STREAM Expansion Battery 5000 artwork

Prepared 10 October 2026 from the product photograph supplied by the app owner.

These are staged assets, not a declaration of supported independent pairing. The
expansion battery's API identity, host inclusion and capacity accounting remain
unverified; see `docs/STREAM_MODEL_COVERAGE.md`. Do not substitute this artwork for
an AC 5000 host, enable a driver, or add a supported-device listing solely because
these files exist. No active driver, pairing rule or energy accounting was changed.

## Files

- `product-original.png`: unchanged supplied photograph.
- `wireframe-source.png`: transparent contour artwork derived from that photograph
  using the built-in image editing tool.
- `icon.svg`: mechanical alpha trace of the wireframe, not an independently drawn
  or imagined cabinet. Monochrome, transparent, 1000-square viewBox.
- `images/{small,large,xlarge}.png`: transparent wireframe at 75, 500 and 1000 pixels.
- `store-photo/{small,large,xlarge}.png`: supplied product photo resized to the same
  sizes on its existing white background, ready if a future listing requires it.
- `wireframe-preview.png`: white-backed 500-pixel visual review, not the icon source.

The plain cabinet front and rear rail intentionally differ from the AC 5000 host:
there is no sloped display panel or rear cooling-fin array. Reviewed the full
wireframe and a 75-pixel rendering of the SVG. Confirmed all wireframe raster
dimensions and alpha channels. Original photo is retained byte-for-byte.

## Reproduce asset preparation

With `sharp` available via the workspace runtime's `NODE_PATH`:

```sh
node scripts/prepare-stream-5000-artwork.cjs \
  docs/assets/stream-5000-expansion/wireframe-source.png \
  docs/assets/stream-5000-expansion
```

The explicit standalone output directory prevents overwriting active AC 5000
driver assets. The script's existing default behaviour is unchanged.

## Image editing prompt

Convert the supplied EcoFlow STREAM 5000 expansion battery photograph into faithful clean monochrome black wireframe/contour artwork for a Homey device icon. Trace the photographed device, retaining its exact three-quarter perspective, tall cabinet proportions, plain flat front face, top edge, recessed handle in the upper right-side panel, straight rear mounting/connector rail and small feet. This is the EXPANSION battery: do not add an AC5000 display, sloped control panel, cooling fins, cables, or imagined components. Use clear continuous black outlines and a few accurate structural lines, no shading, grey fills, textures, labels, logos, text or background. Panel interiors and background must be transparent. Center the complete device with generous padding. Preserve the supplied photograph's geometry rather than redesigning it. Crisp technical product line art suitable for small monochrome SVG tracing.
