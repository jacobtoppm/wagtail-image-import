from django.contrib.auth.models import Permission

from wagtail.core import hooks
from wagtail.images import get_image_model_string


@hooks.register("register_permissions")
def register_import_permission():
    return Permission.objects.filter(
        content_type__app_label=get_image_model_string().split(".")[0],
        codename__in=["import_image"],
    )
