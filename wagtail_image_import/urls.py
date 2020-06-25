from django.urls import path

from .views import import_from_drive


app_name = "wagtail_image_import"
urlpatterns = [
    path("import/", import_from_drive, name="import"),
]
