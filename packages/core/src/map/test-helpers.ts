import type { MapElement, MapStyle } from './types';

/** A complete style (the pilot's `carnet` look), for tests that need a valid map. */
export function mapStyle(): MapStyle {
  return {
    styleVersion: 1,
    land: { fill: '#f4e7c9', stroke: '#8b5e3c', width: 0.55 },
    regions: { stroke: '#d6c196', width: 0.15, dash: null },
    neighbours: { fill: '#ece3cf', stroke: '#d6c196', width: 0.2 },
    lakes: { fill: '#bcd4e0', stroke: '#8b5e3c', width: 0.2 },
    outline: { color: '#8b5e3c', width: 0.55, detail: 1 },
    label: {
      font: 'Lora',
      weight: 700,
      italicSights: true,
      sizePt: 9.5,
      color: '#4a2f1a',
      case: 'none',
      letterSpacingEm: 0,
      halo: { color: '#fbf4e2', width: 0.8 },
    },
    markers: {
      capital: { kind: 'point', color: '#8b3a12', stroke: '#fbf4e2', scale: 1.5 },
      city: { kind: 'point', color: '#8b5e3c', stroke: '#fbf4e2', scale: 1 },
      sight: { kind: 'star', color: '#c2410c', stroke: '#fbf4e2', scale: 1 },
      custom: { kind: 'pin', color: '#c2410c', stroke: null, scale: 1 },
    },
    route: {
      voiture: { color: '#e2571e', width: 0.7, dash: [2.2, 1.5] },
      bus: { color: '#e2571e', width: 0.7, dash: [2.2, 1.5] },
      train: { color: '#e2571e', width: 0.7, dash: null },
      avion: { color: '#1f3a5f', width: 0.6, dash: [0.01, 1.7] },
      bateau: { color: '#1f3a5f', width: 0.6, dash: [1, 1] },
      pied: { color: '#e2571e', width: 0.5, dash: [0.5, 1] },
    },
    badge: { fill: '#e2571e', text: '#ffffff', stroke: '#fbf4e2', font: 'Caveat', weight: 700 },
    medallion: { ringColor: '#ffffff', ringWidth: 0.6 },
    sizes: { marker: 3, badge: 5, vehicle: 6 },
    rough: null,
  };
}

/** A valid map element with two places and a one-leg route. */
export function mapElement(): MapElement {
  return {
    id: 'map-1',
    x: 10,
    y: 20,
    w: 150,
    h: 200,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    type: 'map',
    geometryAssetId: 'map-0123456789abcdef',
    subject: {
      id: 'TH',
      regions: [],
      showRegions: true,
      showNeighbours: false,
      showLakes: true,
      includeRemote: false,
    },
    frame: null,
    projection: 'auto',
    style: mapStyle(),
    places: [
      {
        id: 'p1',
        source: { kind: 'city', ref: 'ne:1' },
        lon: 100.5,
        lat: 13.75,
        label: 'Bangkok',
        shown: true,
        labelShown: true,
        marker: null,
        markerSize: null,
        labelOffset: null,
        photo: null,
      },
      {
        id: 'p2',
        source: { kind: 'custom' },
        lon: 98.4,
        lat: 7.9,
        label: 'Phuket',
        shown: true,
        labelShown: true,
        marker: 'pin',
        markerSize: 4,
        labelOffset: { dx: 2, dy: -1 },
        photo: {
          assetId: 'photo-1',
          offset: { dx: 10, dy: -8 },
          diameter: 18,
          crop: { scale: 1.2, cx: 0.5, cy: 0.4 },
        },
      },
    ],
    route: {
      stops: ['p1', 'p2'],
      legs: [{ mode: 'avion', curve: 'courbe', bend: 0.2, icon: true }],
      numbered: true,
    },
    medallions: false,
    background: null,
  };
}
