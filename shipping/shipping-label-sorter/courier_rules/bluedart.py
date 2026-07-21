from .base import process_page as base_process_page

def process_page(page, config):
    """
    Blue Dart specific processing rules.
    - Removes right-side blank area.
    - Keeps AWB barcode and order barcode sharp.
    - Fits full content to A4 portrait.
    - Black and white only.
    - Preserves all text.
    """
    # Exposes custom processing for Blue Dart. For now, calls base.
    return base_process_page(page, config)
