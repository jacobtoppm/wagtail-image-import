from django.db import migrations
from wagtail.images import get_image_model_string


def create_import_permission(apps, schema_editor):
    label, model_name = get_image_model_string().lower().split(".")
    ContentType = apps.get_model("contenttypes", "ContentType")
    image_content_type = ContentType.objects.get_for_model(
        apps.get_model(label, model_name)
    )
    Permission = apps.get_model("auth", "Permission")
    Permission.objects.get_or_create(
        codename="import_image",
        name="Can import images",
        content_type=image_content_type,
    )


def delete_import_permission(apps, schema_editor):
    label, model_name = get_image_model_string().lower().split(".")
    ContentType = apps.get_model("contenttypes", "ContentType")
    image_content_type = ContentType.objects.get_for_model(
        apps.get_model(label, model_name)
    )
    Permission = apps.get_model("auth", "Permission")
    permission = Permission.objects.filter(
        codename="can_import",
        name="Can import images",
        content_type=image_content_type,
    )
    permission.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("wagtailimages", "0022_uploadedimage"),
        migrations.swappable_dependency(get_image_model_string()),
        ("auth", "0011_update_proxy_permissions"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(create_import_permission, delete_import_permission),
    ]
