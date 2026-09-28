# UrTruck country flags — immutable UI rule

All user-facing country flags in UrTruck use the canonical round `CountryFlag`
component backed by the bundled `country-flag-icons` SVG artwork. Rectangular
flags and emoji country flags are forbidden in product UI. This document is a
design constraint, not a runtime asset or a source for individual flag images.

The component is round by default, crops the original artwork inside the
circle, and applies the same light border on Android, iOS, and web. A country
without canonical artwork uses the component fallback or a non-country icon;
screens must not substitute an emoji or a local raster.
