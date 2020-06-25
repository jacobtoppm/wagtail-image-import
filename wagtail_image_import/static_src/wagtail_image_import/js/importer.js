const React = window.React;
const ReactDOM = window.ReactDOM;
const Icon = window.wagtail.components.Icon;

function Importer(props) {
  const [selectedImageData, setSelectedImageData] = React.useState([]);
  const [duplicateActions, setDuplicateActions] = React.useState(undefined);

  if (!(selectedImageData && selectedImageData.length)) {
    return (
      <DriveSelector
        appId={props.appId}
        pickerApiKey={props.pickerApiKey}
        clientId={props.clientId}
        scope="https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/drive.readonly"
        onGetImageData={setSelectedImageData}
      />
    );
  } else if (!duplicateActions) {
    return (
      <DuplicateIdentifier
        imageData={selectedImageData}
        duplicateReviewUrl={props.duplicateReviewUrl}
        onConfirmDuplicateActions={setDuplicateActions}
      />
    );
  } else {
    return <p>Upload time!</p>;
  }
}

function DuplicateIdentifier(props) {
  const [potentialDuplicates, setPotentialDuplicates] = React.useState({});
  const [duplicateActions, setDuplicateActions] = React.useState({});
  React.useEffect(() => {
    // query potential duplicates in Wagtail
    const data = JSON.stringify(props.imageData);
    fetch(props.duplicateReviewUrl, {
      method: "post",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
      },
      body: data,
    })
      .then((res) => {
        if (res.ok) {
          res.json().then((res_json) => {
            setPotentialDuplicates(res_json);
            let duplicateIds = Object.keys(res_json);
            // set default actions
            let actions = {};
            for (let index = 0; index < duplicateIds.length; index++) {
              actions[duplicateIds[index]] = "replace";
            }
            setDuplicateActions(actions);
            // if no duplicates, confirm no actions without needing confirmation button click
            if (duplicateIds.length == 0) {
              props.onConfirmDuplicateActions({});
            }
          });
        } else {
          console.error(res);
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }, [props.selectedImageData]);

  if (potentialDuplicates && Object.keys(potentialDuplicates).length > 0) {
    let globalAction = true;
    getGlobalAction = () => {
      // if the action chosen for all duplicates is the same, returns the action, otherwise null
      if (!globalAction) {
        return null;
      }
      return duplicateActions[Object.keys(duplicateActions)[0]];
    };
    setGlobalAction = (newAction) => {
      // sets the action for all duplicates to newAction
      let newActions = {};
      const ids = Object.keys(duplicateActions);
      for (let index = 0; index < ids.length; index++) {
        newActions[ids[index]] = newAction;
      }
      setDuplicateActions(newActions);
    };
    let duplicateComparisons = [];
    let pastAction = null;
    let action = null;
    const imageDataIterator = props.imageData.entries();
    for (const [index, value] of imageDataIterator) {
      const id = value["id"];
      if (id in potentialDuplicates) {
        action = duplicateActions[id];
        if (globalAction && !(pastAction === null) && !(action == pastAction)) {
          // if the action is not the same as the previous action, not all actions are the same
          globalAction = false;
        }
        const wagtailDuplicate = potentialDuplicates[id];
        const driveDuplicate = value;
        duplicateComparisons.push(
          <tr>
            <td>
              <DuplicateComparison
                driveDuplicate={driveDuplicate}
                wagtailDuplicate={wagtailDuplicate}
              />
            </td>
            <DuplicateChoice
              action={action}
              onClick={(e) => {
                let actions = { ...duplicateActions };
                actions[id] = e.target.value;
                setDuplicateActions(actions);
              }}
            />
          </tr>
        );
        pastAction = action;
      }
    }
    return (
      <React.Fragment>
        <div class="nice-padding">
          <h2 class="icon icon-warning">Duplicates detected</h2>
          <p>
            Wagtail has detected images similar to the ones you have just chosen
            to upload
          </p>
          <p>Please choose how you would like to proceed</p>
          <p>
            <b>{Object.keys(potentialDuplicates).length} duplicates detected</b>
          </p>
          <table class="listing">
            <thead>
              <tr class="table-headers">
                <th></th>
                <th>Replace original image</th>
                <th>Keep both images</th>
                <th>Cancel upload</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td></td>
                <DuplicateChoice
                  action={getGlobalAction()}
                  onClick={(e) => {
                    setGlobalAction(e.target.value);
                  }}
                />
              </tr>
              {duplicateComparisons}
            </tbody>
          </table>
        </div>
        <footer>
          <ul>
            <li class="actions">
              <button
                type="submit"
                class="button"
                onClick={() =>
                  props.onConfirmDuplicateActions(duplicateActions)
                }
              >
                Confirm all
              </button>
            </li>
          </ul>
        </footer>
      </React.Fragment>
    );
  } else {
    return (
      <div class="nice-padding">
        <LoadingSpinner message="Identifying duplicates" />
      </div>
    );
  }
}

function DuplicateChoice(props) {
  return (
    <React.Fragment>
      <td>
        <input
          type="radio"
          value="replace"
          checked={props.action == "replace"}
          onClick={props.onClick}
        ></input>
      </td>
      <td>
        <input
          type="radio"
          value="keep"
          checked={props.action == "keep"}
          onClick={props.onClick}
        ></input>
      </td>
      <td>
        <input
          type="radio"
          value="cancel"
          checked={props.action == "cancel"}
          onClick={props.onClick}
        ></input>
      </td>
    </React.Fragment>
  );
}

function DuplicateComparison(props) {
  return (
    <table class="image-comparison">
      <thead>
        <tr class="image-headings">
          <th>Original</th>
          <th>New</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <img
              src={props.wagtailDuplicate["thumbnail"]}
              width="165"
              height="165"
            />
          </td>
          <td>
            <img
              src={props.driveDuplicate["thumbnailLink"]}
              width="165"
              height="165"
            />
          </td>
        </tr>
        <tr>
          <td>
            <p>
              <b>{props.wagtailDuplicate["title"]}</b>
            </p>
          </td>
          <td>
            <p>
              <b>{props.driveDuplicate["name"]}</b>
            </p>
          </td>
        </tr>
        <tr>
          <td>
            <p>Created at {props.wagtailDuplicate["created_at"]}</p>
          </td>
          <td></td>
        </tr>
      </tbody>
    </table>
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

  async function onSelect(data) {
    if (data.action == google.picker.Action.PICKED) {
      const images = data.docs.filter(isImage);
      const folders = data.docs.filter(isFolder);
      let imageData = new Array();
      if (folders && folders.length) {
        const q = `(mimeType contains 'image/') and (${folders
          .reduce(
            (query, folder) => query + `('${folder.id}' in parents) or `,
            ``
          )
          .slice(0, -4)})`;
        let response = await gapi.client.drive.files.list({
          q: q,
          pageSize: 1000,
          fields:
            "nextPageToken, files(id, name, thumbnailLink, fileExtension, md5Checksum, size, imageMediaMetadata)",
        });
        imageData.push(...response.result.files);
      }
      if (images && images.length) {
        for (let index = 0; index < images.length; index++) {
          let response = await gapi.client.drive.files.get({
            fileId: images[index].id,
            fields:
              "id, name, thumbnailLink, fileExtension, md5Checksum, size, imageMediaMetadata",
          });
          imageData.push(response.result);
        }
      }
      props.onGetImageData(imageData);
    }
  }

  function pick() {
    authenticate().then((auth) => {
      return showPicker(auth.access_token, onSelect);
    });
  }

  if (apiLoaded) {
    return (
      <div class="nice-padding">
        <button class="button bicolor icon icon-plus" onClick={pick}>
          Select an image or folder in Drive
        </button>
      </div>
    );
  } else {
    return (
      <div class="nice-padding">
        <LoadingSpinner message="Loading Google API" />
      </div>
    );
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
    duplicateReviewUrl={domContainer.dataset.duplicateReviewUrl}
  />,
  domContainer
);
