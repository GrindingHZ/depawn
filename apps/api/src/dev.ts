/* The entry point for `pnpm dev`, which is the same thing as a demo: the
   process gets a clock it can move and the route that moves it. Setting the
   flag here rather than in the script keeps it working on every platform
   without a dependency whose only job is to write an environment variable.
   `pnpm start` is untouched and still has no way to move its own clock. */
process.env.DEMO_MODE = 'true';

void import('./main');

export {};
