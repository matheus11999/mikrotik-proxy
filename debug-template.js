const path = require('path');
const fs = require('fs');

// Simulate the TemplatesService path resolution
const templatesPath = path.join(__dirname, 'templates');
console.log('Templates path:', templatesPath);

// Check if path exists
console.log('Path exists:', fs.existsSync(templatesPath));

// Check individual template paths
const template1Path = path.join(templatesPath, 'template1');
const template2Path = path.join(templatesPath, 'template2');

console.log('Template1 path:', template1Path);
console.log('Template1 exists:', fs.existsSync(template1Path));

console.log('Template2 path:', template2Path);
console.log('Template2 exists:', fs.existsSync(template2Path));

// List contents if they exist
if (fs.existsSync(templatesPath)) {
  console.log('Templates directory contents:', fs.readdirSync(templatesPath));
}

// Test the exact same logic as TemplatesService
const templatesService = require('./services/templatesService');
console.log('Template1 config from service:', templatesService.getTemplateConfig('template1') ? 'EXISTS' : 'NOT_FOUND');
console.log('Template2 config from service:', templatesService.getTemplateConfig('template2') ? 'EXISTS' : 'NOT_FOUND');

// Test getTemplateFiles method
try {
  const template1Files = templatesService.getTemplateFiles('template1');
  console.log('Template1 files count:', template1Files.length);
} catch (error) {
  console.error('Error getting template1 files:', error.message);
}

try {
  const template2Files = templatesService.getTemplateFiles('template2');
  console.log('Template2 files count:', template2Files.length);
} catch (error) {
  console.error('Error getting template2 files:', error.message);
}