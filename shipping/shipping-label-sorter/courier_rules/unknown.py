import logging
from .base import process_page as base_process_page

logger = logging.getLogger("a4_converter")

def process_page(page, config):
    """
    Fallback processing rules for unknown couriers.
    """
    logger.warning("Unknown courier detected. Using base processing.")
    return base_process_page(page, config)
