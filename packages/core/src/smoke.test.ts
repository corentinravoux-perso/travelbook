import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index';

describe('@travelbook/core', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@travelbook/core');
  });
});
