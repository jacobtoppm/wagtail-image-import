from django.db.models import Count, F, Q

from wagtail.images import get_image_model


def get_most_likely_duplicate(drive_image_info, field_mapping):
    filters = {}
    or_filter = Q()
    for drive_field, db_field in field_mapping.items():
        field_filter = Q(**{db_field: drive_image_info[drive_field]})
        filters[db_field+'__true_cnt'] = (field_filter)
        or_filter = or_filter | field_filter

    qs = get_image_model().objects.select_related('driveidmapping').filter(or_filter)

    total_filter_count_annotation = 0
    for cnt_name, field_filter in filters.items():
        qs = qs.annotate(**{cnt_name: Count('id', filter=field_filter)})
        total_filter_count_annotation += F(cnt_name)

    qs = qs.annotate(match_filter_cnt=total_filter_count_annotation).order_by('-match_filter_cnt')

    return qs