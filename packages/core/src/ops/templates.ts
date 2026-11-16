import { produce } from 'immer';
import { newElement, newId } from '../factory';
import type {
  Book,
  Element,
  PhotoElement,
  Rect,
  Side,
  Spread,
  TextElement,
  TextRole,
} from '../schema';
import {
  layoutTemplate,
  readingOrder,
  type FreeSlot,
  type LayoutParams,
  type SlotRect,
  type Template,
} from '../template';
import { setBackground } from './backgrounds';
import { clone, copyElements, isPhoto, isText, spreadOf, targetBox } from './util';

type Target = Side | 'spread';

const bleedOf = (book: Book, spread: Spread): number =>
  spread.kind === 'cover' ? book.coverBleed : book.bleed;

/**
 * Elements whose centre is inside the target box. A page box excludes the cover's spine zone,
 * so spine text and stickers never count as part of the front or the back. Pages abut at x:
 * a centre exactly on the spine line of an inner spread is on the right page.
 */
function elementsOnTarget(spread: Spread, box: Rect): Element[] {
  return spread.elements.filter((el) => {
    const cx = el.x + el.w / 2;
    const cy = el.y + el.h / 2;
    return cx >= box.x && cx < box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  });
}

/**
 * Bleed exists only at the trim: a full-bleed grid on one page must not run past the spine
 * edge, so the slots are cut at it.
 */
function clipAtSpine(slots: SlotRect[], box: Rect, target: Target, t: Template): SlotRect[] {
  if (target === 'spread' || !t.grid?.fullBleed) return slots;
  return slots.map((s) => {
    if (target === 'left') {
      const over = s.x + s.w - (box.x + box.w);
      return over > 0 ? { ...s, w: s.w - over } : s;
    }
    const over = box.x - s.x;
    return over > 0 ? { ...s, x: box.x, w: s.w - over } : s;
  });
}

function photoFor(slot: SlotRect, source: PhotoElement | undefined): PhotoElement {
  const el = newElement('photo', { x: slot.x, y: slot.y, w: slot.w, h: slot.h });
  el.rotation = slot.rotation;
  if (slot.mask) el.mask = { ...slot.mask };
  if (source) {
    el.assetId = source.assetId;
    el.adjust = clone(source.adjust);
    el.border = clone(source.border);
    el.shadow = clone(source.shadow);
    el.flipH = source.flipH;
    el.flipV = source.flipV;
  }
  return el;
}

/**
 * How an empty text frame looks until the user types in it: a title is big and centred, a caption
 * small and centred, a body text is set like a paragraph. A frame without a role keeps the
 * defaults of a new text element.
 */
const ROLE_LOOK: Record<TextRole, { fontSizePt: number; align: TextElement['align'] }> = {
  title: { fontSizePt: 28, align: 'center' },
  caption: { fontSizePt: 10, align: 'center' },
  body: { fontSizePt: 11, align: 'left' },
};

function textFor(slot: SlotRect, source: TextElement | undefined): TextElement {
  const el = newElement('text', { x: slot.x, y: slot.y, w: slot.w, h: slot.h });
  el.rotation = slot.rotation;
  if (slot.textRole) {
    el.textRole = slot.textRole;
    if (!source) {
      el.style.fontSizePt = ROLE_LOOK[slot.textRole].fontSizePt;
      el.align = ROLE_LOOK[slot.textRole].align;
    }
  }
  if (source) {
    el.doc = clone(source.doc);
    el.style = clone(source.style);
    el.align = source.align;
    el.vAlign = source.vAlign;
    el.box = clone(source.box);
    el.outline = clone(source.outline);
    el.shadow = clone(source.shadow);
  }
  return el;
}

/**
 * Lay a template out on a page or on the whole spread (§7.4).
 *
 * The photos of the target are reassigned, in reading order, to the template's photo slots
 * (new elements; the photo keeps its adjust, border, shadow and flips, the crop is reset).
 * Empty photo frames are dropped: they were slots of the old layout. Photos in excess stay as
 * they were, on top of everything. The text of an existing text element moves into a text slot
 * of the same role, when there is one. Other elements are untouched. The new elements take
 * the place in the stack of the first element they replace, so stickers and text lying over a
 * photo stay over it. A free template's decorations are added just before them. A template that
 * has a `background` sets it on the target (the page, or the spread's own); the other side keeps
 * its background, and a template without one leaves the background as it is.
 */
