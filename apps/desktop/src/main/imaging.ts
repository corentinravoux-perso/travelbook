import sharp from 'sharp';

/**
 * sharp for the main process, with libvips' operation cache off. The cache keeps up to 20 image
 * files open; Windows cannot delete or replace an open file, so an original read once (EXIF,
 * proxies) could no longer be restored, replaced or removed with its album. Every module of the
 * main process imports sharp from here (`imaging.test.ts` checks it).
 */
sharp.cache(false);

export default sharp;
export type * from 'sharp';
