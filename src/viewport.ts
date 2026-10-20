export interface Point {
  x: number;
  y: number;
}
export interface Viewport extends Point {
  scale: number;
}
export interface PinchGesture {
  view: Viewport;
  center: Point;
  distance: number;
}
export const MIN_SCALE = 0.08;
export const MAX_SCALE = 1.8;
export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function midpoint(a: Point, b: Point): Point {
  return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
}
export function pinchViewport(gesture: PinchGesture, center: Point, distance: number): Viewport {
  const scale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, (gesture.view.scale * distance) / Math.max(1, gesture.distance)),
  );
  const anchor = {
    x: (gesture.center.x - gesture.view.x) / gesture.view.scale,
    y: (gesture.center.y - gesture.view.y) / gesture.view.scale,
  };
  return {scale, x: center.x - anchor.x * scale, y: center.y - anchor.y * scale};
}
