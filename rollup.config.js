import externals from 'rollup-plugin-node-externals';
import typescript from 'rollup-plugin-typescript2';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        dir: 'dist',
        entryFileNames: '[name].js',
        exports: 'named',
        format: 'cjs',
        sourcemap: true,
        sourcemapExcludeSources: true,
      },
      {
        dir: 'dist',
        entryFileNames: '[name].mjs',
        exports: 'named',
        format: 'esm',
        sourcemap: true,
        sourcemapExcludeSources: true,
      },
    ],
    plugins: [
      externals({ deps: true }),
      typescript({ clean: true }),
    ],
  },
];
