import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();

console.log('====================================================');
console.log('     SALES INTEL PROJECT CONSISTENCY CHECKER');
console.log('====================================================\n');

let failed = false;

function reportPass(message) {
  console.log(`[PASS] ${message}`);
}

function reportFail(message) {
  console.error(`[FAIL] ${message}`);
  failed = true;
}

// 1. Required Documentation Check
const requiredDocs = [
  'AGENTS.md',
  'docs/CURRENT_ARCHITECTURE.md',
  'docs/CURRENT_FEATURES.md',
  'docs/CURRENT_FLOWS.md',
  'docs/DOCUMENTATION_MAP.md',
  'docs/CONFIGURATION.md',
  'docs/ADMIN.md',
  'docs/EMAIL_VERIFICATION.md',
  'docs/UI_UX_AUDIT.md',
  'docs/TECHNICAL_DEBT.md',
  'docs/DEVELOPMENT_RULES.md',
  'docs/CHANGELOG.md',
];

console.log('--- 1. Checking Documentation Infrastructure ---');
for (const relPath of requiredDocs) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    reportPass(`Found documentation file: ${relPath}`);
  } else {
    reportFail(`Missing required documentation file: ${relPath}`);
  }
}

// 2. Environment Template Consistency Check
console.log('\n--- 2. Checking Environment Variable Templates ---');
const envExamplePath = path.join(rootDir, '.env.example');
if (!fs.existsSync(envExamplePath)) {
  reportFail('.env.example file is missing.');
} else {
  reportPass('.env.example template file is present.');
  const exampleContent = fs.readFileSync(envExamplePath, 'utf8');
  const exampleKeys = exampleContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => line.split('=')[0].trim());

  reportPass(`Found ${exampleKeys.length} configured environment keys in template.`);
}

// 3. Secret Exposure Prevention Check
console.log('\n--- 3. Checking Secret Exposure & Hygiene ---');
const secretPatterns = [
  /sk_live_[0-9a-zA-Z]{24,}/g,
  /ghp_[0-9a-zA-Z]{36}/g,
  /AIzaSy[0-9a-zA-Z-_]{33}/g,
];

let secretExposureCount = 0;
function scanDirectoryForSecrets(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.output' || entry.name === 'scratch') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectoryForSecrets(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.json'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          reportFail(`Potential secret pattern detected in ${path.relative(rootDir, fullPath)}`);
          secretExposureCount++;
        }
      }
    }
  }
}

scanDirectoryForSecrets(rootDir);
if (secretExposureCount === 0) {
  reportPass('No exposed production secrets detected in tracked source code.');
}

// 4. Test Suite Pass Verification
console.log('\n--- 4. Running Test Suite Verification ---');
try {
  const testOutput = execSync('npm test', { encoding: 'utf8' });
  if (testOutput.includes('fail 0') || testOutput.includes('PASS')) {
    reportPass('Test suite executed successfully with 0 failures.');
  } else {
    reportPass('Test suite executed successfully.');
  }
} catch (err) {
  reportFail(`Test suite execution failed: ${err.message}`);
}

console.log('\n====================================================');
if (failed) {
  console.error(' [RESULT] Consistency check FAILED. Please resolve errors above.');
  process.exit(1);
} else {
  console.log(' [RESULT] All project consistency checks PASSED!');
  process.exit(0);
}
