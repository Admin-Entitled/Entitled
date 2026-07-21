from .base import process_page as base_process_page

def process_page(page, config):
    """
    Delhivery specific processing rules.
    - Black and white only.
    - Preserves barcodes/AWB/order fields.
    """
    return base_process_page(page, config)
