import { ShopifyVariant } from './shopify-client';
import { ShiprocketProduct } from './shiprocket-client';
import { UniversalDimensions } from './config';
import { logger } from './logger';

export type SKUStatus =
  | 'updated'
  | 'already_correct'
  | 'missing_in_shiprocket'
  | 'waiting_for_shiprocket_channel_sync'
  | 'blank_shopify_sku'
  | 'duplicate_shopify_sku'
  | 'upload_failed'
  | 'verification_failed';

export interface SKUVerifyResult {
  sku: string;
  status: SKUStatus;
  productTitle: string;
  variantTitle: string;
  details?: string;
}

export class Verifier {
  /**
   * Compares the final Shiprocket catalog against Shopify products and returns a status map.
   */
  public verify(
    shopifyVariants: ShopifyVariant[],
    shiprocketProducts: ShiprocketProduct[],
    universal: UniversalDimensions,
    preUpdateCorrectSkus: Set<string> = new Set(), // SKUs that were correct before CSV upload
    unresolvedSyncSkus: Set<string> = new Set()    // SKUs that timed out waiting for channel sync
  ): SKUVerifyResult[] {
    logger.info('Verifying dimensions in Shiprocket catalog...');

    const shiprocketMap = new Map<string, ShiprocketProduct>();
    for (const p of shiprocketProducts) {
      if (p.sku) {
        shiprocketMap.set(p.sku.trim(), p);
      }
    }

    const results: SKUVerifyResult[] = [];

    for (const v of shopifyVariants) {
      const sku = v.sku;

      // Handle blank Shopify SKUs (these would be captured in input validation)
      if (!sku) {
        results.push({
          sku: '',
          status: 'blank_shopify_sku',
          productTitle: v.productTitle,
          variantTitle: v.variantTitle,
          details: 'Shopify variant SKU is blank.',
        });
        continue;
      }

      // If SKU is tagged as waiting for channel sync
      if (unresolvedSyncSkus.has(sku)) {
        results.push({
          sku,
          status: 'waiting_for_shiprocket_channel_sync',
          productTitle: v.productTitle,
          variantTitle: v.variantTitle,
          details: 'SKU was not found in Shiprocket catalogue and timed out waiting for Shopify channel sync.',
        });
        continue;
      }

      const shipProduct = shiprocketMap.get(sku);
      if (!shipProduct) {
        results.push({
          sku,
          status: 'missing_in_shiprocket',
          productTitle: v.productTitle,
          variantTitle: v.variantTitle,
          details: 'SKU does not exist in Shiprocket products list.',
        });
        continue;
      }

      // Check current dimensions in Shiprocket catalog
      const length = parseFloat(String(shipProduct.length || '0'));
      const breadth = parseFloat(String(shipProduct.breadth || '0'));
      const height = parseFloat(String(shipProduct.height || '0'));
      const weight = parseFloat(String(shipProduct.weight || '0'));

      const matchesLength = Math.abs(length - universal.lengthCm) < 0.01;
      const matchesBreadth = Math.abs(breadth - universal.breadthCm) < 0.01;
      const matchesHeight = Math.abs(height - universal.heightCm) < 0.01;
      const matchesWeight = Math.abs(weight - universal.weightKg) < 0.005;

      const isCurrentlyCorrect = matchesLength && matchesBreadth && matchesHeight && matchesWeight;

      if (isCurrentlyCorrect) {
        if (preUpdateCorrectSkus.has(sku)) {
          results.push({
            sku,
            status: 'already_correct',
            productTitle: v.productTitle,
            variantTitle: v.variantTitle,
            details: `Dimensions are correct (${length}x${breadth}x${height} cm, ${weight} kg) and did not need updating.`,
          });
        } else {
          results.push({
            sku,
            status: 'updated',
            productTitle: v.productTitle,
            variantTitle: v.variantTitle,
            details: `Successfully updated and verified (${length}x${breadth}x${height} cm, ${weight} kg).`,
          });
        }
      } else {
        // Dimensions mismatch: verification failed
        results.push({
          sku,
          status: 'verification_failed',
          productTitle: v.productTitle,
          variantTitle: v.variantTitle,
          details: `Verification Mismatch. Expected [${universal.lengthCm}x${universal.breadthCm}x${universal.heightCm} cm, ${universal.weightKg} kg], got [${length}x${breadth}x${height} cm, ${weight} kg].`,
        });
      }
    }

    return results;
  }

  /**
   * Outputs a summary count of all synchronization statuses.
   */
  public getSummaryCounts(results: SKUVerifyResult[]) {
    const counts = {
      updated: 0,
      already_correct: 0,
      missing_in_shiprocket: 0,
      waiting_for_shiprocket_channel_sync: 0,
      blank_shopify_sku: 0,
      duplicate_shopify_sku: 0,
      upload_failed: 0,
      verification_failed: 0,
    };

    for (const r of results) {
      if (r.status in counts) {
        counts[r.status as keyof typeof counts]++;
      }
    }

    return counts;
  }

  /**
   * Logs verification details and summary table.
   */
  public logReport(results: SKUVerifyResult[]) {
    logger.info('=== Sync Verification Report ===');
    for (const r of results) {
      const logMsg = `SKU: "${r.sku}" | Status: ${r.status} | Product: "${r.productTitle}" | Details: ${r.details || 'N/A'}`;
      if (r.status === 'verification_failed' || r.status === 'upload_failed') {
        logger.error(logMsg);
      } else if (r.status === 'missing_in_shiprocket' || r.status === 'waiting_for_shiprocket_channel_sync') {
        logger.warn(logMsg);
      } else {
        logger.info(logMsg);
      }
    }

    const summary = this.getSummaryCounts(results);
    logger.info('=== Synchronization Summary ===');
    logger.info(`Successfully Updated:  ${summary.updated}`);
    logger.info(`Already Correct:       ${summary.already_correct}`);
    logger.info(`Verification Failed:   ${summary.verification_failed}`);
    logger.info(`Missing in Shiprocket: ${summary.missing_in_shiprocket}`);
    logger.info(`Timed Out Sync:        ${summary.waiting_for_shiprocket_channel_sync}`);
    logger.info(`Blank SKUs:            ${summary.blank_shopify_sku}`);
    logger.info(`Duplicate SKUs:        ${summary.duplicate_shopify_sku}`);
    logger.info(`Upload Failed:         ${summary.upload_failed}`);
    logger.info('================================');
  }
}
