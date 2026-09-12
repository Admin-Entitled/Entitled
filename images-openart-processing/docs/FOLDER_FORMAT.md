# Folder format

```text
images-openart-processing-workspace/
  references/front.webp
  prompts/front.txt
  input/Product 1/front.jpeg
  input/Product 1/back.jpeg
  results/Product 1/front.png
```

Files in `references/` and `prompts/` are reusable across every product. Each immediate subfolder of `input/` is a product/SKU. Supported images are JPG, JPEG, PNG, and WEBP. Hidden and temporary files are ignored. UTF-8 `.txt` prompts are naturally sorted.

Mapping is role-based: `references/front.webp`, `prompts/front.txt`, and `input/Product 1/front.jpeg` produce `results/Product 1/front.png`. Numbered names such as `01_front` normalize to the `front` role; numeric position alone never maps files. Ambiguous roles and missing presentation/product/prompt files are blocking validation errors.

Manifest columns remain `order,prompt_key,prompt_file,reference_patterns,output_name,enabled`; optional columns are `presentation_reference,product_patterns,measurement_reference,output_type`. Multiple patterns are separated with `|`. A manifest can explicitly select the ordered product inputs and size-chart sources.
