type ExportColor = [number, number, number];

function grayscale(value: number): ExportColor {
  return [value, value, value];
}

export const exportColors = {
  heading: grayscale(26),
  primary: grayscale(28),
  section: grayscale(35),
  secondary: grayscale(92),
  label: grayscale(105),
  muted: grayscale(120),
  divider: grayscale(30),
  fieldBorder: grayscale(215),
  borderSubtle: grayscale(220),
  tableBorder: grayscale(212),
  surfaceSubtle: grayscale(245),
  surfaceAlternate: grayscale(248),
  onStrong: grayscale(255),
  statusPositive: [53, 122, 69] as ExportColor,
  statusNegative: [170, 65, 65] as ExportColor,
  statusNeutral: grayscale(112),
  warningBackground: [255, 248, 236] as ExportColor,
  warningBorder: [234, 211, 168] as ExportColor,
  warningText: [125, 82, 20] as ExportColor,
  watermarkNegative: [244, 220, 220] as ExportColor,
  watermarkNeutral: grayscale(232),
};
