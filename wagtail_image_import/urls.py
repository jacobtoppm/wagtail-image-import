from django.urls import path

from .views import create_from_uploaded_image, edit, import_from_drive, find_duplicates


app_name = "wagtail_image_import"
urlpatterns = [
    path("import/", import_from_drive, name="import"),
    path("edit/<int:image_id>/", edit, name="edit"),
    path("find-duplicates/", find_duplicates, name="find_duplicates"),
    path(
        "create-from-uploaded-image/<int:uploaded_image_id>/",
        create_from_uploaded_image,
        name="create_from_uploaded_image",
    ),
]
