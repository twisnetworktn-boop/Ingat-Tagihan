/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#18332f',
    tint: '#216358',
    background: '#f5f7f4',
    foreground: '#18332f',
    card: '#ffffff',
    cardForeground: '#18332f',
    primary: '#216358',
    primaryForeground: '#ffffff',
    secondary: '#e8efeb',
    secondaryForeground: '#24564c',
    muted: '#edf0ed',
    mutedForeground: '#718079',
    accent: '#fff0e9',
    accentForeground: '#a84932',
    destructive: '#bd4d45',
    destructiveForeground: '#ffffff',
    border: '#e3e9e4',
    input: '#e3e9e4',
  },
  dark: {
    text: '#ecf3ee',
    tint: '#9ed2c3',
    background: '#101c19',
    foreground: '#ecf3ee',
    card: '#192823',
    cardForeground: '#ecf3ee',
    primary: '#2e7667',
    primaryForeground: '#ffffff',
    secondary: '#243832',
    secondaryForeground: '#c2e3d8',
    muted: '#22312c',
    mutedForeground: '#a2b2aa',
    accent: '#40291f',
    accentForeground: '#ffc2aa',
    destructive: '#f07f75',
    destructiveForeground: '#251311',
    border: '#2c3e37',
    input: '#2c3e37',
  },
  radius: 20,
};

export default colors;
