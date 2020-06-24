from django.urls import path

from .views import import_from_drive, find_duplicates


app_name = "wagtail_image_import"
urlpatterns = [
    path("import/", import_from_drive, name="import"),
    path("find-duplicates/", find_duplicates, name="find_duplicates")
]
