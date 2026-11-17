/// <reference lib="webworker" />
import { bakeGeometry } from '@travelbook/core';
import type { BakeReply, BakeRequest } from './bakeClient';
import type { MapTopology } from '@travelbook/core';

/** The inputs the client sent last: it sends a big file once and then only refers to it. */
const held: { base: MapTopology | null; pack: MapTopology | null; world: MapTopology | null } = {
  base: null,
  pack: null,
  world: null,
};

self.onmessage = (event: MessageEvent<BakeRequest>) => {
  const m = event.data;
  if ('base' in m) held.base = m.base ?? null;
  if ('pack' in m) held.pack = m.pack ?? null;
  if ('world' in m) held.world = m.world ?? null;
  let reply: BakeReply;
  try {
    if (!held.base) throw new Error('No base file');
    const geometry = bakeGeometry(
      held.base,
      held.pack,
      m.subject,
      m.projection,
      m.rough,
      m.detail,
      held.world,
    );
    reply = { id: m.id, ok: true, geometry };
  } catch (error) {
    reply = { id: m.id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
};
