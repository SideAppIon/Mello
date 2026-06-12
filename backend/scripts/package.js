const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Packaging for Yandex Cloud Functions...');

// Копируем node_modules и dist в папку function/
const funcDir = path.join(__dirname, '..', 'function');
if (fs.existsSync(funcDir)) {
  fs.rmSync(funcDir, { recursive: true });
}
fs.mkdirSync(funcDir);

// Копируем собранный код
execSync(`cp -r ${path.join(__dirname, '..', 'dist')} ${path.join(funcDir, 'dist')}`);

// Копируем package.json и устанавливаем только prod-зависимости
fs.copyFileSync(
  path.join(__dirname, '..', 'package.json'),
  path.join(funcDir, 'package.json')
);
execSync('npm install --omit=dev', { cwd: funcDir, stdio: 'inherit' });

// Создаём index.js — точка входа для Cloud Functions
fs.writeFileSync(path.join(funcDir, 'index.js'), `
const { handler } = require('./dist/handler');
module.exports = { handler };
`);

// Упаковываем в zip
execSync(`cd ${funcDir} && zip -r ../mello-function.zip .`, { stdio: 'inherit' });

console.log('Done! File: backend/mello-function.zip');
console.log('Upload this zip to Yandex Cloud Functions.');
