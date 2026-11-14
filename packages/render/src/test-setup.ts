import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only unmounts by itself when Vitest runs with `globals: true`.
afterEach(cleanup);
