/** What the settings sheet shows. React owns this; the UI thread gets a
 *  translated copy (see state.ts LightSettings). */
export interface SheetSettings {
  /** Off shows the painting exactly as it was scanned, with no relighting. */
  relight: boolean;
  /** Shows the baked depth field instead of the painting. */
  showDepth: boolean;
  /** Off leaves only the light on the painting — no bulb, no cord. */
  showBulb: boolean;
  showCord: boolean;
  intensity: number;
}

export const defaultSheetSettings = (): SheetSettings => ({
  relight: true,
  showDepth: false,
  showBulb: true,
  showCord: true,
  intensity: 4.05,
});
