from django.shortcuts import render


def import_from_drive(request):
    return render(request, "wagtail_image_import/import.html")