export function applyTemplate(
  book: Book,
  spreadId: string,
  target: Target,
  t: Template,
  p: LayoutParams,
): Book {
  const spread = spreadOf(book, spreadId);
  const box = targetBox(book, spread, target);
  const slots = clipAtSpine(layoutTemplate(t, box, bleedOf(book, spread), p), box, target, t);

  const onTarget = elementsOnTarget(spread, box);
  const photos = readingOrder(onTarget.filter(isPhoto));
  const filled = photos.filter((el) => el.assetId !== null);
  const photoSlotCount = slots.filter((s) => s.kind === 'photo').length;
  const excess = new Set<Element>(filled.slice(photoSlotCount));
  const queue = filled.slice(0, photoSlotCount);

  const texts = readingOrder(onTarget.filter(isText));
  const moved = new Set<Element>();
  const created: Element[] = slots.map((slot) => {
    if (slot.kind === 'photo') return photoFor(slot, queue.shift());
    const source = texts.find((el) => !moved.has(el) && el.textRole === slot.textRole);
    if (source) moved.add(source);
    return textFor(slot, source);
  });

  // Copies with new ids; their coordinates are still the template's 0..1 units.
  const decorations = copyElements(t.free?.decorations ?? [], 0, 0);
  for (const d of decorations) {
    d.x = box.x + d.x * box.w;
    d.y = box.y + d.y * box.h;
    d.w *= box.w;
    d.h *= box.h;
  }

  const replaced = new Set<Element>([...photos.filter((el) => !excess.has(el)), ...moved]);
  const head: Element[] = [];
  const tail: Element[] = [];
  let pastFirstReplaced = false;
  for (const el of spread.elements) {
    if (excess.has(el)) continue;
    if (replaced.has(el)) pastFirstReplaced = true;
    else (pastFirstReplaced ? tail : head).push(el);
  }
  const onTop = spread.elements.filter((el) => excess.has(el));
  const elements = [...head, ...decorations, ...created, ...tail, ...onTop];

  const laidOut = produce(book, (draft) => {
    spreadOf(draft, spreadId).elements = elements;
  });
  return t.background ? setBackground(laidOut, spreadId, target, t.background) : laidOut;
}

/**
 * Describe a page or a whole spread as a free template for the user's library: photo and text
 * frames become slots, stickers and shapes become decorations, all in 0..1 units of the target
 * box. Text content, photos and maps are not kept.
 */
export function captureTemplate(
  book: Book,
  spreadId: string,
  target: Target,
  name: string,
): Template {
  const spread = spreadOf(book, spreadId);
  const box = targetBox(book, spread, target);
  const unit = (el: Element): Rect => ({
    x: (el.x - box.x) / box.w,
    y: (el.y - box.y) / box.h,
    w: el.w / box.w,
    h: el.h / box.h,
  });
  const slots: FreeSlot[] = [];
  const decorations: Element[] = [];
  for (const el of elementsOnTarget(spread, box)) {
    if (el.type === 'photo') {
      slots.push({ kind: 'photo', ...unit(el), rotation: el.rotation, mask: { ...el.mask } });
    } else if (el.type === 'text') {
      slots.push({
        kind: 'text',
        ...unit(el),
        rotation: el.rotation,
        ...(el.textRole ? { textRole: el.textRole } : {}),
      });
    } else if (el.type !== 'map') {
      // A map is left out: its baked geometry is an asset of this album, which a template cannot carry.
      const deco = clone(el);
      Object.assign(deco, unit(el));
      delete deco.groupId;
      decorations.push(deco);
    }
  }
  const photoCount = slots.filter((s) => s.kind === 'photo').length;
  return {
    id: `user-${newId()}`,
    name,
    category: photoCount === 0 && slots.length > 0 ? 'texte' : 'photos',
    scope: target === 'spread' ? 'spread' : 'page',
    photoCount,
    origin: 'user',
    free: { slots, decorations },
  };
}
