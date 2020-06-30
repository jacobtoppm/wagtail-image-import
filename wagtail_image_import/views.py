import json
import os.path

from django import forms
from django.conf import settings
from django.core.exceptions import PermissionDenied
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.module_loading import import_string
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from wagtail.core.models import Collection
from wagtail.images import get_image_model
from wagtail.images.forms import get_image_form
from wagtail.images.models import UploadedImage
from wagtail.images.permissions import permission_policy
from wagtail.images.views.multiple import get_image_edit_form
from wagtail.search.backends import get_search_backends

from .models import DriveIDMapping
from .templatetags.wagtail_image_import_tags import can_import
from .utils import get_most_likely_duplicate


def import_from_drive(request):
    if not can_import(request.user):
        raise PermissionDenied

    collections = permission_policy.collections_user_has_permission_for(
        request.user, "add"
    )
    collections_to_choose = json.dumps(
        [
            (collection.id, collection.name)
            for collection in Collection.order_for_display(collections)
        ]
    )
    Image = get_image_model()
    ImageForm = get_image_form(Image)

    if request.method == "POST":
        # Build a form for validation
        wagtail_id = request.POST.get("wagtail_id")
        if request.POST["action"] == "replace" and wagtail_id:
            existing_image = get_image_model().objects.get(pk=wagtail_id)
            form = ImageForm(
                {
                    "title": existing_image.title,
                    "collection": existing_image.collection.id,
                },
                {"file": request.FILES["image_file"],},
                user=request.user,
                instance=existing_image,
            )
        else:

            form = ImageForm(
                {
                    "title": request.POST.get("name", ""),
                    "collection": request.POST.get("collection"),
                },
                {"file": request.FILES["image_file"],},
                user=request.user,
            )

        if form.is_valid():
            # Save it
            image = form.save(commit=False)
            image.uploaded_by_user = request.user
            image.file_size = image.file.size
            image.file.seek(0)
            image._set_file_hash(image.file.read())
            image.file.seek(0)
            image.save()
            drive_id = request.POST.get("drive_id")
            if drive_id:
                DriveIDMapping.objects.update_or_create(
                    image=image, defaults={"drive_id": drive_id}
                )

            # Success! Send back an edit form for this image to the user
            return JsonResponse(
                {
                    "success": True,
                    "image_id": int(image.id),
                    "edit_action": reverse(
                        "wagtail_image_import:edit", args=(image.id,)
                    ),
                    "delete_action": reverse(
                        "wagtailimages:delete_multiple", args=(image.id,)
                    ),
                    "form": render_to_string(
                        "wagtail_image_import/edit_form.html",
                        {
                            "image": image,
                            "form": get_image_edit_form(Image)(
                                instance=image,
                                prefix="image-%d" % image.id,
                                user=request.user,
                            ),
                        },
                        request=request,
                    ),
                }
            )
        elif "file" in form.errors:
            # The uploaded file is invalid; reject it now
            return JsonResponse(
                {"success": False, "error": "\n".join(form.errors["file"]),}
            )
        else:
            # Some other field of the image form has failed validation, e.g. a required metadata field
            # on a custom image model. Store the image as an UploadedImage instead and present the
            # edit form so that it will become a proper Image when successfully filled in
            uploaded_image = UploadedImage.objects.create(
                file=request.FILES["image_file"], uploaded_by_user=request.user
            )
            image = Image(
                title=request.POST.get("name", ""),
                collection_id=request.POST.get("collection"),
            )

            return JsonResponse(
                {
                    "error": "The image was uploaded, but needs additional input to be saved. Errors: "
                    + "\n".join(
                        [
                            field + ": " + error
                            for field, error_list in form.errors.items()
                            for error in error_list
                        ]
                    ),
                    "success": True,
                    "uploaded_image_id": uploaded_image.id,
                    "edit_action": reverse(
                        "wagtail_image_import:create_from_uploaded_image",
                        args=(uploaded_image.id,),
                    ),
                    "delete_action": reverse(
                        "wagtailimages:delete_upload_multiple",
                        args=(uploaded_image.id,),
                    ),
                    "form": render_to_string(
                        "wagtail_image_import/edit_form.html",
                        {
                            "uploaded_image": uploaded_image,
                            "form": get_image_edit_form(Image)(
                                instance=image,
                                prefix="uploaded-image-%d" % uploaded_image.id,
                                user=request.user,
                            ),
                        },
                        request=request,
                    ),
                }
            )
    # manually set the Google picker parent folder if a function is provided
    drive_parent_finder = getattr(
        settings, "WAGTAILIMAGEIMPORT_SET_DRIVE_PARENT_FUNCTION", ""
    )
    drive_parent = (
        import_string(drive_parent_finder)(request) if drive_parent_finder else "root"
    )

    client_secret = json.loads(settings.WAGTAILIMAGEIMPORT_GOOGLE_OAUTH_CLIENT_SECRET)
    context = {
        "app_id": client_secret["web"]["project_id"],
        "client_id": client_secret["web"]["client_id"],
        "picker_api_key": settings.WAGTAILIMAGEIMPORT_GOOGLE_PICKER_API_KEY,
        "collections": collections_to_choose,
        "drive_parent": drive_parent,
    }
    return render(request, "wagtail_image_import/import.html", context=context)


