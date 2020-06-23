from django import template

from wagtail.images import get_image_model_string

register = template.Library()


@register.simple_tag
def can_import(user):
    app_label, _ = get_image_model_string().split(".")
    return user.has_perm(app_label + ".import_image")
