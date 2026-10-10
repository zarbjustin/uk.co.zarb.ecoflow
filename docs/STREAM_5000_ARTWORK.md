# STREAM 5000 shared artwork

Updated 10 October 2026 from the AC 5000 photograph supplied by the owner.
The built-in image tool converted the photograph into transparent contour art.
The icon is a mechanical alpha trace of that artwork, not an independently
invented battery silhouette. All three compatible driver IDs share the SVG;
the two active 5000 roles share the existing AC 5000 image paths at 75, 500 and
1000 pixels. Homey uses those driver assets automatically for paired devices.

Prompt: Convert the exact supplied AC 5000 into clean black contour line art
on transparency; preserve the three-quarter view, cabinet proportions, slanted
display panel, front-side seam, recessed handle, stepped rear housing, cooling
fins and feet. No invented geometry, internal grid, shading, labels or logos.

Asset preparation: `scripts/prepare-stream-5000-artwork.cjs` accepts the
transparent line-art PNG and uses sharp (available via the workspace runtime's
NODE_PATH) for framing/resizing and a bounded monochrome alpha trace. The
white-backed temporary preview is only for visual inspection.

Public names are now STREAM 5000 Series Unit and STREAM Home Battery (5000),
including German/Dutch display names and references in pairing/settings/readmes.
Driver IDs, device identity, user-assigned names, counters, pairing opt-in,
experimental-connection disclosures, read-only safeguards and Energy roles are
unchanged. Removing Beta from a display name is not hardware/API acceptance.
The shared artwork does not claim expansion, Gateway or 3000 model coverage.
