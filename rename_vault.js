const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.css') || file.endsWith('.html')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(path.join(__dirname, 'src'));
let count = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const initial = content;
  content = content.replace(/Vault/g, 'Folder');
  content = content.replace(/vault/g, 'folder');
  if (content !== initial) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated ' + file);
    count++;
  }
});
console.log(`Updated ${count} files.`);
