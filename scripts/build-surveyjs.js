/* scripts/build-surveyjs.js */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const rootDir = path.join(__dirname, '..');
const entryPoint = path.join(rootDir, 'src', 'surveyjs-app.js');
const outputFile = path.join(rootDir, 'public', 'js', 'surveyjs-bundle.js');
const cssOutput = path.join(rootDir, 'public', 'css', 'surveyjs.css');

const cssCandidates = [
  path.join(rootDir, 'node_modules', 'survey-core', 'defaultV2.min.css'),
  path.join(rootDir, 'node_modules', 'survey-core', 'modern.min.css'),
];

const copySurveyCss = () => {
  const source = cssCandidates.find((candidate) => fs.existsSync(candidate));
  if (!source) {
    console.warn('SurveyJS CSS not found in node_modules.');
    return;
  }
  const cssText = fs.readFileSync(source, 'utf8');
  const withBanner = `/* public/css/surveyjs.css */\n${cssText}`;
  fs.writeFileSync(cssOutput, withBanner);
};

const build = async () => {
  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    outfile: outputFile,
    banner: {
      js: '/* public/js/surveyjs-bundle.js */',
    },
  });

  copySurveyCss();
};

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
