import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        tsconfigPaths: true,
        alias: {
            'bun:test': 'vitest'
        }
    },
    test: {
        globals: true,
        root: './',
        include: ['**/*.spec.ts']
    }
});
