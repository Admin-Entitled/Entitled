import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockAxios = axios as unknown as jest.Mock;

// Mock Playwright
jest.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: jest.fn().mockResolvedValue({
      pages: () => [],
      newPage: () => ({
        goto: jest.fn(),
        waitForTimeout: jest.fn(),
        url: jest.fn().mockReturnValue('https://app.shiprocket.in/seller/products/channel'),
        locator: jest.fn().mockReturnValue({
          count: jest.fn().mockResolvedValue(1),
          first: jest.fn().mockReturnValue({
            click: jest.fn(),
            waitFor: jest.fn(),
            innerText: jest.fn().mockResolvedValue('success')
          }),
          selectOption: jest.fn(),
          isVisible: jest.fn().mockResolvedValue(false)
        })
      }),
      close: jest.fn()
    })
  }
}));

import { loadConfig } from '../src/config';
import { ShopifyClient } from '../src/shopify-client';
import { ShiprocketAuth } from '../src/shiprocket-auth';
import { ShiprocketClient } from '../src/shiprocket-client';
import { CsvTransformer } from '../src/csv-transformer';
import { Verifier } from '../src/verifier';

describe('Shopify-Shiprocket Dimension Sync Test Suite', () => {
  let tempCsvPath: string;
  const sampleHeaders = 'Channel,Product Name,SKU Code,Length,Breadth,Height,Weight,Inventory';
  const sampleRow1 = 'Shopify,Cool T-Shirt,TSHIRT-S-BLUE,10.0,10.0,10.0,1.2,100';
  const sampleRow2 = 'Shopify,Cool Jeans,JEANS-32-BLUE,28.0,24.0,4.0,0.50,50'; // already correct under universal (28x24x4, 0.5)

  beforeAll(() => {
    tempCsvPath = path.resolve(__dirname, 'temp-channel-products.csv');
    const content = `${sampleHeaders}\n${sampleRow1}\n${sampleRow2}`;
    fs.writeFileSync(tempCsvPath, content, 'utf8');
  });

  afterAll(() => {
    if (fs.existsSync(tempCsvPath)) {
      fs.unlinkSync(tempCsvPath);
    }
    const tokenCachePath = path.resolve(__dirname, '../.cache/shiprocket-token.json');
    if (fs.existsSync(tokenCachePath)) {
      try { fs.unlinkSync(tokenCachePath); } catch {}
    }
  });

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.SHOPIFY_STORE_DOMAIN = 'mystore.myshopify.com';
    process.env.SHOPIFY_CLIENT_ID = 'test_client_id';
    process.env.SHOPIFY_CLIENT_SECRET = 'test_client_secret';
    process.env.SHOPIFY_API_VERSION = '2026-04';
    process.env.SHIPROCKET_API_EMAIL = 'test@example.com';
    process.env.SHIPROCKET_API_PASSWORD = 'password123';
    process.env.UNIVERSAL_LENGTH_CM = '28';
    process.env.UNIVERSAL_BREADTH_CM = '24';
    process.env.UNIVERSAL_HEIGHT_CM = '4';
    process.env.UNIVERSAL_WEIGHT_KG = '0.5';

    // Mock generic auth login by default
    const fakeExp = Math.floor((Date.now() + 10 * 24 * 60 * 60 * 1000) / 1000);
    const fakePayload = Buffer.from(JSON.stringify({ exp: fakeExp })).toString('base64');
    const defaultToken = `header.${fakePayload}.signature`;

    // Pre-populate Shopify token cache to bypass oauth post calls during GQL tests
    const cachePath = path.resolve(__dirname, '../.cache/shopify-token.json');
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tokenCache = {
      accessToken: 'mock_access_token',
      expiresAt: Date.now() + 1000 * 60 * 60, // 1 hour in future
      scopes: 'read_products'
    };
    fs.writeFileSync(cachePath, JSON.stringify(tokenCache, null, 2), { mode: 0o600, encoding: 'utf8' });

    mockAxios.mockResolvedValue({
      status: 200,
      data: { data: [] }
    });

    (axios.post as jest.Mock).mockImplementation((url: string, data?: any) => {
      if (url.includes('oauth/access_token')) {
        return Promise.resolve({
          status: 200,
          data: {
            access_token: 'mock_access_token',
            scope: 'read_products',
            expires_in: 86399
          }
        });
      }
      if (url.includes('graphql.json')) {
        return Promise.resolve({
          status: 200,
          data: {
            data: {
              products: {
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: []
              }
            }
          }
        });
      }
      if (url.includes('auth/login')) {
        return Promise.resolve({
          status: 200,
          data: { token: defaultToken }
        });
      }
      return Promise.reject(new Error(`Unhandled mock post url: ${url}`));
    });
  });

  // 1. Shopify Pagination Tests
  describe('Shopify GQL Pagination', () => {
    it('should paginate and combine all active Shopify variants', async () => {
      const config = loadConfig().shopify;
      const client = new ShopifyClient(config);

      // Mock GQL paginated responses (2 pages)
      (axios.post as jest.Mock)
        // Page 1
        .mockResolvedValueOnce({
          data: {
            data: {
              products: {
                pageInfo: { hasNextPage: true, endCursor: 'cursor-p1' },
                edges: [
                  {
                    node: {
                      id: 'p1',
                      title: 'Shirt',
                      status: 'ACTIVE',
                      variants: {
                        edges: [{ node: { id: 'v1', title: 'S', sku: 'SHIRT-S' } }]
                      }
                    }
                  }
                ]
              }
            }
          }
        })
        // Page 2
        .mockResolvedValueOnce({
          data: {
            data: {
              products: {
                pageInfo: { hasNextPage: false, endCursor: null },
                edges: [
                  {
                    node: {
                      id: 'p2',
                      title: 'Jeans',
                      status: 'ACTIVE',
                      variants: {
                        edges: [{ node: { id: 'v2', title: '32', sku: 'JEANS-32' } }]
                      }
                    }
                  }
                ]
              }
            }
          }
        });

      const variants = await client.fetchActiveVariants();
      expect(variants.length).toBe(2);
      expect(variants[0].sku).toBe('SHIRT-S');
      expect(variants[1].sku).toBe('JEANS-32');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('should ignore drafts and archived products by default', async () => {
      const config = loadConfig().shopify;
      const client = new ShopifyClient(config);

      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: {
          data: {
            products: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: [
                {
                  node: {
                    id: 'p1',
                    title: 'Active Shirt',
                    status: 'ACTIVE',
                    variants: { edges: [{ node: { id: 'v1', title: 'S', sku: 'SHIRT-S' } }] }
                  }
                },
                {
                  node: {
                    id: 'p2',
                    title: 'Draft Pants',
                    status: 'DRAFT',
                    variants: { edges: [{ node: { id: 'v2', title: 'M', sku: 'PANTS-M' } }] }
                  }
                },
                {
                  node: {
                    id: 'p3',
                    title: 'Archived Shoes',
                    status: 'ARCHIVED',
                    variants: { edges: [{ node: { id: 'v3', title: '10', sku: 'SHOES-10' } }] }
                  }
                }
              ]
            }
          }
        }
      });

      const variants = await client.fetchActiveVariants();
      expect(variants.length).toBe(1);
      expect(variants[0].sku).toBe('SHIRT-S');
    });
  });

  // 2. SKU Validation Tests (Blank and Duplicates)
  describe('Shopify SKU Validation', () => {
    it('should reject duplicate SKUs and abort', async () => {
      const config = loadConfig().shopify;
      const client = new ShopifyClient(config);

      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: {
          data: {
            products: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: [
                {
                  node: {
                    id: 'p1',
                    title: 'Shirt',
                    status: 'ACTIVE',
                    variants: { edges: [{ node: { id: 'v1', title: 'S', sku: 'SHIRT-S' } }] }
                  }
                },
                {
                  node: {
                    id: 'p2',
                    title: 'Copycat Shirt',
                    status: 'ACTIVE',
                    variants: { edges: [{ node: { id: 'v2', title: 'S', sku: 'SHIRT-S' } }] } // Duplicate!
                  }
                }
              ]
            }
          }
        }
      });

      await expect(client.fetchActiveVariants()).rejects.toThrow(/Duplicate Shopify SKUs detected/);
    });

    it('should skip blank SKUs with a warning but not abort', async () => {
      const config = loadConfig().shopify;
      const client = new ShopifyClient(config);

      (axios.post as jest.Mock).mockResolvedValueOnce({
        data: {
          data: {
            products: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: [
                {
                  node: {
                    id: 'p1',
                    title: 'Valid Shirt',
                    status: 'ACTIVE',
                    variants: { edges: [{ node: { id: 'v1', title: 'S', sku: 'SHIRT-S' } }] }
                  }
                },
                {
                  node: {
                    id: 'p2',
                    title: 'Blank Shirt',
                    status: 'ACTIVE',
                    variants: { edges: [{ node: { id: 'v2', title: 'M', sku: '' } }] } // Blank!
                  }
                }
              ]
            }
          }
        }
      });

      const variants = await client.fetchActiveVariants();
      expect(variants.length).toBe(1);
      expect(variants[0].sku).toBe('SHIRT-S');
    });
  });

  // 3. Shiprocket Token Cache and Refresh
  describe('Shiprocket Authentication & Client', () => {
    it('should request token and verify expiry, and clear on 401 retry', async () => {
      const config = loadConfig().shiprocket;
      const auth = new ShiprocketAuth(config);
      auth.clearCache();

      const fakeExp = Math.floor((Date.now() + 10 * 24 * 60 * 60 * 1000) / 1000);
      const fakePayload = Buffer.from(JSON.stringify({ exp: fakeExp })).toString('base64');
      const fakeToken = `header.${fakePayload}.signature`;

      (axios.post as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: { token: fakeToken }
      });

      const token = await auth.getToken();
      expect(token).toBe(fakeToken);

      // Verify cached token is used next time (call count remains 1)
      const token2 = await auth.getToken();
      expect(token2).toBe(fakeToken);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('should retry Shiprocket request once on 401 response', async () => {
      const config = loadConfig().shiprocket;
      const client = new ShiprocketClient(config);

      const fakePayload = Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + 10000 })).toString('base64');
      const token = `header.${fakePayload}.signature`;

      // 1. axios call returns 401
      // 2. axios.post returns successful login
      // 3. axios retry succeeds
      mockAxios.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'Unauthorized' } }
      });

      (axios.post as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: { token }
      });

      mockAxios.mockResolvedValueOnce({
        status: 200,
        data: { data: [{ id: 500, sku: 'TEST-SKU' }] }
      });

      const res = await client.get('/v1/external/products');
      expect(res.status).toBe(200);
      expect(mockAxios).toHaveBeenCalledTimes(2);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });
  });

  // 4. CSV Header Detection & Alias mapping
  describe('CSV Header Mapping', () => {
    it('should map headers using aliases case-insensitively', () => {
      const transformer = new CsvTransformer();
      const headers = ['channel sku', 'Weight KG', 'Length_cm', 'Width', 'HEIGHT cm'];
      const mapping = transformer.detectColumns(headers);

      expect(mapping.skuIndex).toBe(0);
      expect(mapping.weightIndex).toBe(1);
      expect(mapping.lengthIndex).toBe(2);
      expect(mapping.breadthIndex).toBe(3); // Width mapped to breadth
      expect(mapping.heightIndex).toBe(4);
    });

    it('should throw if critical columns are missing', () => {
      const transformer = new CsvTransformer();
      const headers = ['SKU', 'Weight', 'Length', 'Breadth']; // Missing Height!
      
      expect(() => transformer.detectColumns(headers)).toThrow(/Missing columns: Height/);
    });
  });

  // 5. Dimension Replacement, Unrelated Values Preservation, and Idempotency
  describe('CSV Transformer Logic', () => {
    it('should update only dimension values, preserve unrelated columns, and backup original file', () => {
      const transformer = new CsvTransformer();
      const shopifySkus = new Set(['TSHIRT-S-BLUE', 'JEANS-32-BLUE']);
      const universal = { lengthCm: 28, breadthCm: 24, heightCm: 4, weightKg: 0.5 };

      const result = transformer.transform(tempCsvPath, shopifySkus, universal);

      // Check results metrics
      expect(result.totalRows).toBe(2);
      expect(result.updatedRows).toBe(1); // TSHIRT-S-BLUE updated
      expect(result.skippedRows).toBe(1); // JEANS-32-BLUE already correct, skipped

      // Validate outputs
      const outContent = fs.readFileSync(result.outputPath, 'utf8');
      const lines = outContent.split('\n');
      expect(lines.length).toBe(3); // Header + 2 data lines

      const cells1 = transformer.parseCsvLine(lines[1]);
      expect(cells1[0]).toBe('Shopify'); // Preserved unrelated column (Channel)
      expect(cells1[1]).toBe('Cool T-Shirt'); // Preserved unrelated column (Product Name)
      expect(cells1[2]).toBe('TSHIRT-S-BLUE');
      expect(cells1[3]).toBe('28'); // Updated
      expect(cells1[4]).toBe('24'); // Updated
      expect(cells1[5]).toBe('4');  // Updated
      expect(cells1[6]).toBe('0.5'); // Updated (1.2 -> 0.5)
      expect(cells1[7]).toBe('100'); // Preserved unrelated column (Inventory)

      const cells2 = transformer.parseCsvLine(lines[2]);
      expect(cells2[0]).toBe('Shopify');
      expect(cells2[2]).toBe('JEANS-32-BLUE');
      expect(cells2[3]).toBe('28.0'); // Skipped, original value preserved
      expect(cells2[6]).toBe('0.50'); // Skipped, original value preserved

      // Cleanup generated files
      fs.unlinkSync(result.outputPath);
      fs.unlinkSync(result.backupPath);
    });
  });

  // 6. Verifier reporting and verification failures
  describe('Sync Verifier', () => {
    it('should correctly flag verification failures and already correct items', () => {
      const verifier = new Verifier();
      const shopifyVariants = [
        { productId: 'p1', productTitle: 'A', productStatus: 'ACTIVE', variantId: 'v1', variantTitle: 'S', sku: 'SKU-OK' },
        { productId: 'p2', productTitle: 'B', productStatus: 'ACTIVE', variantId: 'v2', variantTitle: 'M', sku: 'SKU-FAIL' },
        { productId: 'p3', productTitle: 'C', productStatus: 'ACTIVE', variantId: 'v3', variantTitle: 'L', sku: 'SKU-MISSING' }
      ];

      const shiprocketProducts = [
        { id: 1, sku: 'SKU-OK', name: 'A', length: 28, breadth: 24, height: 4, weight: 0.5 },
        { id: 2, sku: 'SKU-FAIL', name: 'B', length: 10, breadth: 10, height: 10, weight: 1.2 }
      ];

      const universal = { lengthCm: 28, breadthCm: 24, heightCm: 4, weightKg: 0.5 };
      const preCorrect = new Set(['SKU-OK']);

      const report = verifier.verify(shopifyVariants, shiprocketProducts, universal, preCorrect);

      expect(report.length).toBe(3);
      
      const rOk = report.find(r => r.sku === 'SKU-OK');
      expect(rOk?.status).toBe('already_correct');

      const rFail = report.find(r => r.sku === 'SKU-FAIL');
      expect(rFail?.status).toBe('verification_failed');
      expect(rFail?.details).toContain('Verification Mismatch');

      const rMissing = report.find(r => r.sku === 'SKU-MISSING');
      expect(rMissing?.status).toBe('missing_in_shiprocket');
    });
  });
});
