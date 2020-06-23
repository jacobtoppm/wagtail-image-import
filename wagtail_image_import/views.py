import json

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.shortcuts import render

from .templatetags.wagtail_image_import_tags import can_import


def import_from_drive(request):
    if not can_import(request.user):
        raise PermissionDenied
    client_secret = json.loads(settings.WAGTAILIMAGEIMPORT_GOOGLE_OAUTH_CLIENT_SECRET)
    context = {
        'app_id': client_secret["web"]["project_id"],
        'client_id': client_secret["web"]["client_id"],
        'picker_api_key': settings.WAGTAILIMAGEIMPORT_GOOGLE_PICKER_API_KEY
    }
    return render(request, "wagtail_image_import/import.html", context=context)
