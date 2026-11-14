export const PACKAGE_NAME = '@travelbook/core';
export * from './schema';
export { newBook, newSpread, newElement, pageCount, setIdSource } from './factory';
export { migrate, BookFormatError } from './migrate';
