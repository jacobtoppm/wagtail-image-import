# wagtail-image-import
Adds image import from Google Drive, including identifying potential duplicates, to the Wagtail Admin.

## Installation

Add to `INSTALLED_APPS` in your settings file above `wagtail.admin`

## Setup

Wagtail Image Import relies on Google APIs, which you will first need to enable for your project:

1. Navigate to the [Google API Library](https://console.developers.google.com/apis/library). Select a project for your Wagtail site, or create a new one.

2. Find and enable the [Google Docs](https://console.developers.google.com/apis/library/docs.googleapis.com) and [Google Drive](https://console.developers.google.com/apis/library/drive.googleapis.com) APIs.
    
3. Find and enable the [Google Picker](https://console.developers.google.com/apis/api/picker.googleapis.com) API, and copy its API key to the setting `WAGTAIL_IMAGE_IMPORT_GOOGLE_PICKER_API_KEY`.

4. Open the [Credentials](https://console.developers.google.com/apis/credentials) page in the API Console.

5. Select `Create credentials`, then `OAuth client ID`

6. If you haven't already configured the consent screen, you will need to configure this now.

    1. Under `Scopes for Google APIs`, click `Add scope`.

    2. Add `../auth/documents.readonly` and `../auth/drive.readonly` scopes.

        Note: adding these sensitive scopes means that you will need to submit your project for verification by Google to avoid user caps and warning pages during use.
        
    3. Add your domain to `Authorised domains`.

 7. For `Application type`, choose `Web application`.

 8. Under `Authorised JavaScript origins`, add your domain.

 9. On the Credentials page, next to your Client ID, click the download item to download a JSON file of your client
    secret.

 10. Copy the text from this file, and use it to set `WAGTAILIMAGEIMPORT_GOOGLE_OAUTH_CLIENT_SECRET`.

 ### Duplicate Comparison Setup

Wagtail Image Import will attempt to identify the most likely duplicate of an image, in case it has been previously imported. By default, it will do this by comparing the unique Drive ID of each import, as well as the titles. If this is all you need, you can skip this section, or just use it to tweak the default experience.

If you are using a [custom image model](https://docs.wagtail.io/en/latest/advanced_topics/images/custom_image_model.html), you can also add the `wagtail_image_import.models.DuplicateFindingMixin` to your custom model, which exposes the EXIF datetime and md5 hash for even better duplicate identification. An example of adding this to a very basic custom image model is shown below:

```python
from wagtail.images.models import Image, AbstractImage, AbstractRendition

from wagtail_image_import.models import DuplicateFindingMixin


class CustomImage(DuplicateFindingMixin, AbstractImage):
    admin_form_fields = Image.admin_form_fields


class CustomRendition(AbstractRendition):
    image = models.ForeignKey(
        CustomImage, on_delete=models.CASCADE, related_name="renditions"
    )

    class Meta:
        unique_together = (("image", "filter_spec", "focal_point_key"),)
```

If you choose to add the mixin and have existing image data, you will need to call `save()` on all existing instances to fill in the new fields. This can be done in the Django shell:

```python
from wagtail.images import get_image_model

for image in get_image_model().objects.all():
    image.save()
```

In order to adjust the duplicate finding process, you can use the 
`WAGTAILIMAGEIMPORT_FIELD_MAPPING` and `WAGTAILIMAGEIMPORT_FIELD_WEIGHTING` settings. 

`WAGTAILIMAGEIMPORT_FIELD_MAPPING` maps Google Drive field names to the database field names. By default, it is:
```python
{
    "id": "driveidmapping__drive_id",
    "name": "title",
}
```
If you add the mixin, use:
```python
{
    "id": "driveidmapping__drive_id", 
    "name": "title",
    "imageMediaMetadata__time": "exif_datetime",
    "md5Checksum": "md5_hash"

}
```
To map the new fields. (If you have additional custom fields, the full list of Drive fields is: `'id', 'name', 'thumbnailLink', 'fileExtension' 'md5Checksum', 'size', 'imageMediaMetadata__width', 'imageMediaMetadata__height', 'imageMediaMetadata__rotation', 'imageMediaMetadata__time`, though not all may be present on every image)

To adjust the field weighting - their relative importance in finding the most likely duplicate - you can set `WAGTAILIMAGEIMPORT_FIELD_WEIGHTING`, which maps database fields to weightings. The default is:
```python
{
    "driveidmapping__drive_id": 10, 
    "md5Checksum": 5, 
    "title": 2
}
```
All fields not listed are given a weighting of 1.

### Other Settings


`WAGTAILIMAGEIMPORT_SET_DRIVE_PARENT_FUNCTION`:
If you would like to choose the starting folder for the Google picker, and prevent navigation outside it (note that due to the limitations of the picker options, this does not limit search results to children of this folder), this setting can be set to the string path to a function. This function must take the request object, and return a string Drive ID for the parent folder.


## Usage


For superusers or users with the 'import' permission (which can be added to groups in the Wagtail admin groups section), the image index's "Add image" button will now be a dropdown, with an additional "Import from Drive" option. Choose this to be taken to the import screen.

You may select folders (all of whose direct image children will be imported - currently, children of subfolders are ignored) or images. 

Once selected, Wagtail Image Import will find potential duplicates and - if duplicates are found - take you to the review screen, where you can choose whether to replace existing images, keep both, or cancel the upload for the new image.

Once confirmed, the upload will begin. As images finish importing, you will be able to edit their metadata.
