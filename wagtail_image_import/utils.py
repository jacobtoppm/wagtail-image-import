from django.db.models import Count, F, Q

from wagtail.images import get_image_model


def get_most_likely_duplicate(drive_image_info, field_mapping, field_weighting):
    filters = {}
    or_filter = Q()
    drive_image_info = flatten(drive_image_info)

    for drive_field, db_field in field_mapping.items():
        field_filter = Q(**{db_field: drive_image_info[drive_field]})
        filters[db_field] = field_filter
        or_filter = or_filter | field_filter

    qs = get_image_model().objects.select_related("driveidmapping").filter(or_filter)
    # find images matching any of the fields

    total_filter_count_annotation = 0
    for db_field, field_filter in filters.items():
        cnt_name = db_field + "__true_cnt"
        qs = qs.annotate(**{cnt_name: Count("id", filter=field_filter)})
        total_filter_count_annotation += field_weighting.get(db_field, 1) * F(cnt_name)

    qs = qs.annotate(match_filter_cnt=total_filter_count_annotation).order_by(
        "-match_filter_cnt"
    )
    # order by the number of matching fields

    return qs.first()


def flatten(d, parent_key="", sep="__"):
    items = []
    for k, v in d.items():
        new_key = parent_key + sep + k if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)
