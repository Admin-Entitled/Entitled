from .base import process_page as base_process_page

def process_page(page, config):
    """
    Amazon Shipping specific processing rules.
    - Black and white only.
    - Preserves QR/barcodes/order fields.
    """
    return base_process_page(page, config)
