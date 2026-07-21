from . import base, bluedart, delhivery, amazon, unknown

# Map courier identifier to its rule module
COURIER_MAP = {
    "bluedart": bluedart,
    "delhivery": delhivery,
    "amazon": amazon,
    "unknown": unknown
}
