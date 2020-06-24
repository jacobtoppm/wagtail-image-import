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
        return "{}: {}-{}".format(self._meta.verbose_name, self.image.title, self.drive_id)

    class Meta:
        verbose_name = _("Drive ID Mapping")
        verbose_name_plural = ("Drive ID Mappings")