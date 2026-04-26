const { parseActivityPreview } = require('./packages/core/dist/app@core/activity-diagrams/parser/preview-parser.js');

const source = `() => {
  switch (route) {
    case 'dashboard':
      return <A />;
    case 'settings':
      return <B />;
    default:
      return <C />;
  }
}`;

try {
  const result = parseActivityPreview(source);
  console.log('Full Result Structure:', JSON.stringify(result, null, 2));
} catch (e) {
  console.error(e);
}
