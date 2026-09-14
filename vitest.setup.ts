import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals are off, so Testing Library cannot register its own
// auto-cleanup; without this, rendered DOM accumulates across tests in a file.
afterEach(cleanup);
