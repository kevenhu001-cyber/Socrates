import assert from 'node:assert/strict';
import test from 'node:test';
import { createParser } from '@openuidev/react-lang';
import { library } from '../src/react/intelligence-ui/openui/library.ts';
import { coordinate, boundsOf, lngLat } from '../src/react/intelligence-ui/openui/map/geometry.ts';
import { localImageUrl } from '../src/react/intelligence-ui/openui/remoteData.ts';

const PROGRAM = `root = Col([map, image, Text("Selected: " + $place)])
$place = ""
map = Map([MapMarker("Eiffel Tower", null, null, "Landmarks", null, "Eiffel Tower Paris France"), MapMarker("Louvre", 48.8606, 2.3376, "Museums")], true, $place)
image = SearchImage("Eiffel Tower Paris", 1.5, "lg", "cover")`;

test('map, named markers and SearchImage use the real OpenUI dialect', () => {
  const result = createParser(library.toJSONSchema(), 'Col').parse(PROGRAM);
  assert.deepEqual(result.meta.errors, []);
  assert.equal(result.stateDeclarations.$place, '');
  assert.equal(library.toSpec().components.MapMarker.signature.includes('place?: string'), true);
});
test('coordinate math preserves latitude/longitude order and rejects invalid values', () => {
  assert.deepEqual(coordinate(48.8584, 2.2945), [48.8584,2.2945]);
  assert.deepEqual(lngLat([48.8584,2.2945]), [2.2945,48.8584]);
  assert.deepEqual(boundsOf([[48.8584,2.2945],[48.8606,2.3376]]), [[2.2945,48.8584],[2.3376,48.8606]]);
  for (const pair of [[NaN,0],[91,0],[0,181],['48',2],[Infinity,0]]) assert.equal(coordinate(...pair), null);
});
test('search images can only load through the local media endpoint', () => {
  const local = '/api/v2/intelligent-ui/image?url=encoded-provider-image';
  assert.equal(localImageUrl(local), local);
  for (const value of ['https://outside.test/a.png','//outside.test/a.png','/api/v2/intelligent-ui/image/../../private?q=x','javascript:alert(1)']) assert.equal(localImageUrl(value), null);
});
