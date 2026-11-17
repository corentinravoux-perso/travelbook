export * from './types';
export { placeKind } from './place';
export { MAP_LICENCE } from './licence';
export {
  MAP_LEG_MODES,
  MAP_MARKERS,
  MAP_PLACE_KINDS,
  MapElementSchema,
  MapGeometrySchema,
  MapStyleSchema,
} from './schema';
export {
  DEFAULT_MAP_STYLE,
  normalizeStyle,
  styleColours,
  withTemplateColours,
  type MapPreset,
} from './style';
export {
  chooseProjection,
  fitFrame,
  frameZoom,
  projectPlace,
  unprojectPlace,
  type Bounds,
  type MapGeometry,
  type ProjectionParams,
} from './projection';
export { regionAssigner, NEAREST_REGION_KM, type RegionAssigner } from './regions';
export { bakeGeometry, simplifyTopology, type Topology as MapTopology } from './bake';
export { legPath, routeNumbers, routeSegments, type RouteSegment } from './route';
export { placeLabels, type LabelBox, type Obstacle as LabelObstacle } from './labels';
