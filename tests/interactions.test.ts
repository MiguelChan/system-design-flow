import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Playground} from '../src/playground.ts';
import {SCENARIOS} from '../src/presets.ts';
import {shouldDeleteSelection} from '../src/keyboard.ts';
import type {DeleteShortcut} from '../src/keyboard.ts';
import {distanceBetween, midpoint, pinchViewport, MAX_SCALE, MIN_SCALE} from '../src/viewport.ts';

const DELETE: DeleteShortcut = {
  key: 'Delete',
  repeat: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  defaultPrevented: false,
};
void test('Delete and Backspace work outside the canvas but never override text editing or a guide', () => {
  assert.equal(shouldDeleteSelection(DELETE, false, false), true);
  assert.equal(shouldDeleteSelection({...DELETE, key: 'Backspace'}, false, false), true);
  assert.equal(shouldDeleteSelection(DELETE, true, false), false);
  assert.equal(shouldDeleteSelection(DELETE, false, true), false);
  assert.equal(shouldDeleteSelection({...DELETE, key: 'Enter'}, false, false), false);
  for (const flag of [
    'repeat',
    'altKey',
    'ctrlKey',
    'metaKey',
    'shiftKey',
    'isComposing',
    'defaultPrevented',
  ] as const)
    assert.equal(shouldDeleteSelection({...DELETE, [flag]: true}, false, false), false, flag);
});
void test('deleting a selected node removes its connected edges and resets only simulation state', () => {
  const store = new Playground(SCENARIOS[0].design);
  store.updateSetting('db', 'readReplicas', 3);
  store.step();
  store.selectNode('worker');
  store.deleteSelection();
  assert.equal(store.design.nodes.length, SCENARIOS[0].design.nodes.length - 1);
  assert.equal(
    store.design.edges.some((edge) => edge.from === 'worker' || edge.to === 'worker'),
    false,
  );
  assert.equal(store.design.nodes.find((node) => node.id === 'db')?.config.readReplicas, 3);
  assert.equal(store.simulation.time, 0);
  assert.equal(store.selected, null);
  assert.equal(store.running, false);
});
void test('deleting an edge preserves all components; no selection is a no-op', () => {
  const store = new Playground(SCENARIOS[0].design);
  store.selected = null;
  store.selectedEdge = store.design.edges[0].id;
  store.deleteSelection();
  assert.equal(store.design.nodes.length, SCENARIOS[0].design.nodes.length);
  assert.equal(store.design.edges.length, SCENARIOS[0].design.edges.length - 1);
  const simulation = store.simulation;
  store.deleteSelection();
  assert.equal(store.simulation, simulation);
  store.selectNode('source');
  store.clearSelection();
  store.deleteSelection();
  assert.equal(store.design.nodes.length, SCENARIOS[0].design.nodes.length);
});
void test('pinch zoom preserves the world point under the moving finger midpoint', () => {
  const gesture = {view: {x: 20, y: 30, scale: 0.5}, center: {x: 100, y: 100}, distance: 100};
  const center = {x: 120, y: 140};
  const result = pinchViewport(gesture, center, 200);
  assert.equal(result.scale, 1);
  assert.equal(
    (center.x - result.x) / result.scale,
    (gesture.center.x - gesture.view.x) / gesture.view.scale,
  );
  assert.equal(
    (center.y - result.y) / result.scale,
    (gesture.center.y - gesture.view.y) / gesture.view.scale,
  );
});
void test('pinch extremes are bounded and geometry remains finite', () => {
  const gesture = {view: {x: 0, y: 0, scale: 1}, center: {x: 100, y: 100}, distance: 0};
  assert.equal(pinchViewport(gesture, gesture.center, 10000).scale, MAX_SCALE);
  assert.equal(pinchViewport(gesture, gesture.center, 0).scale, MIN_SCALE);
  assert.equal(distanceBetween({x: 0, y: 0}, {x: 3, y: 4}), 5);
  assert.deepEqual(midpoint({x: 2, y: 4}, {x: 8, y: 10}), {x: 5, y: 7});
});
