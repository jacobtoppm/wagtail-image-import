const React = window.React;
const ReactDOM = window.ReactDOM;
const Icon = window.wagtail.components.Icon;

function Importer(props) {
  return (
    <DriveSelector
      appId={props.appId}
      pickerApiKey={props.pickerApiKey}
      clientId={props.clientId}
      scope="https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/drive.readonly"
    />
  );
}

function DriveSelector(props) {
  const [apiLoaded, setApiLoaded] = React.useState(false);
  React.useEffect(() => {
    // Load auth and picker APIs
    gapi.load("client:auth2:picker", () => {
      gapi.client
        .init({
          apiKey: props.pickerApiKey,
          clientId: props.clientId,
          discoveryDocs: [
            "https://docs.googleapis.com/$discovery/rest?version=v1",
            "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
          ],
          scope: props.scope,
        })
        .then(() => {
          setApiLoaded(true);
        })
        .catch((error) => {
          console.error(error);
        });
    });
  }, []);

  function authenticate() {
    const googleAuth = gapi.auth2.getAuthInstance();

    if (googleAuth.isSignedIn.get()) {
      return Promise.resolve(googleAuth.currentUser.get().getAuthResponse());
    }

    return googleAuth.signIn({ scope: props.scope }).then((result) => {
      return result.getAuthResponse();
    });
  }

  function showPicker(oauthToken, callback) {
    let docsView = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES);
    docsView.setSelectFolderEnabled(true);
    docsView.setIncludeFolders(true);
    docsView.setParent("root");

    let picker = new google.picker.PickerBuilder()
      .setAppId(props.appId)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setDeveloperKey(props.pickerApiKey)
      .setOAuthToken(oauthToken)
      .addView(docsView)
      .setCallback(callback)
      .build();

    picker.setVisible(true);
  }

  function isImage(element, index, array) {
    return element.type == google.picker.Type.PHOTO;
  }

  function isFolder(element, index, array) {
    return element.type == google.picker.Type.jG;
  }

  function onSelect(data) {
    if (data.action == google.picker.Action.PICKED) {
      const images = data.docs.filter(isImage);
      const folders = data.docs.filter(isFolder);
      let imageData = new Array();
      if (folders) {
        const q = `(mimeType contains 'image/') and (${folders
          .reduce(
            (query, folder) => query + `('${folder.id}' in parents) or `,
            ``
          )
          .slice(0, -4)})`;
        gapi.client.drive.files
          .list({
            q: q,
            pageSize: 1000,
            fields:
              "nextPageToken, files(id, name, thumbnailLink, fileExtension, md5Checksum, size, imageMediaMetadata)",
          })
          .then((response) => {
            imageData.push(...response.result.files);
          });
      }
      if (images) {
        images.forEach((element) => {
          gapi.client.drive.files
            .get({
              fileId: element.id,
              fields:
                "id, name, thumbnailLink, fileExtension, md5Checksum, size, imageMediaMetadata",
            })
            .then((response) => {
              imageData.push(response.result);
            });
        });
      }
    }
  }

  function pick() {
    authenticate().then((auth) => {
      return showPicker(auth.access_token, onSelect);
    });
  }

  if (apiLoaded) {
    return (
      <button class="button bicolor icon icon-plus" onClick={pick}>
        Select an image or folder in Drive
      </button>
    );
  } else {
    return <LoadingSpinner message="Loading Google API" />;
  }
}

const LoadingSpinner = (props) => (
  <span>
    <Icon name="spinner" className="c-spinner" />
    {props.message}
  </span>
);

const domContainer = document.querySelector("#importer");
ReactDOM.render(
  <Importer
    appId={domContainer.dataset.appId}
    pickerApiKey={domContainer.dataset.pickerApiKey}
    clientId={domContainer.dataset.clientId}
  />,
  domContainer
);
