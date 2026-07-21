import unittest

from meta_aspect_ratio_exporter import VideoDimensions, is_reels_fit


class ReelsFitTests(unittest.TestCase):
    def test_exact_9_by_16_video_is_fit(self) -> None:
        self.assertTrue(is_reels_fit(VideoDimensions(width=1080, height=1920)))
        self.assertTrue(is_reels_fit(VideoDimensions(width=2160, height=3840)))

    def test_non_9_by_16_video_needs_variant(self) -> None:
        self.assertFalse(is_reels_fit(VideoDimensions(width=1920, height=1080)))
        self.assertFalse(is_reels_fit(VideoDimensions(width=1080, height=1350)))


if __name__ == "__main__":
    unittest.main()
