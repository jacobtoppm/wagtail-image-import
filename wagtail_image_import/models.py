import hashlib
import PIL, PIL.ExifTags

from django.db import models
from django.utils.translation import gettext as _

from wagtail.images import get_image_model_string


class DriveIDMapping(models.Model):
    """
    Represents the Drive ID of an image which has previously been imported from Google Drive, used for identifying duplicates/reimports
    """

    image = models.OneToOneField(get_image_model_string(), on_delete=models.CASCADE)
    drive_id = models.CharField(max_length=100)

    def __str__(self):
        return "{}: {}-{}".format(
            self._meta.verbose_name, self.image.title, self.drive_id
        )

    class Meta:
        verbose_name = _("Drive ID Mapping")
        verbose_name_plural = "Drive ID Mappings"


class DuplicateFindingMixin(models.Model):
    """
    Exposes additional fields for duplicate finding if applied to a custom image model
    """

    md5_hash = models.CharField(max_length=32, blank=True, default="")

    exif_datetime = models.CharField(max_length=100, blank=True, default="")

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields", [])
        update_file = not bool(update_fields) or ("file" in update_fields)
        update_exif = not bool(update_fields) or (
            update_file or "exif_datetime" in update_fields
        )
        update_md5_hash = not bool(update_fields) or (
            update_file or "md5_hash" in update_fields
        )
        if update_exif:
            self.exif_datetime = self._get_exif_datetime()
        if update_md5_hash:
            self.md5_hash = self._get_md5_hash()
        return super(DuplicateFindingMixin, self).save(*args, **kwargs)

    def _get_exif_datetime(self):
        for key, descriptor in PIL.ExifTags.TAGS.items():
            if descriptor == "DateTime":
                return PIL.Image.open(self.file).getexif().get(key, "")

    def _get_md5_hash(self):
        with self.open_file() as f:
            md5_hash = hashlib.md5(f.read()).hexdigest()
        return md5_hash

    class Meta:
        abstract = True
