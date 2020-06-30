import os.path
import shutil

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from wagtail_image_import.models import DriveIDMapping
from wagtail_image_import.utils import get_most_likely_duplicate

from tests.models import CustomImage


# We could use settings.MEDIA_ROOT here, but this way we avoid clobbering a real media folder if we
# ever run these tests with non-test settings for any reason
TEST_MEDIA_DIR = os.path.join(os.path.join(settings.BASE_DIR, "test-media"))
TEST_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


class TestDuplicateFinding(TestCase):
    def setUp(self):
        shutil.rmtree(TEST_MEDIA_DIR, ignore_errors=True)
        wagtail_1_file = SimpleUploadedFile(
            name="wagtail_1.png",
            content=open(TEST_DATA_DIR + "/wagtail_1.png", "rb").read(),
            content_type="image/png",
        )
        self.wagtail_1_image = CustomImage.objects.create(
            title=wagtail_1_file.name, file=wagtail_1_file
        )
        wagtail_2_file = SimpleUploadedFile(
            name="wagtail_2.png",
            content=open(TEST_DATA_DIR + "/wagtail_2.png", "rb").read(),
            content_type="image/png",
        )
        self.wagtail_2_image = CustomImage.objects.create(
            title=wagtail_2_file.name, file=wagtail_2_file
        )
        canon_file = SimpleUploadedFile(
            name="Canon_40D.jpg",
            content=open(TEST_DATA_DIR + "/Canon_40D.jpg", "rb").read(),
            content_type="image/jpeg",
        )
        self.canon_image = CustomImage.objects.create(
            title=canon_file.name, file=canon_file
        )
        DriveIDMapping.objects.create(image=self.wagtail_1_image, drive_id="1")
        DriveIDMapping.objects.create(image=self.wagtail_2_image, drive_id="2")

    def tearDown(self):
        shutil.rmtree(TEST_MEDIA_DIR, ignore_errors=True)

    def test_find_title_duplicates(self):
        title_config = ({"name": "title"}, {"title": 10})
        duplicate = get_most_likely_duplicate({"name": "wagtail_2.png"}, *title_config)
        self.assertEqual(duplicate, self.wagtail_2_image)
        duplicate_2 = get_most_likely_duplicate(
            {"name": "wagtail_200000.png"}, *title_config
        )
        self.assertEqual(duplicate_2, None)

    def test_find_drive_id_duplicates(self):
        id_config = ({"id": "driveidmapping__drive_id"}, {})
        duplicate = get_most_likely_duplicate({"id": "1"}, *id_config)
        self.assertEqual(duplicate, self.wagtail_1_image)
        duplicate_2 = get_most_likely_duplicate({"id": "200000"}, *id_config)
        self.assertEqual(duplicate_2, None)

    def test_find_md5_hash_duplicates(self):
        hash_config = ({"md5Checksum": "md5_hash"}, {})
        duplicate = get_most_likely_duplicate(
            {"md5Checksum": "93d85f960bcffa9c1b1d55296db40ad0"}, *hash_config
        )
        self.assertEqual(duplicate, self.wagtail_1_image)
        duplicate_2 = get_most_likely_duplicate(
            {"md5Checksum": "93d85f960bcffa345b1d55296db40ad0"}, *hash_config
        )
        self.assertEqual(duplicate_2, None)

    def test_find_exif_datetime_duplicates(self):
        time_config = ({"imageMediaMetadata__time": "exif_datetime"}, {})
        duplicate = get_most_likely_duplicate(
            {"imageMediaMetadata": {"time": "2008:07:31 10:38:11"}}, *time_config
        )
        self.assertEqual(duplicate, self.canon_image)
        duplicate_2 = get_most_likely_duplicate(
            {"imageMediaMetadata": {"time": "2008:07:31 10:38:14"}}, *time_config
        )
        self.assertEqual(duplicate_2, None)

    def test_set_md5_hash(self):
        self.assertEqual(
            self.wagtail_1_image.md5_hash, "93d85f960bcffa9c1b1d55296db40ad0"
        )
        self.assertEqual(
            self.wagtail_2_image.md5_hash, "4bbc11818585b0e359a30e6d93eeb613"
        )
        self.assertEqual(self.canon_image.md5_hash, "406958840ad1665ffcd1be9c29d515b9")

    def test_set_exif_datetime(self):
        self.assertEqual(self.wagtail_1_image.exif_datetime, "")
        self.assertEqual(self.wagtail_2_image.exif_datetime, "")
        self.assertEqual(self.canon_image.exif_datetime, "2008:07:31 10:38:11")
