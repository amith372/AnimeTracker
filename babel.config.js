// Standard Expo babel setup, plus a plugin that lets Drizzle's migration files
// `import` raw .sql text directly (used in src/db/migrations).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
