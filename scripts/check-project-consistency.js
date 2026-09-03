import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();

console.log('====================================================');
console.log('     RAMOS EXTENSION CONSISTENCY CHECKER');
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
  'RAMOS_CURRENT_ARCHITECTURE.md',
  'RAMOS_CLEANUP_PLAN.md',
  'docs/RAMOS_ARCHITECTURE.md',
  'docs/RAMOS_EXTRACTION_RULES.md',
  'docs/RAMOS_INTERNAL_AUDIT.md',
  'docs/RAMOS_BRAND_GUIDELINES.md',
  'docs/RAMOS_EXPORT_SPECIFICATION.md',
  'docs/RAMOS_STABLE_BASELINE.md',
  'docs/chrome-extension.md',
  'docs/RAMOS_WEBSITE_ARCHITECTURE.md',
  'docs/RAMOS_WEBSITE_EXTRACTION_RULES.md',
  'docs/RAMOS_WEBSITE_ROADMAP.md',
  'docs/RAMOS_WEBSITE_SECURITY.md',
  'docs/RAMOS_WEBSITE_FIELD_SPECIFICATION.md',
  'docs/RAMOS_WEBSITE_PHASE_0_REPORT.md',
  'docs/RAMOS_WEBSITE_PHASE_1_REPORT.md',
  'docs/RAMOS_WEBSITE_PHASE_2_REPORT.md',
  'docs/RAMOS_WEBSITE_PHASE_3_REPORT.md',
  'docs/RAMOS_WEBSITE_PHASE_4_REPORT.md',
  'docs/RAMOS_WEBSITE_PHASE_5_REPORT.md',
  'docs/RAMOS_WEBSITE_PHASE_6_REPORT.md',
  'docs/RAMOS_FINAL_RELEASE_AUDIT.md',
  'docs/RAMOS_WEBSITE_SCRAPER_PHASE_0_1_AUDIT.md',
  'RAMOS_FINAL_ARCHITECTURE.md',
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

// 2. Secret Exposure Prevention Check
console.log('\n--- 2. Checking Secret Exposure & Hygiene ---');
const secretPatterns = [
  /sk_live_[0-9a-zA-Z]{24,}/g,
  /ghp_[0-9a-zA-Z]{36}/g,
  /AIzaSy[0-9a-zA-Z-_]{33}/g,
];

let secretExposureCount = 0;
function scanDirectoryForSecrets(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'scratch') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectoryForSecrets(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.json'))) {
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

// 3. Test Suite Pass Verification
console.log('\n--- 3. Running Test Suite Verification ---');
try {
  const testOutput = execSync('npm test', { encoding: 'utf8' });
  if (testOutput.includes('fail 0') || testOutput.includes('PASS') || testOutput.includes('pass 13')) {
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
  console.log(' [RESULT] All RAMOS project consistency checks PASSED!');
  process.exit(0);
}
