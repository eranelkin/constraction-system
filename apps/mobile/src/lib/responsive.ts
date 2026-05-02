import { Dimensions } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

// Base design dimensions (iPhone 14 / 12 — 390 × 844 points)
const BASE_W = 390;
const BASE_H = 844;

/** Proportional scale — follows screen width 1:1. Use for avatar sizes, button sizes. */
export const s = (n: number): number => Math.round((W / BASE_W) * n);

/** Vertical scale — follows screen height. Use for vertical spacing / min-heights. */
export const vs = (n: number): number => Math.round((H / BASE_H) * n);

/**
 * Moderate scale — scales less aggressively than s().
 * factor 0 = no scaling, factor 1 = full proportional scaling.
 * Default 0.5 is good for font sizes and padding.
 */
export const ms = (n: number, factor = 0.5): number =>
  Math.round(n + (s(n) - n) * factor);

export const SCREEN_W = W;
export const SCREEN_H = H;
