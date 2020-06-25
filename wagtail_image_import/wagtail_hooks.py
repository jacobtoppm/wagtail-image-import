from django.conf.urls import include, url
from django.contrib.auth.models import Permission

from wagtail.core import hooks
from wagtail.images import get_image_model_string

import wagtail_image_import.urls as image_import_urls


@hooks.register("register_permissions")
def register_import_permission():
    return Permission.objects.filter(
        content_type__app_label=get_image_model_string().split(".")[0],
        codename__in=["import_image"],
    )


@hooks.register("register_admin_urls")
def register_import_urls():
    return [
        url(r"^image-import/", include(image_import_urls)),
    ]
