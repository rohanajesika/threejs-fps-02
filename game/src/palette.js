// The look plan, in one place: dusk over a solar refinery yard. Six values and one
// accent hue; the lighting makes every shade the game needs, so no other colour
// appears in the code. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#221b15', // dusk sky / fog
  surface: '#322a21', // concrete and steel
  hairline: '#463a2c', // crates, pipes, dark steel
  ink: '#ece5d8', // warm off-white
  muted: '#9a8f7d', // dusty tan
  accent: '#f0912f', // ember orange
  team: '#2fd6c0', // Vanguard teal
  enemy: '#ff5a3c', // Ember red-orange
  sky: '#2b2530', // upper sky
};

export function shade(name) {
  return PALETTE[name];
}