@require_POST
def create_from_uploaded_image(request, uploaded_image_id):
    Image = get_image_model()
    ImageForm = get_image_edit_form(Image)

    uploaded_image = get_object_or_404(UploadedImage, id=uploaded_image_id)

    if uploaded_image.uploaded_by_user != request.user:
        raise PermissionDenied

    image = Image()
    form = ImageForm(
        request.POST,
        request.FILES,
        instance=image,
        prefix="uploaded-image-" + str(uploaded_image_id),
        user=request.user,
    )

    if form.is_valid():
        # assign the file content from uploaded_image to the image object, to ensure it gets saved to
        # Image's storage

        image.file.save(
            os.path.basename(uploaded_image.file.name),
            uploaded_image.file.file,
            save=False,
        )
        image.uploaded_by_user = request.user
        image.file_size = image.file.size
        image.file.open()
        image.file.seek(0)
        image._set_file_hash(image.file.read())
        image.file.seek(0)
        form.save()

        uploaded_image.file.delete()
        uploaded_image.delete()

        drive_id = request.POST.get("drive_id")
        if drive_id:
            DriveIDMapping.objects.update_or_create(
                image=image, defaults={"drive_id": drive_id}
            )

        # Reindex the image to make sure all tags are indexed
        for backend in get_search_backends():
            backend.add(image)

        return JsonResponse({"success": True, "image_id": image.id,})
    else:
        return JsonResponse(
            {
                "success": False,
                "edit_action": reverse(
                    "wagtail_image_import:create_from_uploaded_image",
                    args=(uploaded_image.id,),
                ),
                "delete_action": reverse(
                    "wagtailimages:delete_upload_multiple", args=(uploaded_image.id,)
                ),
                "form": render_to_string(
                    "wagtail_image_import/edit_form.html",
                    {"uploaded_image": uploaded_image, "form": form,},
                    request=request,
                ),
            }
        )


@require_POST
def edit(request, image_id, callback=None):
    Image = get_image_model()
    ImageForm = get_image_edit_form(Image)

    image = get_object_or_404(Image, id=image_id)

    if not permission_policy.user_has_permission_for_instance(
        request.user, "change", image
    ):
        raise PermissionDenied

    form = ImageForm(
        request.POST,
        request.FILES,
        instance=image,
        prefix="image-" + str(image_id),
        user=request.user,
    )

    if form.is_valid():
        form.save()

        # Reindex the image to make sure all tags are indexed
        for backend in get_search_backends():
            backend.add(image)

        return JsonResponse({"success": True, "image_id": int(image_id),})
    else:
        return JsonResponse(
            {
                "success": False,
                "image_id": int(image_id),
                "form": render_to_string(
                    "wagtail_image_import/edit_form.html",
                    {
                        "image": image,
                        "edit_action": reverse(
                            "wagtail_image_import:edit", args=(image_id,)
                        ),
                        "delete_action": reverse(
                            "wagtailimages:delete_multiple", args=(image_id,)
                        ),
                        "form": form,
                    },
                    request=request,
                ),
            }
        )


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
    # if using DuplicateFindingMixin, you can also add imageMediaMetadata__time: exif_datetime, and md5Checksum: md5_hash

    field_weighting = getattr(
        settings,
        "WAGTAILIMAGEIMPORT_FIELD_WEIGHTING",
        {"driveidmapping__drive_id": 10, "md5Checksum": 5, "title": 2},
    )
    # maps db fields to their weighting when finding most likely duplicate - default weighting is 1

    duplicates = {}
    for image_data in image_data_list:
        duplicate = get_most_likely_duplicate(
            image_data, field_mapping, field_weighting
        )
        if not duplicate:
            continue
        duplicate_data = {
            "wagtail_id": duplicate.pk,
            "title": duplicate.title,
            "created_at": duplicate.created_at.strftime(
                getattr(settings, "WAGTAIL_DATETIME_FORMAT", "%d.%m.%Y. %H:%M")
            ),
            "thumbnail": duplicate.get_rendition("max-165x165").url,
        }
        duplicates[image_data["id"]] = duplicate_data

    return JsonResponse(duplicates)
