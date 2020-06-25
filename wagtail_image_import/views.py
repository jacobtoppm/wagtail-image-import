import json

from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

from .templatetags.wagtail_image_import_tags import can_import
from .utils import get_most_likely_duplicate


def import_from_drive(request):
    if not can_import(request.user):
        raise PermissionDenied
    client_secret = json.loads(settings.WAGTAILIMAGEIMPORT_GOOGLE_OAUTH_CLIENT_SECRET)
    context = {
        "app_id": client_secret["web"]["project_id"],
        "client_id": client_secret["web"]["client_id"],
        "picker_api_key": settings.WAGTAILIMAGEIMPORT_GOOGLE_PICKER_API_KEY,
    }
    return render(request, "wagtail_image_import/import.html", context=context)


@csrf_exempt
def find_duplicates(request):
    if (not can_import(request.user)) or (not request.method == "POST"):
        raise PermissionDenied
    image_data_list = json.loads(request.body)

    field_mapping = getattr(
        settings,
        "WAGTAILIMAGEIMPORT_FIELD_MAPPING",
        {"id": "driveidmapping__drive_id", "name": "title",},
    )
    # maps drive fields to db fields

    field_weighting = getattr(settings, "WAGTAILIMAGEIMPORT_FIELD_WEIGHTING", {})
    # maps db fields to their weighting when finding most likely duplicate - default weighting is 1

    duplicates = {}
    for image_data in image_data_list:
        duplicate = get_most_likely_duplicate(
            image_data, field_mapping, field_weighting
        )
        if not duplicate:
            continue
        duplicate_data = {
            "pk": duplicate.pk,
            "title": duplicate.title,
            "created_at": duplicate.created_at.strftime(
                getattr(settings, "WAGTAIL_DATETIME_FORMAT", "%d.%m.%Y. %H:%M")
            ),
            "thumbnail": duplicate.get_rendition("max-165x165").url,
        }
        duplicates[image_data["id"]] = duplicate_data

    return JsonResponse(duplicates)
