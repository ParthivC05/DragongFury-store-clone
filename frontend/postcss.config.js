export default (ctx) => ({
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
    // Extra CSS compression for production builds (spaces, longhands, etc.).
    // Vite already enables cssMinify; cssnano closes gaps audit tools check for.
    cssnano:
      ctx.env === 'production'
        ? {
            preset: [
              'default',
              {
                discardComments: { removeAll: true },
              },
            ],
          }
        : false,
  },
});
