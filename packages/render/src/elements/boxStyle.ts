import type { ElementBase } from '@travelbook/core';
import type { CSSProperties } from 'react';
import { mm } from '../units';

/** Where an element is on the spread: absolute, in mm, turned about its centre. */
export function elementBoxStyle(el: ElementBase): CSSProperties {
  return {
    position: 'absolute',
    left: mm(el.x),
    top: mm(el.y),
    width: mm(el.w),
    height: mm(el.h),
    transform: `rotate(${el.rotation}deg)`,
    opacity: el.opacity === 1 ? undefined : el.opacity,
  };
}

/** `transform` that mirrors a box about its centre, or undefined when it is not mirrored. */
export function flipTransform(flipH: boolean, flipV: boolean): string | undefined {
  if (flipH && flipV) return 'scale(-1)';
  if (flipH) return 'scaleX(-1)';
  if (flipV) return 'scaleY(-1)';
  return undefined;
}
