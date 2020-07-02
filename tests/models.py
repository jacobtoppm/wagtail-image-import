from django.db import models

from wagtail.images.models import Image, AbstractImage, AbstractRendition

from wagtail_image_import.models import DuplicateFindingMixin


class CustomImage(DuplicateFindingMixin, AbstractImage):
    admin_form_fields = Image.admin_form_fields


class CustomRendition(AbstractRendition):
    image = models.ForeignKey(
        CustomImage, on_delete=models.CASCADE, related_name="renditions"
    )

    class Meta:
        unique_together = (("image", "filter_spec", "focal_point_key"),)
