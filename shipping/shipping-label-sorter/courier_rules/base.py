import fitz
from collections import Counter

def detect_text_rotation(page) -> int:
    """
    Analyzes the text spans on the page to find the dominant text writing direction.
    """
    text_dict = page.get_text("dict")
    directions = []
    
    for block in text_dict.get("blocks", []):
        if "lines" in block:
            for line in block["lines"]:
                directions.append(line.get("dir", (1.0, 0.0)))
                
    if not directions:
        return -1
        
    rounded_dirs = [(round(d[0], 2), round(d[1], 2)) for d in directions]
    most_common_dir = Counter(rounded_dirs).most_common(1)[0][0]
    
    x, y = most_common_dir
    if abs(x - 1.0) < 0.2 and abs(y - 0.0) < 0.2:
        return 0
    elif abs(x - 0.0) < 0.2 and abs(y - 1.0) < 0.2:
        return 270
    elif abs(x - 0.0) < 0.2 and abs(y - (-1.0)) < 0.2:
        return 90
    elif abs(x - (-1.0)) < 0.2 and abs(y - 0.0) < 0.2:
        return 180
        
    return 0

def detect_label_bbox(pix, threshold=250, gap_limit=150, border_exclude=80):
    """
    Finds the bounding box of the active content in the Pixmap by looking for columns
    and rows with active (non-white) pixels, ignoring thin outer border lines.
    """
    width = pix.width
    height = pix.height
    samples = pix.samples
    
    # 1. Analyze row activity
    row_active = []
    for y in range(height):
        offset = y * width
        row_active.append(min(samples[offset : offset + width]) < threshold)
        
    # 2. Analyze col activity
    col_active = [False] * width
    active_rows = [y for y, active in enumerate(row_active) if active]
    if not active_rows:
        return None
        
    y_min_rough, y_max_rough = active_rows[0], active_rows[-1]
    
    # Exclude top and bottom border zones
    scan_y_min = y_min_rough + border_exclude
    scan_y_max = y_max_rough - border_exclude
    if scan_y_min >= scan_y_max:
        scan_y_min, scan_y_max = y_min_rough, y_max_rough
        
    for x in range(width):
        for y in range(scan_y_min, scan_y_max + 1):
            if samples[y * width + x] < threshold:
                col_active[x] = True
                break
                
    # 3. Find column segments
    col_segments = []
    in_segment = False
    start_x = -1
    gap_count = 0
    
    for x in range(width):
        if col_active[x]:
            if not in_segment:
                in_segment = True
                start_x = x
            gap_count = 0
        else:
            if in_segment:
                gap_count += 1
                if gap_count >= gap_limit:
                    col_segments.append((start_x, x - gap_count))
                    in_segment = False
                    
    if in_segment:
        col_segments.append((start_x, width - 1))
        
    if not col_segments:
        return None
        
    segment_pixels = []
    for start, end in col_segments:
        pixel_count = 0
        for x in range(start, end + 1):
            for y in active_rows:
                if samples[y * width + x] < threshold:
                    pixel_count += 1
        segment_pixels.append((pixel_count, start, end))
        
    best_seg = max(segment_pixels, key=lambda item: item[0])
    x_min, x_max = best_seg[1], best_seg[2]
    
    # 4. Refine row segments within the horizontal range of the best segment
    row_active_refined = [False] * height
    for y in range(height):
        offset = y * width
        for x in range(x_min, x_max + 1):
            if samples[offset + x] < threshold:
                row_active_refined[y] = True
                break
                
    row_segments = []
    in_segment = False
    start_y = -1
    gap_count = 0
    
    for y in range(height):
        if row_active_refined[y]:
            if not in_segment:
                in_segment = True
                start_y = y
            gap_count = 0
        else:
            if in_segment:
                gap_count += 1
                if gap_count >= gap_limit:
                    row_segments.append((start_y, y - gap_count))
                    in_segment = False
                    
    if in_segment:
        row_segments.append((start_y, height - 1))
        
    if not row_segments:
        return None
        
    row_segment_pixels = []
    for start, end in row_segments:
        pixel_count = 0
        for y in range(start, end + 1):
            offset = y * width
            for x in range(x_min, x_max + 1):
                if samples[offset + x] < threshold:
                    pixel_count += 1
        row_segment_pixels.append((pixel_count, start, end))
        
    best_row_seg = max(row_segment_pixels, key=lambda item: item[0])
    y_min, y_max = best_row_seg[1], best_row_seg[2]
    
    return (x_min, y_min, x_max, y_max)

def process_page(page, config) -> tuple:
    """
    Standard base visual processing for a shipping label page.
    Returns:
        (pix_cropped, crop_rect) or (None, None)
    """
    orig_rot = page.rotation % 360
    
    # Reset rotation to 0 to detect baseline orientation
    page.set_rotation(0)
    
    # Detect the correct writing orientation
    detected_rot = detect_text_rotation(page)
    final_rot = detected_rot if detected_rot != -1 else orig_rot
    page.set_rotation(final_rot)
    
    threshold = config.get("threshold", 250)
    gap_limit = config.get("gap_limit", 150)
    border_exclude = config.get("border_exclude", 80)
    dpi = config.get("dpi", 300)
    
    # Render full page in grayscale at high resolution to find the bounding box
    pix_full = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    bbox_px = detect_label_bbox(pix_full, threshold, gap_limit, border_exclude)
    
    if not bbox_px:
        return None, None
        
    x_min, y_min, x_max, y_max = bbox_px
    
    # Convert pixels back to points
    scale_px_to_pt = dpi / 72.0
    x_min_pt = x_min / scale_px_to_pt
    y_min_pt = y_min / scale_px_to_pt
    x_max_pt = x_max / scale_px_to_pt
    y_max_pt = y_max / scale_px_to_pt
    
    # Add 5 points margin
    padding = config.get("padding", 5.0)
    x0 = max(0.0, x_min_pt - padding)
    y0 = max(0.0, y_min_pt - padding)
    x1 = min(page.rect.width, x_max_pt + padding)
    y1 = min(page.rect.height, y_max_pt + padding)
    
    crop_rect = fitz.Rect(x0, y0, x1, y1)
    
    # Render the cropped region at high resolution in grayscale
    pix_cropped = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY, clip=crop_rect)
    
    return pix_cropped, crop_rect
