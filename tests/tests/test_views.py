import os.path
import shutil

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

from wagtail.core.models import Collection
from wagtail.images.models import UploadedImage
from wagtail.tests.utils import WagtailTestUtils

from wagtail_image_import.models import DriveIDMapping
from wagtail_image_import.utils import get_most_likely_duplicate

from tests.models import CustomImage


# We could use settings.MEDIA_ROOT here, but this way we avoid clobbering a real media folder if we
# ever run these tests with non-test settings for any reason
TEST_MEDIA_DIR = os.path.join(os.path.join(settings.BASE_DIR, "test-media"))
TEST_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


class TestViews(TestCase, WagtailTestUtils):
    def setUp(self):
        shutil.rmtree(TEST_MEDIA_DIR, ignore_errors=True)
        self.wagtail_1_file = SimpleUploadedFile(
            name="wagtail_1.png",
            content=open(TEST_DATA_DIR + "/wagtail_1.png", "rb").read(),
            content_type="image/png",
        )
        self.wagtail_1_image = CustomImage.objects.create(
            title=self.wagtail_1_file.name, file=self.wagtail_1_file
        )
        self.canon_file = SimpleUploadedFile(
            name="Canon_40D.jpg",
            content=open(TEST_DATA_DIR + "/Canon_40D.jpg", "rb").read(),
            content_type="image/jpeg",
        )
        DriveIDMapping.objects.create(image=self.wagtail_1_image, drive_id="1")
        user = self.login()
        # make sure there are at least two collections to choose between
        Collection.objects.first().add_child()

        self.uploaded_image = UploadedImage.objects.create(
            uploaded_by_user=user, file=self.wagtail_1_file
        )

    def tearDown(self):
        shutil.rmtree(TEST_MEDIA_DIR, ignore_errors=True)

    def test_import_view_get(self):
        response = self.client.get(reverse("wagtail_image_import:import"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "wagtail_image_import/import.html")
        self.assertEqual(response.context["drive_parent"], "root")

    def test_import_view_post_valid_new_image(self):
        # test that an imported new image gets created
        response = self.client.post(
            reverse("wagtail_image_import:import"),
            {
                "name": "new_image",
                "collection": 1,
                "image_file": self.canon_file,
                "action": "keep",
                "drive_id": "2",
            },
        )
        self.assertEqual(response.status_code, 200)

        response_json = response.json()
        self.assertEqual(response_json["success"], True)
        id = response_json["image_id"]
        self.assertEqual(
            response_json["edit_action"], "/admin/image-import/edit/{}/".format(id)
        )
        self.assertEqual(
            response_json["delete_action"],
            "/admin/images/multiple/{}/delete/".format(id),
        )
        self.assertIn("form", response_json)

        # now check the created image
        created_image = CustomImage.objects.get(id=id)
        self.assertEqual(created_image.collection_id, 1)
        self.assertEqual(created_image.title, "new_image")
        self.assertEqual(created_image.driveidmapping.drive_id, "2")
        self.assertEqual(created_image.collection_id, 1)

    def test_import_view_post_new_image_invalid_info(self):
        # test that an imported new image with invalid collection
        # gets an uploaded image response instead
        response = self.client.post(
            reverse("wagtail_image_import:import"),
            {
                "name": "new_image",
                "collection": 1000000,
                "image_file": self.canon_file,
                "action": "keep",
                "drive_id": "2",
            },
        )
        self.assertEqual(response.status_code, 200)

        response_json = response.json()
        self.assertEqual(response_json["success"], True)
        id = response_json["uploaded_image_id"]
        self.assertEqual(
            response_json["error"],
            "The image was uploaded, but needs additional input to be saved. Errors: collection: Select a valid choice. That choice is not one of the available choices.",
        )
        self.assertEqual(
            response_json["edit_action"],
            "/admin/image-import/create-from-uploaded-image/{}/".format(id),
        )
        self.assertEqual(
            response_json["delete_action"],
            "/admin/images/multiple/delete_upload/{}/".format(id),
        )
        self.assertIn("form", response_json)

    def test_import_view_post_valid_replacement_image(self):
        # test that an imported replacement image gets updated
        id = self.wagtail_1_image.id
        response = self.client.post(
            reverse("wagtail_image_import:import"),
            {
                "name": "new_image",
                "collection": 1,
                "image_file": self.canon_file,
                "action": "replace",
                "drive_id": "2",
                "wagtail_id": id,
            },
        )
        self.assertEqual(response.status_code, 200)

        response_json = response.json()
        self.assertEqual(response_json["image_id"], id)
        self.assertEqual(response_json["success"], True)
        self.assertEqual(
            response_json["edit_action"], "/admin/image-import/edit/{}/".format(id)
        )
        self.assertEqual(
            response_json["delete_action"],
            "/admin/images/multiple/{}/delete/".format(id),
        )
        self.assertIn("form", response_json)

        # now check the updated image
        updated_image = CustomImage.objects.get(id=id)
        self.assertEqual(updated_image.driveidmapping.drive_id, "2")
        self.assertIn("Canon_40D.jpg", updated_image.file.name)

    def test_create_from_uploaded_view(self):
        # test that an image can be created from an UploadedImage instance
        id = str(self.uploaded_image.id)
        response = self.client.post(
            reverse("wagtail_image_import:create_from_uploaded_image", args=[id]),
            {
                "uploaded-image-" + id + "-title": "new_image",
                "uploaded-image-" + id + "-collection": 1,
                "drive_id": "2",
            },
        )
        self.assertEqual(response.status_code, 200)

        response_json = response.json()
        self.assertEqual(response_json["success"], True)
        pk = response_json["image_id"]

        # now check the created image
        created_image = CustomImage.objects.get(id=pk)
        self.assertEqual(created_image.collection_id, 1)
        self.assertEqual(created_image.title, "new_image")
        self.assertEqual(created_image.driveidmapping.drive_id, "2")

    def test_edit_view(self):
        # test that an image can be edited after creation
        id = self.wagtail_1_image.id
        response = self.client.post(
            reverse("wagtail_image_import:edit", args=[self.wagtail_1_image.id]),
            {
                "image-" + str(id) + "-title": "edited_image",
                "image-" + str(id) + "-collection": 2,
            },
        )
        self.assertEqual(response.status_code, 200)

        response_json = response.json()

        self.assertEqual(response_json["success"], True)

        # now check the edited image
        edited_image = CustomImage.objects.get(id=id)
        self.assertEqual(edited_image.collection_id, 2)
        self.assertEqual(edited_image.title, "edited_image")
