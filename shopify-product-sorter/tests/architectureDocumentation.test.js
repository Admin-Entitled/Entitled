import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs', 'architecture');

const CANONICAL_DOCS = [
  'CANONICAL_APPLICATION_ARCHITECTURE.md',
  'CANONICAL_DATA_CONTRACTS_AND_SCHEMAS.md',
  'CANONICAL_API_AND_MESSAGE_CONTRACTS.md',
  'CANONICAL_ENVIRONMENT_CONFIGURATION.md',
  'CANONICAL_OPERATIONAL_RUNBOOKS.md',
  'CANONICAL_PROVIDER_INTEGRATION_CONTRACTS.md',
  'CANONICAL_TESTING_AND_VALIDATION_STRATEGY.md',
  'CANONICAL_SECURITY_ARCHITECTURE.md',
  'CANONICAL_DEPLOYMENT_TOPOLOGY.md',
  'CANONICAL_CODE_OWNERSHIP_AND_ORGANIZATION.md',
  'README.md'
];

test('Architecture Documentation Suite - All Canonical Artifacts Exist', () => {
  for (const docFile of CANONICAL_DOCS) {
    const fullPath = path.join(DOCS_DIR, docFile);
    assert.equal(fs.existsSync(fullPath), true, `Canonical document missing: ${docFile}`);
  }
});

test('Architecture Documentation Suite - Index Links All Canonical Artifacts', () => {
  const indexContent = fs.readFileSync(path.join(DOCS_DIR, 'README.md'), 'utf-8');
  for (const docFile of CANONICAL_DOCS) {
    if (docFile === 'README.md') continue;
    assert.equal(indexContent.includes(docFile), true, `Architecture index README.md does not link to ${docFile}`);
  }
});

test('Architecture Documentation Suite - Referenced Routes & Environment Variables Exist', () => {
  const envContent = fs.readFileSync(path.join(DOCS_DIR, 'CANONICAL_ENVIRONMENT_CONFIGURATION.md'), 'utf-8');
  const envVars = ['NODE_ENV', 'PORT', 'SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN', 'ORDER_MAPPING_DATABASE_URL'];
  for (const envVar of envVars) {
    assert.equal(envContent.includes(envVar), true, `Env doc missing variable ${envVar}`);
  }

  const apiContent = fs.readFileSync(path.join(DOCS_DIR, 'CANONICAL_API_AND_MESSAGE_CONTRACTS.md'), 'utf-8');
  const errorCodes = ['SHOPIFY_UNAVAILABLE', 'ORDER_MAPPING_UNAVAILABLE', 'GENERATED_ORDER_STALE', 'INVALID_ORDER_IDS'];
  for (const errCode of errorCodes) {
    assert.equal(apiContent.includes(errCode), true, `API doc missing error code ${errCode}`);
  }
});

test('Architecture Documentation Suite - Legacy Delivery Resolution Not Represented as Current Service', () => {
  for (const docFile of CANONICAL_DOCS) {
    const content = fs.readFileSync(path.join(DOCS_DIR, docFile), 'utf-8');
    assert.equal(content.includes('Delivery Resolution Service'), false, `Doc ${docFile} represents legacy Delivery Resolution as active service`);
  }
});
